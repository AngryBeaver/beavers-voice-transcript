# Spec: Whisper Fine-Tuning

## Goal

Fine-tune Whisper on the group's own voices and vocabulary (character names such as Yordri, Jasper, Klovareck) so transcripts are correct without relying on `WHISPER_INITIAL_PROMPT`.

---

## Why

Whisper does not know the campaign's names. The current workaround is `WHISPER_INITIAL_PROMPT`, which Whisper echoes back on silence or noise ("Jörg, Jasper, Klovareck, Discord"). The echoes are now filtered in `discord-bot/src/hallucination.ts`, but a model that knows the names removes the cause.

---

## Status

| Part | State |
|---|---|
| Collecting clips + transcripts | Done — `saveTrainingPair` in `discord-bot/src/voice.ts` |
| Correcting transcripts | Manual, per session |
| Training script | Not built |
| Conversion to CTranslate2 | Not built |
| Loading the model in the Whisper container | Not built, not verified |

---

## Already in place: data collection

Enabled in `discord-bot/.env` with `TRAINING_DATA_DIR=../training/data` (bot run locally) or `TRAINING_DATA_DIR=/training-data` (Docker; the compose files map it to `./training/data`).

```
training/data/2026-10-07/
  metadata.csv                        file_name,transcription
  183512044_Klovarek-Ukelstein.wav
```

- Clips are 48 kHz, 16-bit mono WAV, one per utterance
- Only speech that is written to Foundry is saved — nothing while paused, no commands, no filtered hallucinations
- The layout is a Hugging Face `audiofolder` dataset
- `training/data/` is excluded from git; all of `training/` is excluded from the Docker image

After each session: correct the `transcription` column in `metadata.csv` and delete rows and wav files that are noise.

---

## Changes Required

### 1. Training script (`training/`)

A Python project in `training/`, separate from the pnpm workspace and not part of the bot image. The scripts are committed; `training/data/` (clips) and `training/models/` (output) are not.

- Load every `training/data/*/` folder with `load_dataset("audiofolder")`
- Resample to 16 kHz (Whisper's input rate)
- Drop clips over 30 s and rows with an empty transcription
- Hold out about 10 % for evaluation, split by session day so the same evening is not in both sets
- Base model: `openai/whisper-large-v3-turbo`, language `de`, task `transcribe`
- Train with LoRA (Hugging Face PEFT), base model loaded in 8-bit — full fine-tuning does not fit the available 8 GB GPU
- Report word error rate on the held-out set for the base model and the fine-tuned model
- Merge the LoRA weights into the base model and save it in Hugging Face format

### 2. Conversion

Convert the merged model for the `faster_whisper` engine:

```
ct2-transformers-converter --model <merged-model> --output_dir training/models/dnd-whisper --quantization float16
```

`training/models/` is already in `.gitignore`.

### 3. Whisper container (`discord-bot-compose.yml`)

```yaml
whisper:
  environment:
    - ASR_MODEL=/models/dnd-whisper
    - ASR_ENGINE=faster_whisper
  volumes:
    - ./training/models/dnd-whisper:/models/dnd-whisper
```

Keep `ASR_MODEL=${WHISPER_MODEL:-large-v3-turbo}` as the default so a path can be set through `WHISPER_MODEL` in `.env`. Setting it back to `large-v3-turbo` is the rollback.

### 4. Discord bot

No code changes. Once the model knows the names, shorten or remove `WHISPER_INITIAL_PROMPT`.

---

## Constraints

- **GPU:** 8 GB. Stop the Whisper container while training; it uses the same card.
- **Privacy:** the clips are the players' voices. Get their consent before collecting, and train locally. A rented cloud GPU or Colab is the fallback only if 8 GB turns out too tight.
- **CPU compose file:** `discord-bot-compose.cpu.yml` uses the `openai_whisper` engine, which cannot load a CTranslate2 model. Fine-tuned models are for the GPU setup only.

---

## Open Questions

- **Does `ASR_MODEL` accept a local folder?** faster-whisper does, but whether `onerahmet/openai-whisper-asr-webservice:v1.7.1-gpu` passes the value through unchanged is unverified. Check this first with the stock model converted to a local folder, before any training.
- **How much data is enough?** Unknown. One session yields roughly 1,000–1,400 clips. Start after three or four corrected sessions and let the held-out error rate decide.
- **Does the LoRA run really fit in 8 GB for turbo?** The PEFT Whisper example trains `large-v2` in under 8 GB, so it should, but it is untested on this machine.
- **Does fine-tuning on one group hurt general German?** Compare base and fine-tuned error rates on the held-out set, and listen to a session before switching over for good.

---

## Out of Scope

- Hotwords or a different Whisper server
- A post-transcription correction list for names
- Tooling for correcting `metadata.csv` (a spreadsheet or text editor is enough for now)
