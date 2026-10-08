declare namespace foundry {
  namespace utils {
    function randomID(length?: number): string;
  }
  namespace applications {
    namespace api {
      class ApplicationV2<TContext = object> {
        element: HTMLElement;
        render(options?: { force?: boolean; parts?: string[] }): Promise<this>;
        close(options?: object): Promise<this>;
      }

      /**
       * Mixin that adds Handlebars template rendering to ApplicationV2.
       * Declare `static PARTS` with template paths; the mixin owns _renderHTML,
       * _replaceHTML, and _replaceContent.
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function HandlebarsApplicationMixin(Base: typeof ApplicationV2): typeof ApplicationV2;
    }
  }
}

interface BeaversTranscriptGame extends foundry.Game {
  'beavers-voice-transcript': {
    Settings: unknown;
  };
}

declare const game: BeaversTranscriptGame;

interface SettingConfig {
  'beavers-voice-transcript.apiUserPassword': string;
  'beavers-voice-transcript.discordGmUser': string;
}
