// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChapterRole = 'chapter' | 'overview' | 'skip';

export interface ChapterCandidate {
  id: string;
  name: string;
  sourceType: 'folder' | 'journal' | 'header';
  role: ChapterRole;
  tokens: number;
}

export interface DetectionResult {
  isMixed: boolean;
  /** Resolved candidates (populated when isMixed is false). */
  candidates: ChapterCandidate[];
  /** Subfolder candidates (populated when isMixed is true). */
  subfolders: ChapterCandidate[];
  /** Journal candidates (populated when isMixed is true). */
  journals: ChapterCandidate[];
}

// ---------------------------------------------------------------------------
// Game accessor — injected so logic is testable without Foundry globals
// ---------------------------------------------------------------------------

export interface FolderLike {
  id: string;
  name: string;
}

export interface PageLike {
  text?: { content?: string };
}

export interface JournalLike {
  id: string;
  name: string;
  pages: { contents: PageLike[] };
}

export interface GameAccessor {
  getFolder(id: string): FolderLike | null;
  getSubfolders(parentId: string): FolderLike[];
  getJournal(id: string): JournalLike | null;
  getJournalsInFolder(folderId: string): JournalLike[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INTRO_KEYWORDS: readonly string[] = [
  'intro',
  'introduction',
  'preface',
  'background',
  'foreword',
  'credits',
  'appendix',
  'prologue',
  'about',
  'overview',
  'welcome',
  'how to use',
  'read first',
  'getting started',
];

// ---------------------------------------------------------------------------
// ChapterDetector
// ---------------------------------------------------------------------------

/**
 * Analyses adventure content (folders / journals) and produces chapter
 * candidates for the Lore Index Wizard.
 *
 * Pure logic — all Foundry data access goes through the injected GameAccessor
 * so the class is fully testable without a running Foundry instance.
 */
export class ChapterDetector {
  constructor(private readonly accessor: GameAccessor) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Estimate the total number of AI input tokens for a location.
   * Uses the common `chars / 4` heuristic after stripping HTML tags.
   */
  estimateTokens(locationId: string, locationType: 'folder' | 'journal'): number {
    const chars =
      locationType === 'folder'
        ? this._charsFromFolder(locationId)
        : this._charsFromJournal(locationId);
    return Math.ceil(chars / 4);
  }

  /**
   * Detect chapter candidates for the given location.
   *
   * - Journal: chapters are derived from h1/h2 headings in the journal pages.
   * - Folder (subfolders only): one candidate per subfolder.
   * - Folder (journals only): one candidate per journal.
   * - Folder (mixed): returns isMixed=true with separate subfolders/journals
   *   lists so the caller can ask the GM which to use.
   * - Folder (empty): the entire folder becomes a single candidate.
   *
   * The first candidate is automatically flagged as 'overview' if its name
   * matches an intro keyword (see {@link flagIntroCandidate}).
   */
  detect(locationId: string, locationType: 'folder' | 'journal'): DetectionResult {
    if (locationType === 'journal') {
      const candidates = this._candidatesFromHeaders(locationId);
      flagIntroCandidate(candidates);
      return { isMixed: false, candidates, subfolders: [], journals: [] };
    }

    const subfolders = this._candidatesFromSubfolders(locationId);
    const journals = this._candidatesFromJournalsInFolder(locationId);

    if (subfolders.length > 0 && journals.length > 0) {
      return { isMixed: true, candidates: [], subfolders, journals };
    }

    let candidates: ChapterCandidate[];
    if (subfolders.length > 0) {
      candidates = subfolders;
    } else if (journals.length > 0) {
      candidates = journals;
    } else {
      const folder = this.accessor.getFolder(locationId);
      candidates = [
        {
          id: locationId,
          name: folder?.name ?? locationId,
          sourceType: 'folder',
          role: 'chapter',
          tokens: Math.ceil(this._charsFromFolder(locationId) / 4),
        },
      ];
    }

    flagIntroCandidate(candidates);
    return { isMixed: false, candidates, subfolders: [], journals: [] };
  }

  // ---------------------------------------------------------------------------
  // Private — candidate builders
  // ---------------------------------------------------------------------------

  private _candidatesFromSubfolders(folderId: string): ChapterCandidate[] {
    return this.accessor.getSubfolders(folderId).map((f) => ({
      id: f.id,
      name: f.name,
      sourceType: 'folder' as const,
      role: 'chapter' as ChapterRole,
      tokens: Math.ceil(this._charsFromFolder(f.id) / 4),
    }));
  }

  private _candidatesFromJournalsInFolder(folderId: string): ChapterCandidate[] {
    return this.accessor.getJournalsInFolder(folderId).map((j) => ({
      id: j.id,
      name: j.name,
      sourceType: 'journal' as const,
      role: 'chapter' as ChapterRole,
      tokens: Math.ceil(this._charsFromJournal(j.id) / 4),
    }));
  }

  /**
   * Split a single journal into candidates using its h1/h2 headings.
   * Content before the first heading is ignored.
   * Falls back to a single candidate (the whole journal) if no headings exist.
   */
  private _candidatesFromHeaders(journalId: string): ChapterCandidate[] {
    const journal = this.accessor.getJournal(journalId);
    if (!journal) return [];

    const allHtml = journal.pages.contents.map((p) => p.text?.content ?? '').join('\n');

    const parts = allHtml.split(/(<h[12][^>]*>[\s\S]*?<\/h[12]>)/gi);
    const sections: Array<{ name: string; chars: number }> = [];
    let currentName: string | null = null;
    let currentChars = 0;

    for (const part of parts) {
      const match = part.match(/^<h[12][^>]*>([\s\S]*?)<\/h[12]>$/i);
      if (match) {
        if (currentName !== null) sections.push({ name: currentName, chars: currentChars });
        currentName = match[1].replace(/<[^>]*>/g, '').trim();
        currentChars = 0;
      } else if (currentName !== null) {
        currentChars += part.replace(/<[^>]*>/g, '').length;
      }
    }
    if (currentName !== null) sections.push({ name: currentName, chars: currentChars });

    if (sections.length === 0) {
      return [
        {
          id: journalId,
          name: journal.name,
          sourceType: 'journal',
          role: 'chapter',
          tokens: Math.ceil(this._charsFromJournal(journalId) / 4),
        },
      ];
    }

    return sections.map((s, i) => ({
      id: `${journalId}::h::${i}`,
      name: s.name,
      sourceType: 'header' as const,
      role: 'chapter' as ChapterRole,
      tokens: Math.ceil(s.chars / 4),
    }));
  }

  // ---------------------------------------------------------------------------
  // Private — char counting
  // ---------------------------------------------------------------------------

  private _charsFromFolder(folderId: string): number {
    const journalChars = this.accessor
      .getJournalsInFolder(folderId)
      .reduce((sum, j) => sum + this._charsFromJournal(j.id), 0);

    const subfolderChars = this.accessor
      .getSubfolders(folderId)
      .reduce((sum, sf) => sum + this._charsFromFolder(sf.id), 0);

    return journalChars + subfolderChars;
  }

  private _charsFromJournal(journalId: string): number {
    const journal = this.accessor.getJournal(journalId);
    if (!journal) return 0;
    return journal.pages.contents.reduce(
      (sum, p) => sum + (p.text?.content ?? '').replace(/<[^>]*>/g, '').length,
      0,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scan all candidates and pre-flag any whose name contains an intro keyword
 * as 'overview'. Mutates in place. The GM can correct wrong suggestions in
 * the chapters confirmation step.
 */
export function flagIntroCandidate(candidates: ChapterCandidate[]): void {
  for (const candidate of candidates) {
    const lower = candidate.name.toLowerCase();
    if (INTRO_KEYWORDS.some((kw) => lower.includes(kw))) {
      candidate.role = 'overview';
    }
  }
}
