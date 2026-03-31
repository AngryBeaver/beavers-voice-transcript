import { NAMESPACE } from '../definitions.js';
import { Settings } from './settings/Settings.js';

interface AiGmWindowContext {
  voiceTranscriptEnabled: boolean;
  loreIndexExists: boolean;
}

/**
 * GM-only persistent panel.
 * Step 2: layout and wiring only — no AI logic yet.
 */
export class AiGmWindow extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: 'beavers-ai-gm-window',
    window: { title: 'AI Assistant', resizable: true },
    position: { width: 440 },
    actions: {
      interact: AiGmWindow._onInteract,
      openSettings: AiGmWindow._onOpenSettings,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${NAMESPACE}/templates/ai-gm-window.hbs`,
    },
  };

  private static _instance: AiGmWindow | null = null;

  /**
   * Opens (or re-focuses) the singleton window.
   * Shows an error notification if the module is not configured.
   */
  static open(): void {
    if (!Settings.isConfigured()) {
      ui.notifications.error(
        'AI Assistant is not configured. Enable it and enter your Claude API key in the AI Assistant settings.',
      );
      return;
    }

    if (!AiGmWindow._instance) {
      AiGmWindow._instance = new AiGmWindow();
    }
    AiGmWindow._instance.render({ force: true });
  }

  async _prepareContext(_options: object): Promise<AiGmWindowContext> {
    const { LORE_INDEX_JOURNAL_NAME, MODULE_FOLDER_NAME } = await import('../definitions.js');

    const moduleFolder = (game.folders as any)?.find(
      (f: any) => f.name === MODULE_FOLDER_NAME && f.type === 'JournalEntry',
    );
    const loreIndexExists = moduleFolder
      ? !!(game.journal as any)?.find(
          (j: any) => j.folder?.id === moduleFolder.id && j.name === LORE_INDEX_JOURNAL_NAME,
        )
      : false;

    return {
      voiceTranscriptEnabled: Settings.isVoiceTranscriptEnabled(),
      loreIndexExists,
    };
  }

  async close(options?: object): Promise<this> {
    AiGmWindow._instance = null;
    return super.close(options);
  }

  /** Placeholder — implemented in Step 8. */
  static async _onSessionSummary(_this: AiGmWindow): Promise<void> {
    ui.notifications.info('Session Summary — coming in a later step.');
  }

  /** Placeholder — implemented in Step 4. */
  static async _onInteract(_this: AiGmWindow): Promise<void> {
    ui.notifications.info('Interact — coming in a later step.');
  }

  static async _onOpenSettings(_this: AiGmWindow): Promise<void> {
    const menuKey = `${NAMESPACE}.aiAssistant`;
    const menu = (game.settings.menus as any).get(menuKey);
    if (menu?.settingsApp) {
      menu.settingsApp.render(true);
    }
  }
}
