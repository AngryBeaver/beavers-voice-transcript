import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { BeaversClient } from 'beavers-voice-transcript-client';
import {
  FOUNDRY_URL,
  MODULE_ID,
  enableModules,
  ensureWorldRunning,
  join,
  launchBrowser,
  newPage,
  sleep,
  stopWorld,
  waitForCanvas,
} from './foundry.mjs';

const TOKEN_NAME = 'Klovareck';
const PLAYER_NAME = 'E2E Player';
const SCENE_NAME = 'E2E Scene';
const KEEP_WORLD_RUNNING = process.env.E2E_KEEP_WORLD_RUNNING === 'true';

let browser;
let startedWorld = false;
/** GM browser page — a GM must be connected for the module's socket API to answer. */
let gm;
/** Player browser page, in its own session. */
let player;
/** External client, connected the same way the Discord bot connects. */
let client;

/** Record every chat bubble the page renders from now on. */
const recordBubbles = (page) =>
  page.evaluate(() => {
    window.__bubbles = [];
    window.__bubbleHook ??= Hooks.on('chatBubbleHTML', (token, html, message, options) => {
      window.__bubbles.push({ token: token.name, message, cssClasses: options?.cssClasses ?? [] });
    });
  });

const bubbles = (page) => page.evaluate(() => window.__bubbles);

async function waitForBubbles(page, count) {
  await page.waitForFunction((n) => window.__bubbles.length >= n, { timeout: 10_000 }, count);
  return bubbles(page);
}

describe('beavers-voice-transcript in Foundry', () => {
  async function teardown() {
    await client?.disconnect();
    if (!browser) return;
    // log everyone out first — Foundry does not return to setup while users are connected
    await player?.close().catch(() => {});
    await gm?.close().catch(() => {});
    if (startedWorld && !KEEP_WORLD_RUNNING) {
      await stopWorld(browser).catch((err) => console.log(`Could not stop world: ${err.message}`));
    }
    await browser.close();
    browser = undefined;
  }

  before(async () => {
    try {
      await setup();
    } catch (err) {
      // node:test skips the after hook when before fails — do not leave the world running
      await teardown();
      throw err;
    }
  });

  after(teardown);

  async function setup() {
    browser = await launchBrowser();
    startedWorld = await ensureWorldRunning(browser);

    gm = await newPage(browser, 'gm');
    await join(gm, 'Gamemaster');
    await enableModules(gm);
    // the module creates its API user when the GM is ready
    await gm.waitForFunction(() => !!game.users.getName('voice-transcript-api'), {
      timeout: 30_000,
    });

    const connection = await gm.evaluate(
      async (moduleId, tokenName, playerName, sceneName) => {
        if (!game.users.getName(playerName)) {
          await User.create({ name: playerName, role: CONST.USER_ROLES.PLAYER });
        }
        let scene = game.scenes.getName(sceneName);
        if (!scene) {
          scene = await Scene.create({
            name: sceneName,
            width: 2000,
            height: 2000,
            tokenVision: false,
          });
        }
        if (!scene.active) await scene.activate();
        if (!scene.tokens.getName(tokenName)) {
          const actorType = Object.keys(CONFIG.Actor.dataModels)[0] ?? game.documentTypes.Actor[1];
          const actor =
            game.actors.getName(tokenName) ??
            (await Actor.create({ name: tokenName, type: actorType }));
          await scene.createEmbeddedDocuments('Token', [
            { name: tokenName, actorId: actor.id, x: 900, y: 900 },
          ]);
        }
        if (canvas.scene?.id !== scene.id) await scene.view();
        return {
          userId: game.users.getName('voice-transcript-api').id,
          password: game.settings.get(moduleId, 'apiUserPassword'),
        };
      },
      MODULE_ID,
      TOKEN_NAME,
      PLAYER_NAME,
      SCENE_NAME,
    );
    await waitForCanvas(gm);

    player = await newPage(await browser.createBrowserContext(), 'player');
    await join(player, PLAYER_NAME);
    await waitForCanvas(player);

    client = new BeaversClient({ url: FOUNDRY_URL, ...connection });
    await client.connect();
  }

  test('module is active and needs no other module', async () => {
    const state = await gm.evaluate((moduleId) => {
      const module = game.modules.get(moduleId);
      return {
        active: module.active,
        requires: [...(module.relationships?.requires ?? [])].map((r) => r.id),
      };
    }, MODULE_ID);
    assert.equal(state.active, true);
    assert.deepEqual(state.requires, []);
  });

  test('external client reaches the GM', async () => {
    assert.equal(await client.gmPresent(), true);
  });

  test('chat bubble is shown to the GM and to players', async () => {
    await recordBubbles(gm);
    await recordBubbles(player);

    await client.chatBubble(TOKEN_NAME, 'Hallo, ich bin Klovareck');

    const expected = [{ token: TOKEN_NAME, message: 'Hallo, ich bin Klovareck', cssClasses: [] }];
    assert.deepEqual(await waitForBubbles(gm, 1), expected);
    assert.deepEqual(await waitForBubbles(player, 1), expected);
  });

  test('emote chat bubble carries the emote style', async () => {
    await recordBubbles(gm);
    await recordBubbles(player);

    await client.chatBubble(TOKEN_NAME, 'schaut sich um', { emote: true });

    const expected = [{ token: TOKEN_NAME, message: 'schaut sich um', cssClasses: ['emote'] }];
    assert.deepEqual(await waitForBubbles(gm, 1), expected);
    assert.deepEqual(await waitForBubbles(player, 1), expected);
  });

  test('chat bubble for an unknown token is ignored', async () => {
    await recordBubbles(gm);

    await client.chatBubble('Nobody Here', 'hört mich jemand?');
    await sleep(1000);

    assert.deepEqual(await bubbles(gm), []);
  });

  test('transcribeJournal writes one paragraph per spoken line', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await gm.evaluate(async (name) => {
      const stale = game.journal.filter(
        (j) => j.name === name && j.folder?.name === 'Voice Transcripts',
      );
      await JournalEntry.deleteDocuments(stale.map((j) => j.id));
    }, today);

    await client.transcribeJournal('Hallo?', TOKEN_NAME);
    await client.transcribeJournal('Ich bin nicht da.', 'Unbekannter Sprecher');

    const page = await gm.evaluate((name) => {
      const journal = game.journal.find(
        (j) => j.name === name && j.folder?.name === 'Voice Transcripts',
      );
      const transcript = journal?.pages.getName('Transcript');
      return {
        parentFolder: journal?.folder?.folder ?? null,
        format: transcript?.text.format,
        content: transcript?.text.content,
      };
    }, today);

    assert.equal(page.parentFolder, null);
    assert.equal(page.format, 1);
    assert.equal(
      page.content,
      `<p><strong>${TOKEN_NAME}:</strong> Hallo?</p>` +
        '<p><strong>Unbekannter Sprecher:</strong> Ich bin nicht da.</p>',
    );
  });
});
