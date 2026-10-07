// ---------------------------------------------------------------------------
// HTML utilities
// ---------------------------------------------------------------------------

function convertTable(tableInner: string): string {
  const rows: string[][] = [];

  for (const rowMatch of tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(
        cellMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    if (cells.length) rows.push(cells);
  }

  if (!rows.length) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (row: string[]) => [...row, ...Array(colCount - row.length).fill('')];

  const lines = [
    '| ' + pad(rows[0]).join(' | ') + ' |',
    '| ' + Array(colCount).fill('---').join(' | ') + ' |',
    ...rows.slice(1).map((r) => '| ' + pad(r).join(' | ') + ' |'),
  ];

  return '\n' + lines.join('\n') + '\n';
}

function convertList(listInner: string, ordered: boolean): string {
  const items: string[] = [];
  let i = 1;
  for (const m of listInner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = m[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) items.push(ordered ? `${i++}. ${text}` : `- ${text}`);
  }
  return items.length ? '\n' + items.join('\n') + '\n' : '';
}

export function pageText(page: any): string {
  return page.text?.format === 2
    ? (page.text?.markdown ?? '')
    : stripHtml(page.text?.content ?? '');
}

export function stripHtml(html: string, h1Level = 3): string {
  const h = (n: number): string => '#'.repeat(Math.min(h1Level + n - 1, 6));
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `\n${h(1)} ${t}\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `\n${h(2)} ${t}\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `\n${h(3)} ${t}\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, t) => `\n${h(4)} ${t}\n`)
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_, t) => `\n${h(5)} ${t}\n`)
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_, t) => `\n${h(6)} ${t}\n`)
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => convertTable(inner))
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => convertList(inner, true))
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => convertList(inner, false))
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
