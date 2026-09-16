function ascii(text) {
  return String(text ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (ch) => {
    if (ch === '₹') return 'Rs';
    if (ch === '—') return '-';
    return '?';
  });
}

export function csvCell(value) {
  if (value == null || value === '') return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pdfString(text) {
  return `(${ascii(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function wrapLine(text, width = 92) {
  const raw = ascii(text);
  if (raw.length <= width) return [raw];
  const out = [];
  for (let i = 0; i < raw.length; i += width) out.push(raw.slice(i, i + width));
  return out;
}

export function linesToPdfBlob(title, lines) {
  const header = [`BharatGrow - ${ascii(title)}`, `Generated ${new Date().toISOString()}`, ''];
  const wrapped = [];
  for (const line of [...header, ...lines.map((item) => String(item ?? ''))]) {
    wrapLine(line).forEach((piece) => wrapped.push(piece));
  }
  const perPage = 56;
  const pages = [];
  for (let i = 0; i < wrapped.length; i += perPage) pages.push(wrapped.slice(i, i + perPage));
  if (!pages.length) pages.push(['No retrieved records.']);

  const streams = pages.map((chunk) => {
    let body = 'BT\n/F1 10 Tf\n14 TL\n48 800 Td\n';
    chunk.forEach((line, index) => {
      if (index) body += 'T*\n';
      body += `${pdfString(line)} Tj\n`;
    });
    body += 'ET\n';
    return body;
  });

  const objectBodies = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const contentIds = streams.map((_, i) => 4 + i);
  const pageIds = streams.map((_, i) => 4 + streams.length + i);

  objectBodies[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objectBodies[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objectBodies[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  streams.forEach((stream, i) => {
    objectBodies[contentIds[i]] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    objectBodies[pageIds[i]] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objectBodies.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objectBodies[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objectBodies.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objectBodies.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objectBodies.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

export function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function flattenObject(prefix, value, into = {}) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    into[prefix] = Array.isArray(value) ? value.join('; ') : value;
    return into;
  }
  Object.entries(value).forEach(([key, nested]) => {
    flattenObject(prefix ? `${prefix}_${key}` : key, nested, into);
  });
  return into;
}
