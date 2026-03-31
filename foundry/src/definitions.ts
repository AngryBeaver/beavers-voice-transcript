export const NAMESPACE = 'beavers-ai-assistant';
export const SOCKET_NAME = `module.${NAMESPACE}`;
export const AI_ASSISTANT_USER_NAME = 'ai-assistant';

/** Fixed folder structure for beavers-ai-assistant. All journals live here. */
export const MODULE_FOLDER_NAME = 'beavers-ai-assistant';

/** Fixed folder inside MODULE_FOLDER_NAME where session journals are stored. */
export const SESSION_FOLDER_NAME = 'session';

/** Fixed journal name for session summaries inside SESSION_FOLDER_NAME. */
export const SUMMARY_JOURNAL_NAME = 'AI-Summary';

/** Fixed journal name for the lore index inside MODULE_FOLDER_NAME. */
export const LORE_INDEX_JOURNAL_NAME = 'lore-index';

export const HOOKS = {
  VOICE_TRANSCRIPT_ENABLED_CHANGED: `${NAMESPACE}.voiceTranscriptEnabledChanged`,
} as const;

export const SETTINGS = {
  AI_ASSISTANT_PASSWORD: 'aiAssistantPassword',

  // Voice Transcript
  VOICE_TRANSCRIPT_ENABLED: 'voiceTranscriptEnabled',

  // AI Assistant
  AI_ASSISTANT_ENABLED: 'aiAssistantEnabled',
  CLAUDE_API_KEY: 'claudeApiKey',
  CLAUDE_MODEL: 'claudeModel',
  SESSION_HISTORY_MESSAGES: 'sessionHistoryMessages',
  ADVENTURE_JOURNAL_FOLDER: 'adventureJournalFolder',
} as const;

export const DEFAULTS = {
  CLAUDE_MODEL: 'claude-sonnet-4-6',
  SESSION_HISTORY_MESSAGES: 30,
} as const;
