# beavers-ai-assistant-client

Node.js client library for the [Beavers AI Assistant](https://github.com/AngryBeaver/beavers-ai-assistant) Foundry VTT module.

Allows external tools and AI agents to read and write Foundry VTT journal entries over a socket connection.

## Requirements

- The **Beavers AI Assistant** module must be installed and running in Foundry VTT.
- A **Gamemaster must be connected** to the Foundry instance for the API to function.
- A dedicated AI-Assistant user must be configured in the module settings (see Connection Info).

## Installation

```bash
npm install beavers-ai-assistant-client
```

## Usage

```js
import { BeaversClient } from "beavers-ai-assistant-client";

const client = new BeaversClient({
  url: "http://localhost:30000",
  userId: "<userId from module Connection Info>",
  password: "<password from module Connection Info>",
});

await client.connect();

const journals = await client.listJournals();
const entry = await client.readJournal("My Journal");

await client.writeJournal({ name: "My Journal", content: "<p>Hello</p>" });
await client.writeJournalPage("My Journal", { name: "Page 1", text: { content: "<p>Hello</p>" } });

await client.disconnect();
```

## API

### `new BeaversClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | — | Foundry base URL, e.g. `http://localhost:30000` |
| `userId` | `string` | — | AI-Assistant user ID from module Connection Info |
| `password` | `string` | — | AI-Assistant password from module Connection Info |
| `timeout` | `number` | `10000` | Request timeout in ms |

### `connect()` → `Promise<void>`

Authenticates with Foundry and opens the socket connection. Must be called before any API method.

### `disconnect()` → `Promise<void>`

Closes the socket connection.

### `listJournals(folder?)` → `Promise<object[]>`

Lists journal entries and subfolders. Omit `folder` to list from the root.

### `readJournal(identifier)` → `Promise<object>`

Reads a journal entry by name or ID.

### `writeJournal(data)` → `Promise<object>`

Creates or updates a journal entry.

### `writeJournalPage(journalIdentifier, pageData)` → `Promise<object>`

Creates or updates a page inside a journal entry.

## CLI

A CLI is included for quick scripting via an `.env` file:

```bash
# .env
FOUNDRY_URL=http://localhost:30000
FOUNDRY_USER=<userId>
FOUNDRY_PASS=<password>
```

```bash
npx beavers-client listJournals
npx beavers-client listJournals "My Folder"
npx beavers-client readJournal "My Journal"
npx beavers-client writeJournal '{"name":"My Journal","content":"<p>Hello</p>"}'
npx beavers-client writeJournalPage "My Journal" '{"name":"Page 1","text":{"content":"<p>Hi</p>"}}'
```

## License

MIT