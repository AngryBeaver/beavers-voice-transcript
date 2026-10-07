import { NAMESPACE, SETTINGS } from '../../definitions.js';
import { VoiceTranscriptSettingsApp } from './VoiceTranscriptSettingsApp.js';

/**
 * Registers all module settings (all `config: false`) and the settings-menu button.
 * Settings are managed through VoiceTranscriptSettingsApp.
 */
export class Settings {
  constructor() {
    this.registerSettings();
    this.registerMenus();
  }

  private registerSettings(): void {
    // hidden bookkeeping
    game.settings.register(NAMESPACE, SETTINGS.AI_ASSISTANT_PASSWORD, {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });
    game.settings.register(NAMESPACE, SETTINGS.DISCORD_GM_USER, {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });
  }

  private registerMenus(): void {
    game.settings.registerMenu(NAMESPACE, 'voiceTranscript', {
      name: 'Voice Transcript',
      label: 'Configure',
      hint: 'Connect the Discord bot and configure voice transcription.',
      icon: 'fas fa-microphone',
      type: VoiceTranscriptSettingsApp,
      restricted: true,
    });
  }
}
