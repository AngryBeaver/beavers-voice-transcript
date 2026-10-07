export const NAMESPACE = 'beavers-voice-transcript';
export const SOCKET_NAME = `module.${NAMESPACE}`;
export const AI_ASSISTANT_USER_NAME = 'ai-assistant';

/**
 * Root journal folder for session journals. Shared with the beavers-ai-assistant module,
 * which reads the session transcripts from here.
 */
export const MODULE_FOLDER_NAME = 'beavers-ai-assistant';

/** Fixed folder inside MODULE_FOLDER_NAME where session journals are stored. */
export const SESSION_FOLDER_NAME = 'session';

export const SETTINGS = {
  AI_ASSISTANT_PASSWORD: 'aiAssistantPassword',
  DISCORD_GM_USER: 'discordGmUser',
} as const;
