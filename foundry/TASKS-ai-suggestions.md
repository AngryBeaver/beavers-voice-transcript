# Tasks: AI GM Window

Build order for `SPEC-ai-suggestions.md`. Each step is independently testable before moving to the next.

---

## Step 1 — Settings ✅

Two custom `ApplicationV2` settings apps, each opened via a **Configure** menu button. No `config: true` inline fields.

**`definitions.ts`**
- [x] Export `HOOKS.VOICE_TRANSCRIPT_ENABLED_CHANGED` hook name constant
- [x] Add `SETTINGS.VOICE_TRANSCRIPT_ENABLED`, `SETTINGS.AI_ASSISTANT_ENABLED`
- [x] Add all other setting keys: `sessionJournalFolder`, `claudeApiKey`, `claudeModel`, `sessionHistoryMessages`, `adventureJournalFolder`, `adventureIndexJournalName`
- [x] Export `SUMMARY_JOURNAL_NAME = 'AI-Summary'` as a fixed constant — summary journal always lives at `{sessionFolder}/AI-Summary`; not a setting

**`apps/settings/VoiceTranscriptSettingsApp.ts`**
- [x] Enable toggle, AI Assistant Connection section (FOUNDRY_USER, FOUNDRY_PASS, copy buttons, Regenerate), Session Folder
- [x] On save: fires `HOOKS.VOICE_TRANSCRIPT_ENABLED_CHANGED` when enabled state changes

**`apps/settings/AiAssistantSettingsApp.ts`**
- [x] Enable toggle, AI Tool section (API key, model), Session section (context size + VT warning notice), Adventure section (folder, index name)

**`apps/settings/Settings.ts`** (registration only — no app logic)
- [x] All settings registered as `config: false`; two `registerMenu` buttons only
- [x] `Settings.isConfigured()` returns true only when `aiAssistantEnabled && claudeApiKey` is set
- [x] `Settings.isVoiceTranscriptEnabled()` helper

**`beavers-ai-assistant.ts`**
- [x] `ready` hook: only calls `ensureAiAssistantUser()` + `SocketApi.start()` when `voiceTranscriptEnabled` is true
- [x] `Hooks.on(HOOKS.VOICE_TRANSCRIPT_ENABLED_CHANGED, ...)`: starts or stops socket and user at runtime without requiring reload
---

## Step 2 — Panel skeleton ✅

- [x] Create `AiGmWindow.ts` as a GM-only `ApplicationV2` window
- [x] Create Scene Control button / keybind setting to open the AiGmWindow (only GMs can see that button)
- [x] SceneControl button / keybind will notify an error when not (`ApiSettings.isConfigured()` is true (`aiAssistantEnabled && claudeApiKey` set)).
- [x] Renders top-level controls: **Session Summary** , **Interact** button visible only when `ApiSettings.isVoiceTranscriptEnabled()` is true
- [x] When Interact is hidden: show inline notice "Voice Transcript is not enabled — Interact requires a live session feed. Configure Voice Transcript to enable."
- [x] Empty response area below controls (placeholder)
- [x] Window closes with [X]
- [x] No AI logic yet — just layout and wiring

---

## Step 3 — Context assembly

- [x] Create `ContextBuilder.ts`
- [x] Reads active scene name + GM notes from `game.scenes.active`
- [x] Reads last N session journal entries (N from `sessionHistoryMessages` setting)
- [x] Reads latest page of `AI-Summary` journal in the session folder (path: `{sessionJournalFolder}/AI-Summary`)
- [x] Reads all actors from `game.actors` (name, type, description) — general world context; actor flags are persona-only and are NOT read here
- [x] If lore index is configured: reads lore index journal for NPC/location/faction entries; if not configured, falls back to keyword-scored raw lore pages
- [x] Returns assembled prompt string
- [x] Handles missing/empty sources gracefully (missing scene notes, no summary yet, no actors, no lore)
- [x] Write unit tests in `ContextBuilder.test.ts` — `GameData` injected via constructor, no `vi.stubGlobal` needed (20 tests passing)

---

## Step 4 —Infer current interaction

- [ ] Create `ClaudeApi.ts` with a `call()` method
- [ ] On **Interact** press: send assembled context to Claude; ask Claude to infer what is currently happening and who the party is interacting with — returns 1–3 candidates (NPC name + what the party is asking or doing)
- [ ] Replace response area with candidate list
- [ ] GM selects one to confirm before proceeding
- [ ] If only one candidate, still require GM confirmation

---

## Step 5 — Persona resolution

- [ ] Create `PersonaResolver.ts`
- [ ] Look up `game.actors` for actor matching the confirmed NPC name
- [ ] **Actor exists + flag exists** → persona already known; proceed directly to Step 6
- [ ] **Actor exists + no flag + lore match** → Claude generates a persona based on the lore description; show persona summary to GM for approval; on GM approval write to `flags["beavers-ai-assistant"]`
- [ ] **Actor exists + no flag + no lore match** → Claude infers a persona from general context (current scene, location, recent session history); show persona summary to GM for approval; on GM approval write to flag
- [ ] **No actor + lore match** → same as above but also create the NPC actor on GM approval; show inline notification "Actor created: [name]"
- [ ] **No actor + no lore match** → Claude generates persona from general context; GM approves; create actor and write flag
- [ ] Persona approval UI: show generated persona in panel, **Approve** and **Edit** buttons; Edit opens an inline text area for GM to adjust before saving

---

## Step 6 — NPC response

- [ ] Call Claude with confirmed interaction + resolved persona + assembled context; ask what this NPC would say
- [ ] Display response in the panel
- [ ] Show persona header (NPC name) above the response text

---

## Step 7 — Adjust and accept

- [ ] Show adjustment buttons once response is complete:
  - **colder** — more hostile tone
  - **warmer** — more openly welcoming
  - **shorter** — shorter, less detail
  - **details** — more colour, dialect, gesture
  - **info** — increase NPC awareness by one degree
  - **trash** — decrease NPC awareness by one degree; at lowest, mildly misleading
  - **Regenerate** — full re-call, same context, no modifier
- [ ] Each adjustment re-calls Claude with the modifier appended; response replaces current text in place; cache context from the last Interact press (do not reassemble)
- [ ] Show **Accept** button alongside adjustment buttons
- [ ] On **Accept**: write response to session journal via `writeSessionData` with `[AI suggestion | ActorName]` marker and actor ID; append to `pcHistory`; response area stays visible; cleared on next Interact press

---

## Step 8 — Session summary

- [ ] Create `SessionSummary.ts`
- [ ] On module startup: find all journals in `sessionJournalFolder` without `flags["beavers-ai-assistant"].summarized: true`, skip the journal whose name starts with today's ISO date, summarise the rest
- [ ] Write summary as a new dated page in the `AI-Summary` journal inside the session folder
- [ ] Mark processed journals with `summarized: true` flag
- [ ] **Session Summary** button in panel triggers or shows the latest summary
- [ ] Write unit tests in `SessionSummary.test.ts`

---

## Step 9 — Lore index (hierarchical, scene-aware)

### Build phase
- [ ] Add **Build Lore Index** button to module settings
- [ ] On click: read all pages in `adventureJournalFolder`, send to Claude in a single call
- [ ] Claude produces hierarchical index structure:
  ```
  ## Part 1: The Arrival

  ### Overview
  [summary of the part]

  ### Scene 1: The Road to Millhaven
  #### Summary
  [scene summary]

  #### NPCs Present
  - Aldric the Innkeeper — gruff, loyal
  - Guard Captain — stern, duty-bound

  #### Locations
  - Millhaven (town, safe)
  - Ashwood (forest, dangerous)

  #### Factions
  - Red Tooth Goblins (threat)

  ### Scene 2: The Innkeeper's Secrets
  [etc.]

  ## World (Global Context)

  ### All NPCs
  [complete list with descriptions]

  ### All Locations
  [complete list]

  ### All Factions
  [complete list]
  ```
- [ ] Write index as a page in `adventureIndexJournalName`
- [ ] Add **Rebuild** button alongside Build — same flow, overwrites existing index

### UI phase
- [ ] Add scene selector to AI GM Window: dropdown/buttons listing all scenes from lore index ("Scene 1: The Road...", "Scene 2: ...", etc.)
- [ ] GM clicks to confirm which scene they are currently in — selection is cached until changed
- [ ] Selected scene name displayed above the Interact button for context

### Context filtering phase
- [ ] Extend `ContextBuilder.build()` to accept optional `selectedScene` parameter
- [ ] If `selectedScene` is set and lore index exists:
  - Extract that scene's section (Summary, NPCs, Locations, Factions)
  - Include scene-specific context (high relevance, ~1,000 tokens)
  - Include the part's overview
  - Include global World section (NPCs, Locations, Factions lists)
  - Total lore budget: ~2,000 tokens (much tighter than flat index)
- [ ] If no scene selected or no lore index: fall back to keyword-scored raw pages (budget: ~4,000 tokens)
- [ ] If `adventureJournalFolder` is not configured, omit lore from context entirely

---

## Vitest setup (do before Step 3)

- [x] Add `vitest` to `foundry/package.json` devDependencies
- [x] Add `"test": "vitest run"` script to `foundry/package.json`
- [x] Confirm `pnpm test` works in the `foundry/` directory

---

## GitHub Actions — CI

- [x] Add `test-foundry` job to `.github/workflows/lint.yml`
- [x] Trigger on push and pull request to `main`
- [x] Steps: checkout → install pnpm → `pnpm install` → `pnpm test`
- [x] Fail the workflow if any vitest test fails