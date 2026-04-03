import { LORE_INDEX_JOURNAL_NAME, MODULE_FOLDER_NAME, NAMESPACE } from '../definitions.js';
import {
  ChapterCandidate,
  ChapterDetector,
  ChapterRole,
  flagIntroCandidate,
  GameAccessor,
} from '../modules/ChapterDetector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocationItem {
  id: string;
  name: string;
  type: 'folder' | 'journal';
}

/** View-model version of a chapter candidate with pre-computed role booleans. */
interface ChapterCandidateView extends ChapterCandidate {
  roleIsOverview: boolean;
  roleIsChapter: boolean;
  roleIsSkip: boolean;
  /** Whether to show the "Overview source" radio — first non-header candidate only. */
  showOverviewOption: boolean;
}

type WizardStep = 'location' | 'status' | 'mixed' | 'chapters';
type IndexStatus = 'none' | 'exists';

interface WizardContext {
  // common
  locationName: string;
  locationType: 'folder' | 'journal';
  // location step
  locations: LocationItem[];
  // status step
  indexStatus: IndexStatus;
  inputTokensFormatted: string;
  claudeCostEstimate: string;
  // mixed step
  mixedFolders: ChapterCandidate[];
  mixedJournals: ChapterCandidate[];
  // chapters step
  chapters: ChapterCandidateView[];
}

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
 * Each step has its own Handlebars template declared in PARTS.
 * Only the active step's part is rendered on each transition.
 * Chapter detection is delegated to {@link ChapterDetector}.
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
      startBuild: LoreIndexWizard._onStartBuild,
      startRebuild: LoreIndexWizard._onStartRebuild,
      startEnrichment: LoreIndexWizard._onStartEnrichment,
      useMixedFolders: LoreIndexWizard._onUseMixedFolders,
      useMixedJournals: LoreIndexWizard._onUseMixedJournals,
      useMixedBoth: LoreIndexWizard._onUseMixedBoth,
      backToStatus: LoreIndexWizard._onBackToStatus,
      confirmChapters: LoreIndexWizard._onConfirmChapters,
    },
  };

  static PARTS = {
    location: { template: `modules/${NAMESPACE}/templates/wizard/location.hbs` },
    status: { template: `modules/${NAMESPACE}/templates/wizard/status.hbs` },
    mixed: { template: `modules/${NAMESPACE}/templates/wizard/mixed.hbs` },
    chapters: { template: `modules/${NAMESPACE}/templates/wizard/chapters.hbs` },
  };

  private static _instance: LoreIndexWizard | null = null;

  // Wizard state — persists across step transitions within one session
  private _step: WizardStep = 'location';
  private _selectedLocation: LocationItem | null = null;
  private _indexStatus: IndexStatus = 'none';
  private _inputTokens: number = 0;
  private _chapters: ChapterCandidate[] = [];
  private _mixedFolders: ChapterCandidate[] = [];
  private _mixedJournals: ChapterCandidate[] = [];

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

    if (this._step === 'chapters') {
      this._setupChapterDragDrop();
    }
  }

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

  async _prepareContext(_options: object): Promise<WizardContext> {
    return {
      locationName: this._selectedLocation?.name ?? '',
      locationType: this._selectedLocation?.type ?? 'folder',
      locations: this._collectLocations(),
      indexStatus: this._indexStatus,
      inputTokensFormatted: this._inputTokens.toLocaleString(),
      claudeCostEstimate: this._claudeCostEstimate(),
      mixedFolders: this._mixedFolders,
      mixedJournals: this._mixedJournals,
      chapters: this._chapters.map((c) => ({
        ...c,
        roleIsOverview: c.role === 'overview',
        roleIsChapter: c.role === 'chapter',
        roleIsSkip: c.role === 'skip',
        showOverviewOption: true,
      })),
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

  private _detectIndexStatus(): IndexStatus {
    const modFolder = (game.folders as any)?.find(
      (f: any) => f.name === MODULE_FOLDER_NAME && f.type === 'JournalEntry',
    );
    if (!modFolder) return 'none';
    const indexJournal = (game.journal as any)?.find(
      (j: any) => j.folder?.id === modFolder.id && j.name === LORE_INDEX_JOURNAL_NAME,
    );
    return indexJournal?.pages.size > 0 ? 'exists' : 'none';
  }

  private _resolveLocationName(id: string, type: 'folder' | 'journal'): string {
    if (type === 'folder') return (game.folders as any)?.get(id)?.name ?? id;
    return (game.journal as any)?.get(id)?.name ?? id;
  }

  // ---------------------------------------------------------------------------
  // Cost estimation
  // ---------------------------------------------------------------------------

  private _claudeCostEstimate(): string {
    if (this._inputTokens === 0) return '—';
    const cost = (this._inputTokens / 1_000_000) * 3;
    return cost < 0.01 ? '< $0.01' : `~$${cost.toFixed(2)}`;
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
  // Actions
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
    this._indexStatus = this._detectIndexStatus();
    this._inputTokens = this._detector.estimateTokens(opt.value, type);
    this._goToStep('status');
  }

  static async _onBackToLocation(this: LoreIndexWizard): Promise<void> {
    this._goToStep('location');
  }

  static async _onBackToStatus(this: LoreIndexWizard): Promise<void> {
    this._goToStep('status');
  }

  static async _onStartBuild(this: LoreIndexWizard): Promise<void> {
    this._runChapterDetection();
  }

  static async _onStartRebuild(this: LoreIndexWizard): Promise<void> {
    this._runChapterDetection();
  }

  static async _onStartEnrichment(this: LoreIndexWizard): Promise<void> {
    // Task 0.6 — map enrichment pass
    ui.notifications.info('Map enrichment — coming in Task 0.6.');
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

    // Task 0.4 — model selection
    ui.notifications.info('Model selection — coming in Task 0.4.');
  }
}
