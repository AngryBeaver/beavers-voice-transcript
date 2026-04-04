import {
  NAMESPACE,
  SETTINGS,
  MODULE_FOLDER_NAME,
  LORE_INDEX_JOURNAL_NAME,
} from '../definitions.js';
import { AiService, CallOptions } from '../services/AiService.js';
import { GameData } from './ContextBuilder.js';
import { JournalApi } from './JournalApi.js';
import { ChapterCandidate } from './ChapterDetector.js';
import { stripHtml, escapeHtml, parseIndexOutput } from './loreIndexUtils.js';

/**
 * Builds a hierarchical lore index from adventure journal pages.
 *
 * Two modes of operation:
 * - Per-chapter (Task 1.2): `indexChapter` + `indexOverview` write individual
 *   `Chapter:` / `Scene:` / `Overview` pages to the lore-index journal.
 * - Legacy monolithic (backwards compat): `build` dumps the whole adventure
 *   into a single "Index" page.
 */
export class LoreIndexBuilder {
  readonly #game: GameData;
  readonly #aiService: AiService;

  constructor(gameData: GameData, aiService?: AiService) {
    this.#game = gameData;
    this.#aiService = aiService ?? AiService.create(gameData);
  }

  // ---------------------------------------------------------------------------
  // Per-chapter indexing
  // ---------------------------------------------------------------------------

  /** Check whether a `Chapter: <name>` page already exists in the lore index. */
  isChapterIndexed(chapterName: string): boolean {
    const modFolder = (this.#game as any).folders?.find(
      (f: any) => f.name === MODULE_FOLDER_NAME && f.type === 'JournalEntry',
    );
    if (!modFolder) return false;
    const indexJournal = (this.#game as any).journal?.find(
      (j: any) => j.folder?.id === modFolder.id && j.name === LORE_INDEX_JOURNAL_NAME,
    );
    if (!indexJournal) return false;
    return (indexJournal.pages.contents as any[]).some(
      (p: any) => p.name === `Chapter: ${chapterName}`,
    );
  }

  /**
   * Collect and format the source text for a single chapter candidate.
   * Public so callers (e.g. LoreIndexWizard) can pass content to `indexOverview`.
   */
  collectChapterContent(chapter: ChapterCandidate): string {
    if (chapter.sourceType === 'folder') {
      return this._formatPagesForContext(this._collectPages(chapter.id));
    }
    if (chapter.sourceType === 'journal') {
      const journal = (this.#game as any).journal?.find((j: any) => j.id === chapter.id);
      if (!journal) return '';
      const pages = (journal.pages.contents as any[])
        .map((p: any) => ({
          journalName: journal.name as string,
          pageName: p.name as string,
          content: stripHtml(p.text?.content ?? '').trim(),
        }))
        .filter((p) => p.content);
      return this._formatPagesForContext(pages);
    }
    if (chapter.sourceType === 'header') {
      // id format: "${journalId}::h::${index}"
      const parts = chapter.id.split('::h::');
      if (parts.length !== 2) return '';
      return this._collectHeaderContent(parts[0], parseInt(parts[1], 10));
    }
    return '';
  }

  /**
   * Index a single chapter: calls AI, parses sentinel-delimited output, and
   * writes `Chapter: <name>` + `Scene: <name>` pages to the lore-index journal.
   *
   * @param chapter     The chapter candidate to index.
   * @param callOptions Model / token options passed to the AI service.
   * @param onProgress  Callback invoked for each log line (scene written, etc.).
   * @returns           Number of scenes written.
   */
  async indexChapter(
    chapter: ChapterCandidate,
    callOptions: CallOptions,
    onProgress: (line: string) => void,
  ): Promise<number> {
    await this._ensureLoreIndexJournal();

    const content = this.collectChapterContent(chapter);
    if (!content.trim()) {
      throw new Error(`No content found for chapter: "${chapter.name}"`);
    }

    const systemPrompt = `You are a lore indexer for a tabletop RPG adventure.
You will receive the raw content of one adventure chapter and produce a structured index.

Use EXACTLY these sentinel delimiters — each on its own line — to separate sections:
---CHAPTER: <chapter name>---
<neutral arc summary: what this chapter covers, all scenes listed, stakes, themes — ~200 words>
---SCENE: <scene name>---
<full scene detail: sublocations as a flat list, NPCs present with brief descriptions, what happens — ~300 words>

Rules:
- Include ALL scenes you can identify.
- Write neutrally — no visited/unvisited framing.
- Do not invent scenes, NPCs, or locations not present in the source.
- Output exactly one ---CHAPTER: ...--- block, then one ---SCENE: ...--- block per scene.`;

    const userPrompt = `Index this chapter:\n\n${content}\n\nBegin with ---CHAPTER: ${chapter.name}---`;

    onProgress(`→ Sending to AI…`);

    const { content: raw } = await this.#aiService.call(systemPrompt, userPrompt, {
      ...callOptions,
      max_tokens: 32768,
    });

    return this._writeChapterPages(chapter.name, raw, onProgress);
  }

  /**
   * Generate the `Overview` page from existing `Chapter:` pages in the lore
   * index, plus optional background source text from an overview-role chapter.
   */
  async indexOverview(overviewSource?: string, callOptions?: CallOptions): Promise<void> {
    await this._ensureLoreIndexJournal();

    const chapterSummaries = this._readChapterSummaries();

    const systemPrompt = `You are a lore indexer for a tabletop RPG adventure.
Produce a concise Overview page containing:
- Global NPCs (name + one-line description, no chapter-level duplicates)
- Factions (name + one-line description)
- World context (1–2 paragraphs: setting, tone, background)
Write neutrally — no visited/unvisited framing. Keep it under 500 words.`;

    const parts = [
      overviewSource ? `## Background Source\n${overviewSource}` : '',
      chapterSummaries.length > 0 ? `## Chapter Summaries\n${chapterSummaries.join('\n\n')}` : '',
    ].filter(Boolean);

    const userPrompt = `Produce the Overview page from this adventure content:\n\n${parts.join('\n\n')}`;

    const { content: overview } = await this.#aiService.call(systemPrompt, userPrompt, {
      ...(callOptions ?? {}),
      max_tokens: 4096,
    });

    await JournalApi.writeJournalPage(LORE_INDEX_JOURNAL_NAME, {
      name: 'Overview',
      type: 'text',
      text: { content: `<div>${escapeHtml(overview)}</div>`, format: 1 },
    });
  }

  // ---------------------------------------------------------------------------
  // Private — per-chapter helpers
  // ---------------------------------------------------------------------------

  private async _ensureLoreIndexJournal(): Promise<void> {
    const existing = (this.#game as any).journal?.find(
      (j: any) => j.name === LORE_INDEX_JOURNAL_NAME,
    );
    if (!existing) {
      await JournalApi.writeJournal({
        name: LORE_INDEX_JOURNAL_NAME,
        folder: MODULE_FOLDER_NAME,
        pages: [],
      });
    }
  }

  private async _writeChapterPages(
    chapterName: string,
    raw: string,
    onProgress: (line: string) => void,
  ): Promise<number> {
    const { chapterSummary, scenes } = parseIndexOutput(raw);

    // Write scenes first (matches expected log order)
    let sceneCount = 0;
    for (const [sceneName, sceneContent] of scenes) {
      await JournalApi.writeJournalPage(LORE_INDEX_JOURNAL_NAME, {
        name: `Scene: ${sceneName}`,
        type: 'text',
        text: { content: `<div>${escapeHtml(sceneContent)}</div>`, format: 1 },
      });
      onProgress(`  ✓ Scene: ${sceneName}`);
      sceneCount++;
    }

    await JournalApi.writeJournalPage(LORE_INDEX_JOURNAL_NAME, {
      name: `Chapter: ${chapterName}`,
      type: 'text',
      text: { content: `<div>${escapeHtml(chapterSummary)}</div>`, format: 1 },
    });
    onProgress(`  ✓ Chapter summary written.`);

    return sceneCount;
  }

  private _readChapterSummaries(): string[] {
    const modFolder = (this.#game as any).folders?.find(
      (f: any) => f.name === MODULE_FOLDER_NAME && f.type === 'JournalEntry',
    );
    const indexJournal = (this.#game as any).journal?.find(
      (j: any) => j.folder?.id === modFolder?.id && j.name === LORE_INDEX_JOURNAL_NAME,
    );
    if (!indexJournal) return [];

    const summaries: string[] = [];
    for (const page of indexJournal.pages.contents as any[]) {
      if (page.name?.startsWith('Chapter: ')) {
        const text = stripHtml(page.text?.content ?? '').trim();
        if (text) summaries.push(`## ${page.name}\n${text}`);
      }
    }
    return summaries;
  }

  private _collectHeaderContent(journalId: string, headerIndex: number): string {
    const journal = (this.#game as any).journal?.find((j: any) => j.id === journalId);
    if (!journal) return '';

    const allHtml = (journal.pages.contents as any[])
      .map((p: any) => p.text?.content ?? '')
      .join('\n');

    const sections: string[] = [];
    let current: string | null = null;
    for (const part of allHtml.split(/(<h[12][^>]*>[\s\S]*?<\/h[12]>)/gi)) {
      if (/^<h[12]/i.test(part)) {
        if (current !== null) sections.push(current);
        current = part;
      } else if (current !== null) {
        current += part;
      }
    }
    if (current !== null) sections.push(current);

    return sections[headerIndex] ? stripHtml(sections[headerIndex]) : '';
  }

  // ---------------------------------------------------------------------------
  // Legacy monolithic build (backwards compatibility)
  // ---------------------------------------------------------------------------

  /**
   * Build or rebuild the entire lore index in one AI call, writing a single
   * "Index" page. Kept for backwards compatibility; prefer `indexChapter` +
   * `indexOverview` for new usage.
   */
  async build(): Promise<string> {
    const adventureFolder =
      (this.#game.settings.get(NAMESPACE, SETTINGS.ADVENTURE_JOURNAL_FOLDER) as string) || '';

    if (!adventureFolder) {
      throw new Error('Adventure journal folder is not configured in AI Assistant settings.');
    }

    const advFolder = this.#game.folders?.find(
      (f) => f.name === adventureFolder && f.type === 'JournalEntry',
    );
    if (!advFolder) {
      throw new Error(`Adventure folder not found: "${adventureFolder}"`);
    }

    const pages = this._collectPages(advFolder.id);
    if (!pages.length) {
      throw new Error(`No journal pages found in adventure folder: "${adventureFolder}"`);
    }

    console.log(`[Lore Index] Found ${pages.length} pages. Sending to AI service...`);

    const index = await this._generateIndex(this._formatPagesForContext(pages));
    await this._writeIndex(index);

    console.log(`[Lore Index] Successfully built and saved index.`);
    return index;
  }

  private _collectPages(
    folderId: string,
  ): Array<{ journalName: string; pageName: string; content: string }> {
    const pages: Array<{ journalName: string; pageName: string; content: string }> = [];

    const journals = this.#game.journal?.filter((j) => j.folder?.id === folderId) ?? [];
    for (const journal of journals) {
      for (const page of journal.pages.contents) {
        const content = stripHtml(page.text?.content ?? '').trim();
        if (content) pages.push({ journalName: journal.name, pageName: page.name, content });
      }
    }

    const subfolders =
      this.#game.folders?.filter((f) => f.folder?.id === folderId && f.type === 'JournalEntry') ??
      [];
    for (const subfolder of subfolders) {
      pages.push(...this._collectPages(subfolder.id));
    }

    return pages;
  }

  private _formatPagesForContext(
    pages: Array<{ journalName: string; pageName: string; content: string }>,
  ): string {
    return pages.map((p) => `## ${p.journalName} — ${p.pageName}\n${p.content}`).join('\n\n');
  }

  private async _generateIndex(contentToIndex: string): Promise<string> {
    const systemPrompt = `You are a lore index builder for a tabletop RPG campaign.
You will receive raw adventure journal content and produce a hierarchical, structured index.

The index should be organized as:
- Adventure parts (e.g., "## Part 1: The Arrival")
  - Scene summaries under each part (e.g., "### Scene 1: The Road to Millhaven")
    - Summary (what happens in this scene)
    - Parts (Some Scenes are big and have multiple parts e.g. sublocations/rooms short summary of each of those if any)
    - NPCs Present (list with brief descriptions)
    - Locations (list with brief descriptions)
    - Factions (list with brief descriptions)
- Global World section (## World (Global Context))
  - All NPCs (consolidated list)
  - All Locations (consolidated list)
  - All Factions (consolidated list)

Structure the index ONLY from the provided content. Do NOT invent new scenes, NPCs, or locations.
Keep descriptions concise (1 line per entry in lists).`;

    const userPrompt = `Build a hierarchical lore index from this adventure content:

${contentToIndex}

Produce the index as markdown. Start directly with ## Part 1 or ## World if there are no explicit parts.`;

    try {
      const { content: index } = await this.#aiService.call(systemPrompt, userPrompt, {
        max_tokens: 32768,
      });
      return index;
    } catch (err) {
      console.error('AI service error:', err);
      throw new Error(`Failed to generate lore index: ${(err as Error).message}`);
    }
  }

  private async _writeIndex(indexContent: string): Promise<void> {
    try {
      const modFolder = this.#game.folders?.find(
        (f) => f.name === MODULE_FOLDER_NAME && f.type === 'JournalEntry',
      );
      if (!modFolder) {
        throw new Error(
          `Module folder "${MODULE_FOLDER_NAME}" not found. It should be created automatically.`,
        );
      }

      const indexJournal = this.#game.journal?.find(
        (j) => j.folder?.id === modFolder.id && j.name === LORE_INDEX_JOURNAL_NAME,
      );

      const pageData = {
        name: 'Index',
        type: 'text' as const,
        text: { content: `<div>${escapeHtml(indexContent)}</div>`, format: 1 as const },
      };

      if (!indexJournal) {
        await JournalApi.writeJournal({
          name: LORE_INDEX_JOURNAL_NAME,
          folder: MODULE_FOLDER_NAME,
          pages: [pageData],
        });
      } else {
        await JournalApi.writeJournalPage(LORE_INDEX_JOURNAL_NAME, pageData);
      }
    } catch (err) {
      console.error('Failed to write lore index journal:', err);
      throw new Error(`Failed to save lore index: ${(err as Error).message}`);
    }
  }
}
