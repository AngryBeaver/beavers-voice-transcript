// ---------------------------------------------------------------------------
// HTML utilities
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n### $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n#### $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n##### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n###### $1\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n####### $1\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// ---------------------------------------------------------------------------
// AI output parser
// ---------------------------------------------------------------------------

export interface IndexOutputBlock {
  chapterSummary: string;
  scenes: Map<string, string>;
}

/**
 * Parse sentinel-delimited AI output into a chapter summary and scene map.
 *
 * Expected format (each sentinel on its own line):
 * ```
 * ---CHAPTER: Name---
 * ...chapter summary text...
 * ---SCENE: Scene Name---
 * ...scene detail text...
 * ```
 */
export function parseIndexOutput(raw: string): IndexOutputBlock {
  const scenes = new Map<string, string>();
  let chapterSummary = '';

  type Block = { type: 'CHAPTER' | 'SCENE'; name: string };
  let current: Block | null = null;
  const currentLines: string[] = [];

  const flush = (): void => {
    if (!current) return;
    const content = currentLines.join('\n').trim();
    if (current.type === 'CHAPTER') {
      chapterSummary = content;
    } else {
      scenes.set(current.name, content);
    }
    currentLines.length = 0;
  };

  for (const line of raw.split('\n')) {
    const chm = line.match(/^---CHAPTER:\s*([^-]+?)\s*---\s*$/);
    const scm = line.match(/^---SCENE:\s*([^-]+?)\s*---\s*$/);
    if (chm) {
      flush();
      current = { type: 'CHAPTER', name: chm[1] };
    } else if (scm) {
      flush();
      current = { type: 'SCENE', name: scm[1] };
    } else if (current) {
      currentLines.push(line);
    }
  }
  flush();

  return { chapterSummary, scenes };
}
