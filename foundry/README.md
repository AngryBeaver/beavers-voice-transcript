# Beaver's Voice Transcript — Foundry VTT Module
![Latest Release](https://img.shields.io/github/v/release/AngryBeaver/beavers-voice-transcript)
![Foundry Core Compatible Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dflat%26url%3Dhttps%3A%2F%2Fgithub.com%2FAngryBeaver%2Fbeavers-voice-transcript%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![Download Count](https://img.shields.io/github/downloads/AngryBeaver/beavers-voice-transcript/total?color=green)

![Voice ASR](https://img.shields.io/badge/Voice%20ASR-Whisper-green)

Records spoken dialogue from your game sessions and writes it to Foundry Journal entries in real time via a companion Discord bot.

The transcripts are plain journals, so they are useful on their own. The [beavers-ai-assistant](https://github.com/AngryBeaver/beavers-ai-assistant) module can read them as session context for its AI GM Window.

---

## Requirements

| Requirement                     | Details                                                                                                      |
|---------------------------------|--------------------------------------------------------------------------------------------------------------|
| **Own discord server**          | The Discord bot captures session audio in your own server. You need admin rights to add bots.                |
| **Local Docker environment**    | Whisper ASR runs in a Docker container. You need Docker installed and running.                               |
| **NVIDIA GPU with ≥ 8 GB VRAM** | **Required** for real-time speech-to-text (Whisper `medium` or larger). CPU is too slow for live sessions.   |

See [Docker Setup Guide](../DOCKER-SETUP.md).

To get transcription working you need:

- A **voice bot** that captures audio, transcribes it, and sends it here via the client library.
  The companion Discord bot in this repo does exactly that: [`discord-bot/`](../discord-bot/README.md)
- A running **[Whisper ASR](https://github.com/ahmetoner/whisper-asr-webservice)** instance for speech-to-text.
  Whisper runs in Docker. For anything beyond the `base` model you will want a dedicated **NVIDIA GPU** — CPU transcription at `medium` or larger is too slow for real-time use.
  See the [Discord bot README](../discord-bot/README.md) for Docker setup and model guidance.

## What it does

1. Auto-creates a dedicated **ai-assistant** Foundry user (role: Assistant GM) on first load.
2. Opens a `socket.io` channel that authenticated external tools can connect to.
3. Accepts transcript lines from the voice bot and appends them to a dated Journal entry in the `beavers-ai-assistant/session` journal folder.
4. Shows each spoken line as a chat bubble on the speaker's token.
5. Exposes a Journal and Actor API — list, read, write, and append pages; read compendium and world actors.

## Setup

On first load the module automatically creates the **ai-assistant** user. Its credentials are shown under:

> **Settings → Configure Settings → Beaver's Voice Transcript → Voice Transcript → Configure**

Copy the **User ID** and **Password** into your bot's `.env` file (`FOUNDRY_USER` / `FOUNDRY_PASS`). The password can be regenerated any time from the same screen.

**Discord GM Username** — the Discord display name of the GM. When the GM speaks, the chat bubble appears on the GM's currently selected NPC token instead of a character by that name.

## Socket API

External tools connect via `socket.io-client` on the `module.beavers-voice-transcript` channel.

### Request / Response format

```json
{ "id": "<uuid>", "action": "<action>", "args": [...] }
{ "id": "<uuid>", "data": <result> }
{ "id": "<uuid>", "error": "<message>" }
```

### Actions

| Action | Args | Returns |
|---|---|---|
| `gmPresent` | `[]` | `{ present }` — whether a GM is connected |
| `listJournals` | `[folder?]` | Folders and journals in root or given folder |
| `readJournal` | `[identifier]` | Full journal object with all pages |
| `writeJournal` | `[JournalData]` | Created/updated journal |
| `writeJournalPage` | `[journalIdentifier, JournalPageData]` | Created/updated page |
| `appendJournalPage` | `[journalIdentifier, pageName, markdown, maxPageBytes?]` | Appends markdown; auto-rotates page at size limit |
| `transcribeJournal` | `[msg, nameOrId]` | Appends a spoken line to today's session journal |
| `chatBubble` | `[nameOrId, message, options?]` | Shows a speech bubble on the matching token |
| `listCompendiumActors` | `[packId?]` | Actor summaries from one or all Actor packs |
| `queryCompendiumActor` | `[name, packId?]` | Full actor document from a compendium |
| `readWorldActor` | `[nameOrId]` | Full world actor document |
| `deleteWorldActor` | `[nameOrId]` | `true` if the actor was deleted |

### Using the npm client

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

## Installation

Install via the Foundry module browser or paste the manifest URL directly:

```
https://github.com/AngryBeaver/beavers-voice-transcript/releases/latest/download/module.json
```

**Required dependencies** (install via Foundry module browser):
- `socketlib`

> **A Gamemaster must be connected** for the socket API to function.

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
