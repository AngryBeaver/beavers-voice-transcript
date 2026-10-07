import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
  VoiceConnection,
  VoiceReceiver,
} from '@discordjs/voice';
import * as prism from 'prism-media';
import { VoiceBasedChannel } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { transcribe } from './whisper.js';
import { transcribeJournal, showChatBubble } from './foundry.js';
import { detectCommand } from './commands.js';
import { isHallucination } from './hallucination.js';

const TRAINING_DATA_DIR = process.env.TRAINING_DATA_DIR ?? '';
const TRAINING_METADATA_FILE = 'metadata.csv';

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\s+/g, ' ')}"`;
}

/**
 * Save the clip and its transcript for Whisper fine-tuning. Each day gets a folder
 * of wav files plus a metadata.csv (file_name,transcription) to correct by hand —
 * the layout Hugging Face's "audiofolder" dataset loader reads directly.
 */
async function saveTrainingPair(
  speakerName: string,
  wav: Buffer,
  transcript: string,
): Promise<void> {
  if (!TRAINING_DATA_DIR) return;
  const now = new Date().toISOString();
  const dir = path.join(TRAINING_DATA_DIR, now.slice(0, 10));
  await fs.promises.mkdir(dir, { recursive: true });

  const time = now.slice(11, 23).replace(/[:.]/g, '');
  const speaker = speakerName.replace(/[^\p{L}\p{N}]+/gu, '-');
  const fileName = `${time}_${speaker}.wav`;
  await fs.promises.writeFile(path.join(dir, fileName), wav);

  const metadataPath = path.join(dir, TRAINING_METADATA_FILE);
  const header = fs.existsSync(metadataPath) ? '' : 'file_name,transcription\n';
  await fs.promises.appendFile(
    metadataPath,
    `${header}${csvField(fileName)},${csvField(transcript)}\n`,
    'utf8',
  );
}

const SILENCE_TIMEOUT_MS = 1000;
// At 48000 Hz, 16-bit mono: 96 bytes per millisecond of PCM
const BYTES_PER_MS = 96;
const WAV_HEADER_BYTES = 44;
const MIN_AUDIO_MS = parseInt(process.env.WHISPER_MIN_AUDIO_MS ?? '500', 10);
const MIN_WAV_BYTES = MIN_AUDIO_MS * BYTES_PER_MS + WAV_HEADER_BYTES;

let connection: VoiceConnection | null = null;
let isRecording = false;

export async function joinAndListen(channel: VoiceBasedChannel): Promise<void> {
  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  console.log(`[Voice] Joined channel: ${channel.name}`);
  console.log('[Voice] Paused — waiting for start command');

  const receiver = connection.receiver;
  const activeUsers = new Set<string>();

  receiver.speaking.on('start', (userId) => {
    if (activeUsers.has(userId)) return;
    activeUsers.add(userId);
    const user = channel.guild.members.cache.get(userId)?.displayName ?? userId;
    listenToUser(receiver, userId, user, () => activeUsers.delete(userId));
  });
}

function listenToUser(
  receiver: VoiceReceiver,
  userId: string,
  displayName: string,
  onDone: () => void,
): void {
  let done = false;
  const cleanup = () => {
    if (!done) {
      done = true;
      onDone();
    }
  };

  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_TIMEOUT_MS },
  });

  opusStream.on('error', (err) => {
    console.warn(`[Voice] Opus stream error for ${displayName}: ${err.message}`);
    cleanup();
  });

  const pcmStream = opusStream.pipe(
    new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 }),
  );

  pcmStream.on('error', (err) => {
    console.warn(`[Voice] PCM stream error for ${displayName}: ${err.message}`);
    cleanup();
  });

  buildWavBuffer(pcmStream, async (buffer) => {
    try {
      if (buffer.length < MIN_WAV_BYTES) return;

      const transcript = await transcribe(buffer);
      if (!transcript) return;

      const command = detectCommand(transcript);

      // a command may legitimately repeat words from WHISPER_INITIAL_PROMPT
      if (!command && isHallucination(transcript)) {
        console.log(`[Voice] Filtered hallucination from ${displayName}: "${transcript}"`);
        return;
      }

      if (command) {
        switch (command.type) {
          case 'start':
            isRecording = true;
            console.log('[Bot] Recording STARTED — writing to Foundry');
            break;
          case 'pause':
            isRecording = false;
            console.log('[Bot] Recording PAUSED — console only');
            break;
        }
        return; // commands are never written to Foundry or the transcript log
      }

      if (isRecording) {
        console.log(`[${displayName}]: ${transcript}`);
        await Promise.all([
          transcribeJournal(displayName, transcript),
          showChatBubble(displayName, transcript),
          saveTrainingPair(displayName, buffer, transcript),
        ]);
      } else {
        console.log(`[PAUSED] [${displayName}]: ${transcript}`);
      }
    } catch (err) {
      console.error(`[Voice] Processing error for ${displayName}: ${(err as Error).message}`, err);
    } finally {
      cleanup();
    }
  });
}

interface WavOptions {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

function buildWavBuffer(
  pcmStream: NodeJS.ReadableStream,
  onComplete: (buffer: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  pcmStream.on('data', (chunk: Buffer) => chunks.push(chunk));
  pcmStream.on('end', () => {
    const pcm = Buffer.concat(chunks);
    onComplete(pcmToWav(pcm, { sampleRate: 48000, channels: 1, bitDepth: 16 }));
  });
}

function pcmToWav(pcm: Buffer, { sampleRate, channels, bitDepth }: WavOptions): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export function leave(): void {
  if (connection) {
    connection.destroy();
    connection = null;
    console.log('[Voice] Left voice channel');
  }
}
