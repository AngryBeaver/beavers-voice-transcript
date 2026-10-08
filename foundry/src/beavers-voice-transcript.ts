import { API_USER_NAME, LEGACY_API_USER_NAME, NAMESPACE, SETTINGS } from './definitions.js';
import { Settings as ApiSettings } from './apps/settings/Settings.js';
import { SocketApi } from './api/SocketApi.js';

Hooks.once('init', async function () {
  game[NAMESPACE] = game[NAMESPACE] || {};
  game[NAMESPACE].Settings = new ApiSettings();
});

Hooks.once('ready', async function () {
  console.log(`${NAMESPACE} | Ready`);
  SocketApi.start();
  if (game.user.isGM) {
    await ensureApiUser();
  }
});

async function ensureApiUser(): Promise<void> {
  let user = game.users.find((u: any) => u.name === API_USER_NAME);
  if (!user) {
    // Renaming keeps the user's ID and password, so existing bot credentials stay valid
    const legacy = game.users.find((u: any) => u.name === LEGACY_API_USER_NAME);
    if (legacy) {
      user = await legacy.update({ name: API_USER_NAME });
      console.log(`${NAMESPACE} | Renamed user ${LEGACY_API_USER_NAME} to ${API_USER_NAME}`);
    }
  }
  if (!user) {
    const password = foundry.utils.randomID(32);
    user = await User.create({
      name: API_USER_NAME,
      role: CONST.USER_ROLES.ASSISTANT,
      password,
    });
    await game.settings.set(NAMESPACE, SETTINGS.API_USER_PASSWORD, password);
  } else {
    const stored = game.settings.get(NAMESPACE, SETTINGS.API_USER_PASSWORD) as string;
    if (!stored) {
      // User exists but password was lost — regenerate
      const password = foundry.utils.randomID(32);
      await user.update({ password });
      await game.settings.set(NAMESPACE, SETTINGS.API_USER_PASSWORD, password);
      console.log(`${NAMESPACE} | Regenerated ${API_USER_NAME} password`);
    }
  }
}
