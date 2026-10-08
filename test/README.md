# beavers-voice-transcript — tests

Two things live here:

- **End-to-end test** (`e2e/`) — drives a real Foundry in headless Chrome
- **Manual client** (`client.mjs`) — call single socket API methods by hand

---

## End-to-end test

> **Local only.** The test needs your own licensed Foundry instance, its admin password and a
> local Chrome. It cannot run in CI and is deliberately not part of any GitHub workflow.

It logs in to Foundry's setup screen, creates a dedicated test world, enables the module, joins as
Gamemaster and as a player in two separate browser sessions, and then calls the module through the
real `beavers-voice-transcript-client` — the same way the Discord bot does.

What it checks:

- the module is active and requires no other module
- the external client can log in and reach the GM
- a chat bubble is shown to the GM **and** to players, including the emote style
- a chat bubble for an unknown token is ignored
- `transcribeJournal` writes one paragraph per spoken line

### Your personal setup

You need, on your own machine:

1. **A running Foundry v14** that is on its setup screen (no world open), with at least one game
   system installed.
2. **The module deployed into that Foundry.** Set `devDir` in `foundry/package.json` to your
   Foundry's `Data/modules` folder, then:
   ```bash
   cd foundry
   pnpm devbuild
   ```
3. **A built client:**
   ```bash
   cd client
   pnpm build
   ```
4. **Google Chrome** installed.
5. **`test/.env`** — copy `.env.example` and fill in your values. The file is gitignored; never
   commit it.
   ```env
   FOUNDRY_URL=http://localhost:30000
   FOUNDRY_ADMIN_KEY=your-foundry-admin-password
   ```

Optional settings (`E2E_WORLD_ID`, `E2E_SYSTEM_ID`, `E2E_KEEP_WORLD_RUNNING`, `E2E_HEADFUL`,
`CHROME_PATH`) are described in `.env.example`.

### Running

```bash
cd test
pnpm e2e
```

After changing module code, run `pnpm devbuild` in `foundry/` again first — the test uses whatever
is deployed in Foundry.

### What it does to your Foundry

- Creates the world `beavers-voice-transcript-e2e` on first run and reuses it afterwards. In that
  world it creates a player user, a scene, an actor and a token, and the module adds its
  `voice-transcript-api` user.
- Never opens or changes any other world. If another world is running, the test stops with an
  error instead of shutting it down.
- Returns Foundry to the setup screen when done, unless the test world was already running.
- Does not delete the test world. Remove it from Foundry's setup screen if you no longer want it.

---

## Manual client

A standalone Node.js client to manually test the module's socket API against a running Foundry instance.

> **A Gamemaster must be connected to the Foundry instance** before running any tests.

## Setup

```bash
cd test
npm install
cp .env.example .env
```

Edit `.env` with your Foundry credentials and (optionally) the module's API token:

```env
FOUNDRY_URL=http://localhost:30000
FOUNDRY_USER=Gamemaster
FOUNDRY_PASS=yourpassword
API_TOKEN=yourtoken
```

`API_TOKEN` can be left empty if you haven't set one in the module settings.

## Running

### npm scripts (recommended)

```bash
# List journals in root (no argument) or a specific folder
npm run list
npm run list -- "My Folder Name"

# Read a journal by name or ID
npm run read -- "My Journal Name"

# Create / update a journal
npm run write -- '{"name":"Test Journal","content":"hello"}'

# Create / update a page inside a journal
npm run write-page -- "My Journal Name" '{"name":"Page 1","text":{"content":"<p>hello</p>"}}'
```

### Or directly with node

```bash
node --env-file=.env client.mjs readJournal "My Journal Name"
node --env-file=.env client.mjs writeJournal '{"name":"Test","content":"hello"}'
node --env-file=.env client.mjs writeJournalPage "My Journal" '{"name":"p1","text":{"content":"<p>hi</p>"}}'
```

## How it works

1. POSTs to `/join` with your credentials to get a session cookie.
2. Connects a `socket.io-client` using that cookie.
3. Emits a request on `module.beavers-voice-transcript` with a correlation ID.
4. Waits for the response with the matching ID and prints the result.

Requires Node.js **v20.6+** (for `--env-file` support).
