export const NAMESPACE = 'beavers-voice-transcript';
export const SOCKET_NAME = `module.${NAMESPACE}`;
/** Foundry user that external tools (the Discord bot) log in as. */
export const API_USER_NAME = 'voice-transcript-api';
/** Name of that user before the split from beavers-ai-assistant — renamed on first load. */
export const LEGACY_API_USER_NAME = 'ai-assistant';

/** Root journal folder holding one journal per session day. */
export const TRANSCRIPT_FOLDER_NAME = 'Voice Transcripts';
/** Where session journals lived before the split — moved to TRANSCRIPT_FOLDER_NAME on first use. */
export const LEGACY_MODULE_FOLDER_NAME = 'beavers-ai-assistant';
export const LEGACY_SESSION_FOLDER_NAME = 'session';

export const SETTINGS = {
  API_USER_PASSWORD: 'apiUserPassword',
  DISCORD_GM_USER: 'discordGmUser',
} as const;
