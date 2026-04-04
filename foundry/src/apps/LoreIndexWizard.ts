import {
  LORE_INDEX_JOURNAL_NAME,
  MODULE_FOLDER_NAME,
  NAMESPACE,
  SETTINGS,
  DEFAULTS,
} from '../definitions.js';
import type { AiProvider } from '../definitions.js';
import { AiService } from '../services/AiService.js';
import type { CallOptions } from '../services/AiService.js';
import {
  ChapterCandidate,
  ChapterDetector,
  ChapterRole,
  flagIntroCandidate,
  GameAccessor,
} from '../modules/ChapterDetector.js';
import { LoreIndexBuilder } from '../modules/LoreIndexBuilder.js';
import { IndexingPassRunner } from '../modules/IndexingPassRunner.js';
import type {
  LocationItem,
  WizardStep,
  IndexStatus,
  ModelContext,
  IndexingCtx,
  WizardContext,
  ChapterCandidateView,
} from './LoreIndexWizard.types.js';

// ---------------------------------------------------------------------------
// Foundry GameAccessor implementation
// ---------------------------------------------------------------------------

function makeFoundryGameAccessor(): GameAccessor {
  return {
    getFolder: (id) => (game.folders as any)?.get(id) ?? null,

    getSubfolders: (parentId) => {
      const items: any[] =
        (game.folders as any)?.filter(
          (f: any) => f.folder?.id === parentId && f.type === 'JournalEntry',
        ) ?? [];
      return items.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    },

    getJournal: (id) => (game.journal as any)?.get(id) ?? null,

    getJournalsInFolder: (folderId) => {
      const items: any[] =
        (game.journal as any)?.filter((j: any) => j.folder?.id === folderId) ?? [];
      return items.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    },
  };
}

// ---------------------------------------------------------------------------
// LoreIndexWizard
// ---------------------------------------------------------------------------

/**
 * Guided wizard for building and maintaining the lore index.
 *
 * Step order: location → (mixed) → chapters → model → indexing pass
 *
 * Each step has its own Handlebars template declared in PARTS.
 * Only the active step's part is rendered on each transition.
 * Indexing pass state is managed by {@link IndexingPassRunner}.
 */
export class LoreIndexWizard extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: 'beavers-lore-index-wizard',
    window: { title: 'Lore Index Wizard', resizable: true },
    position: { width: 540 },
    actions: {
      continueFromLocation: LoreIndexWizard._onContinueFromLocation,
      backToLocation: LoreIndexWizard._onBackToLocation,
      useMixedFolders: LoreIndexWizard._onUseMixedFolders,
      useMixedJournals: LoreIndexWizard._onUseMixedJournals,
      useMixedBoth: LoreIndexWizard._onUseMixedBoth,
      confirmChapters: LoreIndexWizard._onConfirmChapters,
      backToChapters: LoreIndexWizard._onBackToChapters,
      refreshModels: LoreIndexWizard._onRefreshModels,
      startIndexing: LoreIndexWizard._onStartIndexing,
      // Indexing pass
      indexThisChapter: LoreIndexWizard._onIndexThisChapter,
      rebuildChapter: LoreIndexWizard._onRebuildChapter,
      skipThisChapter: LoreIndexWizard._onSkipThisChapter,
      continueIndexing: LoreIndexWizard._onContinueIndexing,
      skipNextChapter: LoreIndexWizard._onSkipNextChapter,
      stopIndexing: LoreIndexWizard._onStopIndexing,
      generateOverview: LoreIndexWizard._onGenerateOverview,
      finishWizard: LoreIndexWizard._onFinishWizard,
      continueToEnrichment: LoreIndexWizard._onContinueToEnrichment,
    },
  };

  static PARTS = {
    location: { template: `modules/${NAMESPACE}/templates/wizard/location.hbs` },
    mixed: { template: `modules/${NAMESPACE}/templates/wizard/mixed.hbs` },
    chapters: { template: `modules/${NAMESPACE}/templates/wizard/chapters.hbs` },
    model: { template: `modules/${NAMESPACE}/templates/wizard/model.hbs` },
    indexing: { template: `modules/${NAMESPACE}/templates/wizard/indexing.hbs` },
  };

  private static _instance: LoreIndexWizard | null = null;

  // Wizard navigation state
  private _step: WizardStep = 'location';
  private _selectedLocation: LocationItem | null = null;
  private _indexStatus: IndexStatus = 'none';
  private _chapters: ChapterCandidate[] = [];
  private _mixedFolders: ChapterCandidate[] = [];
  private _mixedJournals: ChapterCandidate[] = [];

  // Model step state
  private _modelContext: ModelContext = 'indexing';
  private _selectedProvider: AiProvider = DEFAULTS.AI_PROVIDER;
  private _selectedModel: string = '';
  private _availableModels: string[] = [];
  private _modelFetchError: boolean = false;

  // Indexing pass state — managed by the runner
  private readonly _runner = new IndexingPassRunner();

  private readonly _detector = new ChapterDetector(makeFoundryGameAccessor());

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  static open(): void {
    if (!LoreIndexWizard._instance) {
      LoreIndexWizard._instance = new LoreIndexWizard();
    }
    LoreIndexWizard._instance.render({ force: true });
  }

  async close(options?: object): Promise<this> {
    LoreIndexWizard._instance = null;
    return super.close(options);
  }

  /** Hide all part containers except the active step after every render. */
  protected async _onRender(_context: WizardContext, _options: object): Promise<void> {
    for (const partId of Object.keys(LoreIndexWizard.PARTS)) {
      const el = this.element.querySelector(
        `[data-application-part="${partId}"]`,
      ) as HTMLElement | null;
      if (el) el.style.display = partId === this._step ? '' : 'none';
    }

    if (this._step === 'location') this._setupLocationBadge();
    if (this._step === 'chapters') this._setupChapterDragDrop();
    if (this._step === 'model') this._setupModelListeners();
    if (this._step === 'indexing' && this._runner.phase === 'overview') {
      void this._runIndexingOverview();
    }
  }

  // ---------------------------------------------------------------------------
  // Location step — live index-status badge
  // ---------------------------------------------------------------------------

  private _setupLocationBadge(): void {
    const select = this.element.querySelector<HTMLSelectElement>('#wizard-location');
    const badge = this.element.querySelector<HTMLElement>('#wizard-index-status');
    if (!select || !badge) return;

    const update = (): void => {
      const opt = select.options[select.selectedIndex];
      if (!opt?.value) {
        badge.innerHTML = '';
        return;
      }
      const type = (opt.dataset.type ?? 'folder') as 'folder' | 'journal';
      const status = this._detectIndexStatusFor(opt.value, type);
      if (status === 'exists') {
        badge.innerHTML =
          `<div style="padding:.6rem .75rem;background:var(--color-level-success-bg,#d4edda);` +
          `border:1px solid var(--color-level-success,#28a745);border-radius:4px;font-size:.875em;margin-top:.75rem">` +
          `<i class="fas fa-circle-check"></i> A lore index exists for this adventure.</div>`;
      } else {
        badge.innerHTML =
          `<div style="padding:.6rem .75rem;background:var(--color-level-info-bg,#e8f4fd);` +
          `border:1px solid var(--color-level-info,#4a90d9);border-radius:4px;font-size:.875em;margin-top:.75rem">` +
          `<i class="fas fa-circle-info"></i> No lore index found. Continuing will build one.</div>`;
      }
    };

    select.addEventListener('change', update);
    if (select.value) update();
  }

  // ---------------------------------------------------------------------------
  // Chapters step — drag-and-drop reordering
  // ---------------------------------------------------------------------------

  private _setupChapterDragDrop(): void {
    const rows = Array.from(this.element.querySelectorAll<HTMLElement>('[data-chapter-id]'));
    let draggedId: string | null = null;

    for (const row of rows) {
      row.addEventListener('dragstart', (e) => {
        draggedId = row.dataset.chapterId ?? null;
        (e as DragEvent).dataTransfer?.setData('text/plain', draggedId ?? '');
        row.style.opacity = '0.4';
      });

      row.addEventListener('dragend', () => {
        row.style.opacity = '';
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.style.outline = '2px solid var(--color-border-highlight, #ff6400)';
      });

      row.addEventListener('dragleave', () => {
        row.style.outline = '';
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.style.outline = '';
        const targetId = row.dataset.chapterId;
        if (!draggedId || !targetId || draggedId === targetId) return;

        this._syncRolesFromDOM();

        const fromIdx = this._chapters.findIndex((c) => c.id === draggedId);
        const toIdx = this._chapters.findIndex((c) => c.id === targetId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [moved] = this._chapters.splice(fromIdx, 1);
          this._chapters.splice(toIdx, 0, moved);
          this.render({ force: true });
        }
        draggedId = null;
      });
    }
  }

  private _syncRolesFromDOM(): void {
    for (const chapter of this._chapters) {
      const checked = this.element?.querySelector(
        `input[name="chapter-role-${CSS.escape(chapter.id)}"]:checked`,
      ) as HTMLInputElement | null;
      if (checked) chapter.role = checked.value as ChapterRole;
    }
  }

  // ---------------------------------------------------------------------------
  // Model step — provider radio + model dropdown listeners
  // ---------------------------------------------------------------------------

  private _setupModelListeners(): void {
    const radios = Array.from(
      this.element.querySelectorAll<HTMLInputElement>('input[name="wizard-provider"]'),
    );
    for (const radio of radios) {
      radio.addEventListener('change', async () => {
        this._selectedProvider = radio.value as AiProvider;
        if (
          this._selectedProvider === 'local-ai' &&
          this._availableModels.length === 0 &&
          !this._modelFetchError
        ) {
          await this._fetchModels();
        }
        this.render({ force: true });
      });
    }

    const modelSelect = this.element.querySelector<HTMLSelectElement>('#wizard-model');
    if (modelSelect) {
      modelSelect.addEventListener('change', () => {
        this._selectedModel = modelSelect.value;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  async _prepareContext(_options: object): Promise<WizardContext> {
    const inputTokens = this._estimateInputTokens();
    const outputTokens = this._estimateOutputTokens();
    return {
      locationName: this._selectedLocation?.name ?? '',
      locationType: this._selectedLocation?.type ?? 'folder',
      locations: this._collectLocations(),
      mixedFolders: this._mixedFolders,
      mixedJournals: this._mixedJournals,
      chapters: this._chapters.map(
        (c): ChapterCandidateView => ({
          ...c,
          roleIsOverview: c.role === 'overview',
          roleIsChapter: c.role === 'chapter',
          roleIsSkip: c.role === 'skip',
          showOverviewOption: true,
        }),
      ),
      modelContext: this._modelContext,
      selectedProvider: this._selectedProvider,
      selectedModel: this._selectedModel,
      availableModels: this._availableModels,
      modelFetchError: this._modelFetchError,
      estimatedInputTokensFormatted: inputTokens.toLocaleString(),
      estimatedOutputTokensFormatted: outputTokens.toLocaleString(),
      claudeCostEstimate: this._claudeCostFromTokens(inputTokens, outputTokens),
      hasClaudeApiKey: this._hasClaudeApiKey(),
      localAiUrl: this._localAiUrl(),
      indexing: this._buildIndexingCtx(),
    };
  }

  private _buildIndexingCtx(): IndexingCtx {
    const r = this._runner;
    const phase = r.phase;
    return {
      phase,
      chapterName: r.currentChapter?.name ?? '',
      chapterTokensFormatted: (r.currentChapter?.tokens ?? 0).toLocaleString(),
      chapterIdx: r.currentIdx + 1,
      totalChapters: r.totalChapters,
      log: r.log,
      justCompleted: r.justCompleted,
      nextChapterName: r.nextChapter?.name ?? '',
      hasNextChapter: r.hasNextChapter,
      completedCount: r.completedCount,
      sceneCount: r.sceneCount,
      error: r.error,
      isPreChapter: phase === 'pre_chapter',
      isAlreadyIndexed: phase === 'already_indexed',
      isRunning: phase === 'running',
      isBetween: phase === 'between',
      isOverview: phase === 'overview',
      isComplete: phase === 'complete',
    };
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  private _goToStep(step: WizardStep): void {
    this._step = step;
    this.render({ force: true });
  }

  // ---------------------------------------------------------------------------
  // Location helpers
  // ---------------------------------------------------------------------------

  private _collectLocations(): LocationItem[] {
    const folders: LocationItem[] = (
      (game.folders as any)?.filter((f: any) => f.type === 'JournalEntry' && !f.folder) ?? []
    ).map((f: any) => ({ id: f.id as string, name: f.name as string, type: 'folder' as const }));

    const journals: LocationItem[] = (
      (game.journal as any)?.filter((j: any) => !j.folder) ?? []
    ).map((j: any) => ({ id: j.id as string, name: j.name as string, type: 'journal' as const }));

    return [...folders, ...journals];
  }

  private _detectIndexStatusFor(id: string, type: 'folder' | 'journal'): IndexStatus {
    const modFolder = (game.folders as any)?.find(
      (f: any) => f.name === MODULE_FOLDER_NAME && f.type === 'JournalEntry',
    );
    if (!modFolder) return 'none';
    const indexJournal = (game.journal as any)?.find(
      (j: any) => j.folder?.id === modFolder.id && j.name === LORE_INDEX_JOURNAL_NAME,
    );
    if (!indexJournal?.pages.size) return 'none';
    const prefix =
      type === 'folder'
        ? (game.folders as any)?.get(id)?.name
        : (game.journal as any)?.get(id)?.name;
    if (!prefix) return 'none';
    const hasPage = [...indexJournal.pages.values()].some(
      (p: any) => p.name?.startsWith('Chapter:') || p.name === 'Overview',
    );
    return hasPage ? 'exists' : 'none';
  }

  private _resolveLocationName(id: string, type: 'folder' | 'journal'): string {
    if (type === 'folder') return (game.folders as any)?.get(id)?.name ?? id;
    return (game.journal as any)?.get(id)?.name ?? id;
  }

  // ---------------------------------------------------------------------------
  // Estimate helpers
  // ---------------------------------------------------------------------------

  private _estimateInputTokens(): number {
    return this._chapters.filter((c) => c.role !== 'skip').reduce((sum, c) => sum + c.tokens, 0);
  }

  private _estimateOutputTokens(): number {
    return this._chapters.filter((c) => c.role !== 'skip').length * 4096;
  }

  private _claudeCostFromTokens(inputTokens: number, outputTokens: number): string {
    if (inputTokens === 0) return '—';
    const cost = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
    return cost < 0.01 ? '< $0.01' : `~$${cost.toFixed(2)}`;
  }

  // ---------------------------------------------------------------------------
  // Settings helpers
  // ---------------------------------------------------------------------------

  private _hasClaudeApiKey(): boolean {
    const key = (game.settings as any)?.get(NAMESPACE, SETTINGS.CLAUDE_API_KEY) as
      | string
      | undefined;
    return !!key?.trim();
  }

  private _localAiUrl(): string {
    return (
      ((game.settings as any)?.get(NAMESPACE, SETTINGS.LOCAL_AI_URL) as string) ||
      DEFAULTS.LOCAL_AI_URL
    );
  }

  // ---------------------------------------------------------------------------
  // Chapter detection
  // ---------------------------------------------------------------------------

  private _runChapterDetection(): void {
    if (!this._selectedLocation) return;

    const result = this._detector.detect(this._selectedLocation.id, this._selectedLocation.type);

    if (result.isMixed) {
      this._mixedFolders = result.subfolders;
      this._mixedJournals = result.journals;
      this._goToStep('mixed');
      return;
    }

    this._chapters = result.candidates;
    this._goToStep('chapters');
  }

  private _applyMixedChoice(candidates: ChapterCandidate[]): void {
    flagIntroCandidate(candidates);
    this._chapters = candidates;
    this._goToStep('chapters');
  }

  // ---------------------------------------------------------------------------
  // Model fetch
  // ---------------------------------------------------------------------------

  private async _fetchModels(): Promise<void> {
    this._modelFetchError = false;
    try {
      const res = await fetch(`${this._localAiUrl()}/v1/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data: { id: string }[] };
      this._availableModels = data.data.map((m) => m.id).sort();
      if (this._selectedModel && !this._availableModels.includes(this._selectedModel)) {
        this._selectedModel = '';
      }
      if (!this._selectedModel && this._availableModels.length > 0) {
        this._selectedModel = this._availableModels[0];
      }
    } catch {
      this._modelFetchError = true;
      this._availableModels = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Actions — navigation
  // ---------------------------------------------------------------------------

  static async _onContinueFromLocation(this: LoreIndexWizard): Promise<void> {
    const select = this.element.querySelector('#wizard-location') as HTMLSelectElement;
    const opt = select?.options[select.selectedIndex];
    if (!opt?.value) {
      ui.notifications.warn('Select an adventure location to continue.');
      return;
    }

    const type = (opt.dataset.type ?? 'folder') as 'folder' | 'journal';
    this._selectedLocation = {
      id: opt.value,
      type,
      name: this._resolveLocationName(opt.value, type),
    };
    this._indexStatus = this._detectIndexStatusFor(opt.value, type);
    this._runChapterDetection();
  }

  static async _onBackToLocation(this: LoreIndexWizard): Promise<void> {
    this._goToStep('location');
  }

  static async _onUseMixedFolders(this: LoreIndexWizard): Promise<void> {
    this._applyMixedChoice(this._mixedFolders);
  }

  static async _onUseMixedJournals(this: LoreIndexWizard): Promise<void> {
    this._applyMixedChoice(this._mixedJournals);
  }

  static async _onUseMixedBoth(this: LoreIndexWizard): Promise<void> {
    this._applyMixedChoice([...this._mixedFolders, ...this._mixedJournals]);
  }

  static async _onConfirmChapters(this: LoreIndexWizard): Promise<void> {
    this._syncRolesFromDOM();

    const active = this._chapters.filter((c) => c.role !== 'skip');
    if (active.length === 0) {
      ui.notifications.warn('Select at least one chapter to index.');
      return;
    }

    this._selectedProvider =
      ((game.settings as any)?.get(NAMESPACE, SETTINGS.AI_PROVIDER) as AiProvider) ||
      DEFAULTS.AI_PROVIDER;

    if (
      this._selectedProvider === 'local-ai' &&
      this._availableModels.length === 0 &&
      !this._modelFetchError
    ) {
      await this._fetchModels();
    }

    this._goToStep('model');
  }

  static async _onBackToChapters(this: LoreIndexWizard): Promise<void> {
    this._goToStep('chapters');
  }

  static async _onRefreshModels(this: LoreIndexWizard): Promise<void> {
    await this._fetchModels();
    this.render({ force: true });
  }

  // ---------------------------------------------------------------------------
  // Actions — indexing pass
  // ---------------------------------------------------------------------------

  static async _onStartIndexing(this: LoreIndexWizard): Promise<void> {
    const queue = this._chapters.filter((c) => c.role === 'chapter');
    const overviewChapter = this._chapters.find((c) => c.role === 'overview') ?? null;

    if (queue.length === 0) {
      (ui as any).notifications.warn(
        'No chapters to index. Set at least one chapter role to "Chapter".',
      );
      return;
    }

    this._runner.start(queue, overviewChapter);
    this._goToStep('indexing');
  }

  static async _onIndexThisChapter(this: LoreIndexWizard): Promise<void> {
    const chapter = this._runner.currentChapter;
    if (!chapter) return;

    if (this._createBuilder().isChapterIndexed(chapter.name)) {
      this._runner.markAlreadyIndexed();
      this.render({ force: true });
      return;
    }

    await this._runChapterIndexing();
  }

  static async _onRebuildChapter(this: LoreIndexWizard): Promise<void> {
    await this._runChapterIndexing();
  }

  static async _onSkipThisChapter(this: LoreIndexWizard): Promise<void> {
    this._runner.skipCurrent();
    this.render({ force: true });
  }

  static async _onContinueIndexing(this: LoreIndexWizard): Promise<void> {
    this._runner.continueToNext();
    this.render({ force: true });
  }

  static async _onSkipNextChapter(this: LoreIndexWizard): Promise<void> {
    this._runner.skipNext();
    this.render({ force: true });
  }

  static async _onStopIndexing(this: LoreIndexWizard): Promise<void> {
    this._runner.stopEarly();
    this.render({ force: true });
  }

  static async _onGenerateOverview(this: LoreIndexWizard): Promise<void> {
    this._runner.startOverview();
    this.render({ force: true });
    // _runIndexingOverview is triggered in _onRender when phase === 'overview'
  }

  static async _onFinishWizard(this: LoreIndexWizard): Promise<void> {
    await this.close();
  }

  static async _onContinueToEnrichment(this: LoreIndexWizard): Promise<void> {
    // Task 0.6 — map enrichment pass (not yet implemented)
    (ui as any).notifications.info('Map enrichment — coming in Task 0.6.');
  }

  // ---------------------------------------------------------------------------
  // Indexing helpers
  // ---------------------------------------------------------------------------

  private _createBuilder(): LoreIndexBuilder {
    return new LoreIndexBuilder(game as any, AiService.create(game as any, this._selectedProvider));
  }

  private _indexingCallOptions(): CallOptions {
    const opts: CallOptions = { max_tokens: 32768 };
    if (this._selectedProvider === 'local-ai' && this._selectedModel) {
      opts.model = this._selectedModel;
    }
    return opts;
  }

  private async _runChapterIndexing(): Promise<void> {
    const chapter = this._runner.currentChapter;
    if (!chapter) return;

    this._runner.beginRun();
    this.render({ force: true });

    try {
      const sceneCount = await this._createBuilder().indexChapter(
        chapter,
        this._indexingCallOptions(),
        (line) => this._addLogLine(line),
      );
      this._runner.chapterComplete(sceneCount);
    } catch (err) {
      this._runner.chapterFailed((err as Error).message);
    }

    this.render({ force: true });
  }

  private async _runIndexingOverview(): Promise<void> {
    try {
      const builder = this._createBuilder();
      const overviewContent = this._runner.overviewChapter
        ? builder.collectChapterContent(this._runner.overviewChapter)
        : undefined;
      await builder.indexOverview(overviewContent, this._indexingCallOptions());
      this._runner.overviewComplete();
    } catch (err) {
      this._runner.overviewFailed((err as Error).message);
    }

    this.render({ force: true });
  }

  /** Append a log line to the runner state and update the DOM directly (no full re-render). */
  private _addLogLine(line: string): void {
    this._runner.addLogLine(line);
    const logEl = this.element?.querySelector<HTMLElement>('#indexing-log');
    if (logEl) {
      const div = document.createElement('div');
      div.textContent = line;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
}
