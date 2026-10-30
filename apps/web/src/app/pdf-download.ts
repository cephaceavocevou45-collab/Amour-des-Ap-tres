const winAnsi = (value: string) => {
  const special: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  return Array.from(value, char => { const code = char.codePointAt(0) ?? 63; return code <= 0xff ? code : special[code] ?? 63; });
};
const bytes = (value: string) => Array.from(value, char => char.charCodeAt(0) & 255);
const concat = (...parts: number[][]) => parts.flat();
const pdfText = (value: string) => `<${winAnsi(value).map(byte => byte.toString(16).padStart(2, '0')).join('')}> Tj`;

export function downloadTextPdf(filename: string, text: string) {
  const expanded = text.split(/\r?\n/).flatMap(line => {
    if (!line) return [''];
    const words = line.split(/\s+/), result: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 92 && current) { result.push(current); current = word; } else current = next;
    }
    if (current) result.push(current);
    return result;
  });
  const pages: string[][] = [];
  for (let i = 0; i < expanded.length; i += 48) pages.push(expanded.slice(i, i + 48));
  if (!pages.length) pages.push([]);
  const objects: number[][] = [];
  objects[1] = bytes('<< /Type /Catalog /Pages 2 0 R >>');
  objects[3] = bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: string[] = [];
  pages.forEach((lines, index) => {
    const pageId = 4 + index * 2, contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const commands = ['BT', '/F1 10 Tf', '50 790 Td', '14 TL', ...lines.map((line, row) => `${row ? 'T* ' : ''}${pdfText(line)}`), 'ET'].join('\n');
    const content = bytes(commands);
    objects[pageId] = bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[contentId] = concat(bytes(`<< /Length ${content.length} >>\nstream\n`), content, bytes('\nendstream'));
  });
  objects[2] = bytes(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`);
  const chunks: number[][] = [bytes('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, id) => {
    if (!object) return;
    offsets[id] = length;
    const chunk = concat(bytes(`${id} 0 obj\n`), object, bytes('\nendobj\n'));
    chunks.push(chunk); length += chunk.length;
  });
  const xrefOffset = length;
  const xref = [`xref\n0 ${objects.length}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id < objects.length; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  chunks.push(bytes(xref.join('')));
  chunks.push(bytes(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  const blob = new Blob([new Uint8Array(concat(...chunks))], { type: 'application/pdf' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'programme-paroissial'}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
