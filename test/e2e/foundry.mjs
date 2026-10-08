import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

export const FOUNDRY_URL = (process.env.FOUNDRY_URL ?? 'http://localhost:30000').replace(/\/$/, '');
export const WORLD_ID = process.env.E2E_WORLD_ID ?? 'beavers-voice-transcript-e2e';
export const MODULE_ID = 'beavers-voice-transcript';
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? '';
const SYSTEM_ID = process.env.E2E_SYSTEM_ID ?? '';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchBrowser() {
  const executablePath = CHROME_PATHS.find((p) => p && fs.existsSync(p));
  if (!executablePath) throw new Error('Chrome not found — set CHROME_PATH in test/.env');
  return puppeteer.launch({
    executablePath,
    headless: process.env.E2E_HEADFUL !== 'true',
    // Foundry's canvas needs WebGL; SwiftShader provides it without a GPU
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    defaultViewport: { width: 1400, height: 900 },
    protocolTimeout: 180_000,
  });
}

/** Open a page that forwards browser errors to the test output. */
export async function newPage(context, label) {
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`[${label}] page error: ${err.message.slice(0, 300)}`));
  return page;
}

async function serverStatus() {
  const res = await fetch(`${FOUNDRY_URL}/api/status`);
  return res.json();
}

async function waitForStatus(predicate, what, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await serverStatus().catch(() => null);
    if (status && predicate(status)) return status;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for Foundry: ${what}`);
}

async function adminLogin(page) {
  if (!new URL(page.url()).pathname.endsWith('/auth')) return;
  if (!ADMIN_KEY)
    throw new Error('Foundry asks for the admin password — set FOUNDRY_ADMIN_KEY in test/.env');
  await page.waitForSelector('input[name="adminPassword"]', { timeout: 30_000 });
  await page.type('input[name="adminPassword"]', ADMIN_KEY);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }),
    page.click('button[value="adminAuth"]'),
  ]);
  if (new URL(page.url()).pathname.endsWith('/auth')) {
    throw new Error('Foundry rejected FOUNDRY_ADMIN_KEY');
  }
}

async function createWorld(page) {
  await page.goto(`${FOUNDRY_URL}/create`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForSelector('input[name="title"]', { timeout: 30_000 });
  await page.type('input[name="title"]', 'Beavers Voice Transcript e2e');
  await page.$eval('input[name="world-id"]', (el) => (el.value = ''));
  await page.type('input[name="world-id"]', WORLD_ID);

  const system = await page.evaluate((wanted) => {
    const ids = [...document.querySelectorAll('select[name="system"] option')]
      .map((o) => o.value)
      .filter(Boolean);
    return wanted ? ids.find((id) => id === wanted) : ids[0];
  }, SYSTEM_ID);
  if (!system) throw new Error(`Game system ${SYSTEM_ID || '(any)'} is not installed in Foundry`);
  await page.select('select[name="system"]', system);

  // creating a world also launches it and lands on its user configuration page
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 180_000 }),
    page.click('button[type="submit"]'),
  ]);
}

/**
 * Make sure the dedicated e2e world is the running world, creating it on first use.
 * Refuses to touch any other world that is currently running.
 * @returns {Promise<boolean>} true if this call started the world (so teardown may stop it)
 */
export async function ensureWorldRunning(browser) {
  const status = await serverStatus().catch(() => {
    throw new Error(`Foundry is not reachable at ${FOUNDRY_URL}`);
  });
  if (status.active && status.world === WORLD_ID) return false;
  if (status.active) {
    throw new Error(
      `Foundry is running the world "${status.world}". Return to setup first — the e2e test will not shut down a world it did not start.`,
    );
  }

  const page = await newPage(browser, 'setup');
  try {
    await page.goto(FOUNDRY_URL, { waitUntil: 'networkidle2', timeout: 60_000 });
    await adminLogin(page);
    await page.waitForFunction(() => globalThis.game?.view === 'setup' && !!game.worlds, {
      timeout: 60_000,
    });

    const state = await page.evaluate(
      (worldId, moduleId) => ({
        worldExists: !!game.worlds.get(worldId),
        moduleInstalled: !!game.modules.get(moduleId),
      }),
      WORLD_ID,
      MODULE_ID,
    );
    if (!state.moduleInstalled) {
      throw new Error(
        `Module ${MODULE_ID} is not installed in this Foundry — run "pnpm devbuild" in foundry/ first`,
      );
    }

    if (state.worldExists) {
      await page.evaluate((worldId) => {
        // not awaited: the server answers with a redirect once the world is up
        void game.post({ action: 'launchWorld', world: worldId }, { notify: false });
      }, WORLD_ID);
    } else {
      await createWorld(page);
    }
    await waitForStatus((s) => s.active && s.world === WORLD_ID, `world ${WORLD_ID} to start`);
    return true;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Shut the e2e world down again so Foundry is back on its setup screen. */
export async function stopWorld(browser) {
  const status = await serverStatus();
  if (!status.active || status.world !== WORLD_ID) return;
  // a fresh session: the join page only offers "Return to Setup" to users who are not logged in
  const context = await browser.createBrowserContext();
  try {
    const page = await newPage(context, 'shutdown');
    await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await page.waitForSelector('#join-game-setup button[type="submit"]', { timeout: 30_000 });
    const adminInput = await page.$('#join-game-setup input[name="adminPassword"]');
    if (adminInput && ADMIN_KEY) await adminInput.type(ADMIN_KEY);
    await page.click('#join-game-setup button[type="submit"]');
    await waitForStatus((s) => !s.active, 'world to shut down', 60_000);
  } finally {
    await context.close().catch(() => {});
  }
}

/** Join the running world as the named user and wait until the game is ready. */
export async function join(page, userName, password = '') {
  await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'networkidle2', timeout: 60_000 });
  // the form only works once Foundry has loaded the world's users into the join page
  await page.waitForFunction(
    (name) =>
      !!document.querySelector('input[name="username"]') &&
      !!globalThis.game?.users?.find((u) => u.name === name),
    { timeout: 60_000 },
    userName,
  );
  await page.type('input[name="username"]', userName);
  if (password) await page.type('input[name="password"]:not([name="adminPassword"])', password);
  await page.click('button[name="join"]');
  try {
    await page.waitForFunction(() => location.pathname.endsWith('/game'), { timeout: 60_000 });
  } catch {
    const notice = await page.evaluate(() =>
      [...document.querySelectorAll('#notifications .notification')]
        .map((n) => n.textContent.trim())
        .join(' | '),
    );
    throw new Error(`Could not join as "${userName}"${notice ? `: ${notice}` : ''}`);
  }
  await waitForGame(page);
}

export const waitForGame = (page) =>
  page.waitForFunction(() => globalThis.game?.ready === true, { timeout: 180_000 });

export const waitForCanvas = (page) =>
  page.waitForFunction(
    () => globalThis.canvas?.ready === true && canvas.tokens.placeables.length > 0,
    { timeout: 120_000 },
  );

/** Enable the module and every module it requires, reloading the GM page if anything changed. */
export async function enableModules(gmPage) {
  const result = await gmPage.evaluate(async (moduleId) => {
    const module = game.modules.get(moduleId);
    if (!module) return { missing: [moduleId], changed: false };
    const required = [...(module.relationships?.requires ?? [])].map((r) => r.id);
    const ids = [moduleId, ...required];
    const missing = ids.filter((id) => !game.modules.get(id));
    if (missing.length) return { missing, changed: false };

    const inactive = ids.filter((id) => !game.modules.get(id).active);
    if (!inactive.length) return { missing, changed: false };
    const config = { ...game.settings.get('core', 'moduleConfiguration') };
    for (const id of inactive) config[id] = true;
    await game.settings.set('core', 'moduleConfiguration', config);
    return { missing, changed: true };
  }, MODULE_ID);

  if (result.missing.length) {
    throw new Error(`Modules not installed in Foundry: ${result.missing.join(', ')}`);
  }
  if (result.changed) {
    await gmPage.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForGame(gmPage);
  }
}
