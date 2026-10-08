# training — fine-tuning Whisper

Everything for teaching Whisper your group's voices and names lives here.

```
training/
  data/      recorded clips + transcripts, written by the Discord bot   (gitignored)
  models/    fine-tuned models, built from data/                        (gitignored)
```

`data/` and `models/` are never committed: the clips are your players' voices. The training
scripts will be added to this folder — see `SPEC-whisper-fine-tuning.md` in the repository root
for the plan. Only collecting data works today.

## 1. Collect

In `discord-bot/.env`:

```
TRAINING_DATA_DIR=../training/data      # bot started locally with pnpm start
TRAINING_DATA_DIR=/training-data        # bot in Docker
```

Every line the bot writes to Foundry is then also saved here, one folder per session day:

```
data/2026-06-23/
  metadata.csv                        file_name,transcription
  183512044_Klovarek-Ukelstein.wav
  183514920_AngryBeaver.wav
```

Nothing is saved while recording is paused. Voice commands and filtered hallucinations are skipped.
Ask your players before you turn this on.

## 2. Correct

After a session, open that day's `metadata.csv`, listen to the clips and fix the `transcription`
column. Delete the rows and wav files of clips that are noise or unusable.

The corrected text is what Whisper learns from, so write names exactly as you want them
transcribed.

## 3. Train

Not built yet. Each day folder is a Hugging Face
[`audiofolder`](https://huggingface.co/docs/datasets/audio_dataset#audiofolder) dataset, so the
training script can load `data/` as it is and write the result to `models/`.
