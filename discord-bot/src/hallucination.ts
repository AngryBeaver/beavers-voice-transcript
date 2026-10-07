// Pipe-separated phrases that Whisper hallucinates on silence/noise
const HALLUCINATION_PHRASES: string[] = (process.env.WHISPER_HALLUCINATION_FILTER ?? '')
  .split('|')
  .map((s) => collapseRepeats(toWords(s)).join(' '))
  .filter(Boolean);

const PROMPT_WORDS = toWords(process.env.WHISPER_INITIAL_PROMPT ?? '');

// A word group must repeat at least this often in a row to count as a loop
const MIN_LOOP_REPEATS = 3;
// Ignore loops of short interjections that people really say ("ja, ja, ja")
const MIN_LOOP_UNIT_CHARS = 5;
const MAX_LOOP_UNIT_WORDS = 4;
// Share of the transcript a loop or prompt echo must cover to be filtered
const MIN_COVERAGE = 0.6;
const MIN_ECHO_RUN = 3;

/** Lowercase and split into words, dropping punctuation. */
function toWords(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function collapseRepeats(words: string[]): string[] {
  return words.filter((word, i) => word !== words[i - 1]);
}

/** Matches a filter phrase, ignoring case, punctuation and repeated words. */
function isFilteredPhrase(words: string[]): boolean {
  if (!HALLUCINATION_PHRASES.length) return false;
  return HALLUCINATION_PHRASES.includes(collapseRepeats(words).join(' '));
}

/** Whisper stuck in a loop: "Jornal, Jornal, Jornal", "einen Schwer, einen Schwer, ..." */
function isRepetitionLoop(words: string[]): boolean {
  for (let size = 1; size <= MAX_LOOP_UNIT_WORDS; size++) {
    for (let start = 0; start + size * MIN_LOOP_REPEATS <= words.length; start++) {
      const unit = words.slice(start, start + size);
      if (unit.join('').length < MIN_LOOP_UNIT_CHARS) continue;

      let repeats = 1;
      while (unit.every((word, i) => words[start + repeats * size + i] === word)) repeats++;

      if (repeats >= MIN_LOOP_REPEATS && (repeats * size) / words.length >= MIN_COVERAGE) {
        return true;
      }
    }
  }
  return false;
}

/** Whisper repeating WHISPER_INITIAL_PROMPT instead of transcribing: "Jörg, Jasper, Klovareck, Discord" */
function isPromptEcho(words: string[]): boolean {
  if (PROMPT_WORDS.length < 2) return false;

  // Longest run of transcript words that follows the prompt's word order
  let longestRun = 0;
  for (let t = 0; t < words.length; t++) {
    for (let p = 0; p < PROMPT_WORDS.length; p++) {
      let run = 0;
      while (
        t + run < words.length &&
        p + run < PROMPT_WORDS.length &&
        words[t + run] === PROMPT_WORDS[p + run]
      ) {
        run++;
      }
      longestRun = Math.max(longestRun, run);
    }
  }
  if (longestRun >= Math.min(MIN_ECHO_RUN, PROMPT_WORDS.length)) return true;

  // Short transcript ending like the prompt: "Zerba, Klovareck, Discord"
  const tail = PROMPT_WORDS.slice(-2);
  const endsLikePrompt = tail.every((word, i) => words[words.length - 2 + i] === word);
  if (endsLikePrompt && words.length <= PROMPT_WORDS.length + 2) return true;

  const hits = words.filter((word) => PROMPT_WORDS.includes(word)).length;
  return hits >= MIN_ECHO_RUN && hits / words.length >= MIN_COVERAGE;
}

export function isHallucination(transcript: string): boolean {
  const words = toWords(transcript);
  if (!words.length) return true;
  return isFilteredPhrase(words) || isRepetitionLoop(words) || isPromptEcho(words);
}
