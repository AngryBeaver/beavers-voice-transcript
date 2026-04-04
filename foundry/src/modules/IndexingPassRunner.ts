import type { ChapterCandidate } from './ChapterDetector.js';

export type IndexingPhase =
  | 'pre_chapter'
  | 'already_indexed'
  | 'running'
  | 'between'
  | 'overview'
  | 'complete';

/**
 * Pure state machine for the wizard's chapter-by-chapter indexing pass.
 *
 * No Foundry globals, no AI calls — only tracks what phase the pass is in
 * and exposes clean transition methods. Follows the ChapterDetector pattern:
 * pure logic, no side effects, fully testable without a running Foundry instance.
 */
export class IndexingPassRunner {
  private _queue: ChapterCandidate[] = [];
  private _overviewChapter: ChapterCandidate | null = null;
  private _currentIdx = 0;
  private _phase: IndexingPhase = 'pre_chapter';
  private _log: string[] = [];
  private _justCompleted = '';
  private _completedCount = 0;
  private _sceneCount = 0;
  private _error: string | null = null;

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get phase(): IndexingPhase {
    return this._phase;
  }
  get currentChapter(): ChapterCandidate | undefined {
    return this._queue[this._currentIdx];
  }
  get nextChapter(): ChapterCandidate | undefined {
    return this._queue[this._currentIdx + 1];
  }
  get overviewChapter(): ChapterCandidate | null {
    return this._overviewChapter;
  }
  get currentIdx(): number {
    return this._currentIdx;
  }
  get totalChapters(): number {
    return this._queue.length;
  }
  get hasNextChapter(): boolean {
    return this._currentIdx + 1 < this._queue.length;
  }
  get log(): string[] {
    return this._log;
  }
  get justCompleted(): string {
    return this._justCompleted;
  }
  get completedCount(): number {
    return this._completedCount;
  }
  get sceneCount(): number {
    return this._sceneCount;
  }
  get error(): string | null {
    return this._error;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  /** Initialise the runner for a new indexing pass. */
  start(queue: ChapterCandidate[], overviewChapter: ChapterCandidate | null): void {
    this._queue = queue;
    this._overviewChapter = overviewChapter;
    this._currentIdx = 0;
    this._phase = 'pre_chapter';
    this._log = [];
    this._justCompleted = '';
    this._completedCount = 0;
    this._sceneCount = 0;
    this._error = null;
  }

  /** Current chapter already has an index page — ask the GM to rebuild or skip. */
  markAlreadyIndexed(): void {
    this._phase = 'already_indexed';
  }

  /** AI call is starting for the current chapter. */
  beginRun(): void {
    this._phase = 'running';
    this._log = [`→ Indexing ${this.currentChapter?.name ?? ''}…`];
    this._error = null;
  }

  /** AI call succeeded; record scene count and advance to the between prompt. */
  chapterComplete(sceneCount: number): void {
    this._completedCount++;
    this._sceneCount += sceneCount;
    this._justCompleted = this.currentChapter?.name ?? '';
    this._phase = 'between';
  }

  /** AI call failed; show error and return to the pre-chapter prompt. */
  chapterFailed(error: string): void {
    this._error = error;
    this._phase = 'pre_chapter';
  }

  /** Skip the current chapter and move to the next. */
  skipCurrent(): void {
    this._advanceBy(1);
  }

  /** Continue to the next chapter after the between prompt. */
  continueToNext(): void {
    this._advanceBy(1);
  }

  /** Skip the next chapter (as shown in the between prompt) and move past it. */
  skipNext(): void {
    this._advanceBy(2);
  }

  /** Stop the indexing pass early; already-indexed chapters are kept. */
  stopEarly(): void {
    this._phase = 'complete';
  }

  /** All chapters done — start the overview generation. */
  startOverview(): void {
    this._phase = 'overview';
  }

  /** Overview page written successfully. */
  overviewComplete(): void {
    this._phase = 'complete';
  }

  /** Overview generation failed; record the error and still finish. */
  overviewFailed(error: string): void {
    this._error = error;
    this._phase = 'complete';
  }

  /** Append a line to the live log. */
  addLogLine(line: string): void {
    this._log.push(line);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _advanceBy(n: number): void {
    this._currentIdx += n;
    this._justCompleted = '';
    this._error = null;
    this._phase = this._currentIdx < this._queue.length ? 'pre_chapter' : 'between';
  }
}
