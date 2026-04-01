# Beaver's AI Assistant — Foundry VTT Module
![Latest Release](https://img.shields.io/github/v/release/AngryBeaver/beavers-voice-transcript)
![Foundry Core Compatible Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dflat%26url%3Dhttps%3A%2F%2Fgithub.com%2FAngryBeaver%2Fbeavers-voice-transcript%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![Foundry Systems](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Draw%26showVersion%3D1%26style%3Dflat%26url%3Dhttps%3A%2F%2Fraw.githubusercontent.com%2FAngryBeaver%2Fbeavers-voice-transcript%2Fmain%2Fmodule.json)
![Download Count](https://img.shields.io/github/downloads/AngryBeaver/beavers-voice-transcript/total?color=green)

![AI Powered](https://img.shields.io/badge/AI-Claude-blueviolet)
![Voice ASR](https://img.shields.io/badge/Voice%20ASR-Whisper-green)
![Local LLM](https://img.shields.io/badge/Local%20LLM-Mistral-blue)
![Setup Complexity](https://img.shields.io/badge/setup%20complexity-5%2F5-red)

An AI assistant is only as useful as the context it has. If a GM has to stop mid-session to explain who the party is, what just happened, and what the NPC's personality is — the AI is more burden than help.

This module solves that. It listens to your sessions via Discord, transcribes everything, and feeds that history directly into the AI. By the time you ask it anything, it already knows what is going on.

Two features work together to make this possible:

1. **Voice Transcript** — records spoken dialogue from your game sessions and writes it to Foundry Journal entries in real time via a companion Discord bot.
2. **AI GM Window** — a GM-only panel that reads the current game state and suggests persona-accurate NPC responses, building a persistent picture of the campaign over time.

---
## ⚠️ Setup ⚠️

<div style="background-color: #171713; border-left: 4px solid #e68a00; padding: 15px; margin: 10px 0; border-radius: 4px;">

**⚠️ High Complexity Warning ⚠️**
This module is aimed at skilled people who are comfortable with servers, Docker, APIs, and self-hosted infrastructure. If you have no idea what the requirements listed below are, **this module is not for you**.
</div>
For everyone else: feed this documentation to your AI of choice (ChatGPT, Claude, etc.) and it will likely be able to guide you through the setup.


### Zero API Cost Setup (Crush it with Hardware)

You do NOT need to pay for any AI service if you have sufficient NVIDIA GPUs.

If you have:
- Two NVIDIA GPUs with ≥ 8 GB VRAM each (one for Whisper, one for LocalAI)
- ONE NVIDIA GPUs with ≥ 16 GB VRAM (run Whisper and LocalAI)

### Requirements

| Requirement                        | Details                                                                                                                         |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| **Own discord server**             | The voice transcript feature uses a Discord bot in your own server to capture session audio. You need admin rights to add bots. |
| **Local Docker environment**       | Whisper ASR + LocalAI run in Docker containers. You need Docker installed and running.                                          |
| **NVIDIA GPU #1 with ≥ 8 GB VRAM** | **Required** for real-time speech-to-text (Whisper `medium` or larger). CPU is too slow for live sessions.                      |
| **NVIDIA GPU #2 with ≥ 8 GB VRAM** | **(Option A)** For free LocalAI LLM                                                                                             |
| **Anthropic API key**              | **(Option B)** If you do not have enought hardware or you want better models results                                            |

See [Docker Setup Guide](../DOCKER-SETUP.md).

The module has two features with separate dependencies:

- **Voice Transcript** — requires Discord bot + Docker + Whisper + **GPU #1**
- **AI GM Window** — requires Claude API key **OR** Docker + LocalAI + **GPU #2**

---

## Voice Transcript

To get transcription working you need:

- A **voice bot** that captures audio, transcribes it, and sends it here via the client library.
  The companion Discord bot in this repo does exactly that: [`discord-bot/`](../discord-bot/README.md)
- A running **[Whisper ASR](https://github.com/ahmetoner/whisper-asr-webservice)** instance for speech-to-text.
  Whisper runs in Docker. For anything beyond the `base` model you will want a dedicated **NVIDIA GPU** — CPU transcription at `medium` or larger is too slow for real-time use.
  See the [Discord bot README](../discord-bot/README.md) for Docker setup and model guidance.

### What it does

1. Auto-creates a dedicated **ai-assistant** Foundry user (role: Assistant GM) on first load.
2. Opens a `socket.io` channel that authenticated external tools can connect to.
3. Accepts transcript lines from the voice bot and appends them to a dated Journal entry.
4. Exposes a full Journal API — list, read, write, and append pages.

### Setup

On first load the module automatically creates the **ai-assistant** user. Its credentials are shown under:

> **Settings → Configure Settings → Beaver's AI Assistant → Connection Info**

Copy the **User ID** and **Password** into your bot's `.env` file (`FOUNDRY_USER` / `FOUNDRY_PASS`). The password can be regenerated any time from the same screen.

### Socket API

External tools connect via `socket.io-client` on the `module.beavers-ai-assistant` channel.

#### Request / Response format

```json
{ "id": "<uuid>", "action": "<action>", "args": [...] }
{ "id": "<uuid>", "data": <result> }
{ "id": "<uuid>", "error": "<message>" }
```

#### Actions

| Action | Args | Returns |
|---|---|---|
| `listJournals` | `[folder?]` | Folders and journals in root or given folder |
| `readJournal` | `[identifier]` | Full journal object with all pages |
| `writeJournal` | `[JournalData]` | Created/updated journal |
| `writeJournalPage` | `[journalIdentifier, JournalPageData]` | Created/updated page |
| `appendJournalPage` | `[journalIdentifier, pageName, html, maxPageBytes?]` | Appends HTML; auto-rotates page at size limit |
| `writeSessionData` | `[html, pageName?, maxPageBytes?]` | Appends HTML to today's session journal; creates journal if needed |

#### Using the npm client

```ts
import { BeaversClient } from 'beavers-voice-transcript-client';

const client = new BeaversClient({
  url: 'http://localhost:30000',
  userId: '<ai-assistant user ID>',
  password: '<ai-assistant password>',
});

await client.connect();
await client.appendJournalPage('Session Log', 'Transcript', '<p><strong>Ada:</strong> We go left.</p>');
await client.disconnect();
```

See the [`client/`](../client) package for full API documentation.

---

## AI GM Window

A GM-only panel that acts as a narrative co-pilot. Press **Interact** and the AI reads the current game state, presents 1–3 candidate interactions for the GM to confirm, then streams a persona-accurate NPC response.

Accepted responses are stored in actor flags so the AI builds a persistent picture of NPCs and their history with the party over time.

### Requirements

Choose **one** AI service:

| Service | Cost | Setup | Quality | Speed |
|---|---|---|---|---|
| **Claude (Anthropic API)** | $1–5/month | API key | Excellent | Real-time |
| **LocalAI (Docker)** | $0 (electricity) | Docker container | Good | Medium (30–60 sec) |

- Session journals written by the Discord bot (or manually) in the format `YYYY-MM-DD — Session`

### Setup

1. **Start your AI service:**
   - **Claude:** Create an account at [anthropic.com](https://anthropic.com) and get an API key.
   - **LocalAI:** See [Docker Setup Guide](../DOCKER-SETUP.md) — run LocalAI in Docker on your Foundry PC.

2. **Configure the module:**

Under **Settings → Configure Settings → Beaver's AI Assistant → AI Assistant → Configure**:

| Setting | Claude | LocalAI |
|---|---|---|
| **AI Provider** | Claude (Anthropic API) | Local AI (Docker) |
| **Claude API Key** | Your Anthropic API key | *(not needed)* |
| **Local AI URL** | *(not needed)* | `http://localhost:8000` |
| **Claude Model** | `claude-sonnet-4-6` (or other Claude model) | `mistral` (or your loaded model) |
| **Session Journal Folder** | Folder with session journals | Folder with session journals |
| **Session History Messages** | How many recent entries to include (default: 30) | How many recent entries to include (default: 30) |
| **Adventure Journal Folder** | (Optional) Pre-written adventure journals | (Optional) Pre-written adventure journals |
| **Lore Index Journal Name** | Name for the built index (default: `AI Lore Index`) | Name for the built index (default: `AI Lore Index`) |

### Lore Index (optional, pre-written adventures)

If you are running a published or pre-written adventure, click **Build Lore Index** in settings. The AI reads all your adventure journals and produces a compact structured index (NPCs, locations, factions) that is included in every Interact call. This keeps token costs low and gives the AI a stable world map to reason from.

---

## Installation

Install via the Foundry module browser or paste the manifest URL directly:

```
https://github.com/AngryBeaver/beavers-voice-transcript/releases/latest/download/module.json
```

**Required dependencies** (install via Foundry module browser):
- `socketlib`

> **A Gamemaster must be connected** for the socket API and AI GM Window to function.

---

## AI-Assisted Development

This project's code was generated entirely by AI (Claude). No production code was written by hand.

All decisions — architecture, feature specifications, behaviour, and design — were made by the human author. Every line of generated code was reviewed, approved, and is understood by the author before being accepted into the project. The AI acted as a tool under human direction, not as an autonomous author.

The MIT license and copyright apply in full to this project.

---

## Development

```bash
cd foundry
pnpm install
pnpm run build       # compile TypeScript → dist/
pnpm run watch       # watch mode
pnpm run devbuild    # build directly into your local Foundry module directory
pnpm run devwatch    # watch mode into Foundry module directory
pnpm run release     # build + zip → package/
```

Set `devDir` in `package.json` to your local Foundry Data path for `devbuild` / `devwatch`.