import { DEFAULTS, NAMESPACE, SETTINGS } from '../../definitions.js';

interface AiAssistantContext {
  enabled: boolean;
  voiceTranscriptEnabled: boolean;
  claudeApiKey: string;
  claudeModel: string;
  sessionHistoryMessages: number;
  adventureJournalFolder: string;
  defaultClaudeModel: string;
}

export class AiAssistantSettingsApp extends (foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) as any)<AiAssistantContext> {
  static DEFAULT_OPTIONS = {
    id: 'beavers-ai-settings',
    classes: ['standard-form'],
    window: { title: 'AI Assistant Settings', resizable: false },
    position: { width: 500 },
    actions: {
      save: AiAssistantSettingsApp._onSave,
      buildLoreIndex: AiAssistantSettingsApp._onBuildLoreIndex,
    },
  };

  static PARTS = {
    form: { template: 'modules/beavers-ai-assistant/templates/ai-assistant-settings.hbs' },
  };

  async _prepareContext(_options: object): Promise<AiAssistantContext> {
    return {
      enabled: game.settings.get(NAMESPACE, SETTINGS.AI_ASSISTANT_ENABLED) as boolean,
      voiceTranscriptEnabled: game.settings.get(
        NAMESPACE,
        SETTINGS.VOICE_TRANSCRIPT_ENABLED,
      ) as boolean,
      claudeApiKey: game.settings.get(NAMESPACE, SETTINGS.CLAUDE_API_KEY) as string,
      claudeModel: game.settings.get(NAMESPACE, SETTINGS.CLAUDE_MODEL) as string,
      sessionHistoryMessages: game.settings.get(
        NAMESPACE,
        SETTINGS.SESSION_HISTORY_MESSAGES,
      ) as number,
      adventureJournalFolder: game.settings.get(
        NAMESPACE,
        SETTINGS.ADVENTURE_JOURNAL_FOLDER,
      ) as string,
      defaultClaudeModel: DEFAULTS.CLAUDE_MODEL,
    };
  }

  static async _onSave(this: AiAssistantSettingsApp): Promise<void> {
    const enabled = (this.element.querySelector('#ai-enabled') as HTMLInputElement).checked;
    const claudeApiKey = (
      this.element.querySelector('#ai-api-key') as HTMLInputElement
    ).value.trim();
    const claudeModel = (this.element.querySelector('#ai-model') as HTMLInputElement).value.trim();
    const sessionHistoryMessages = parseInt(
      (this.element.querySelector('#ai-context-size') as HTMLInputElement).value,
      10,
    );
    const adventureJournalFolder = (
      this.element.querySelector('#ai-adventure-folder') as HTMLInputElement
    ).value.trim();

    await game.settings.set(NAMESPACE, SETTINGS.AI_ASSISTANT_ENABLED, enabled);
    await game.settings.set(NAMESPACE, SETTINGS.CLAUDE_API_KEY, claudeApiKey);
    await game.settings.set(NAMESPACE, SETTINGS.CLAUDE_MODEL, claudeModel || DEFAULTS.CLAUDE_MODEL);
    await game.settings.set(
      NAMESPACE,
      SETTINGS.SESSION_HISTORY_MESSAGES,
      isNaN(sessionHistoryMessages) ? DEFAULTS.SESSION_HISTORY_MESSAGES : sessionHistoryMessages,
    );
    await game.settings.set(NAMESPACE, SETTINGS.ADVENTURE_JOURNAL_FOLDER, adventureJournalFolder);

    ui.notifications.info('AI Assistant settings saved.');
    await this.close();
  }

  static async _onBuildLoreIndex(this: AiAssistantSettingsApp): Promise<void> {
    ui.notifications.info('Build Lore Index — coming in Step 9.');
  }
}
