// ---------------- DSL parsing ----------------
// Every collector below stops the moment it sees the start of a new
// recognized block, even if the matching END tag is missing, so one typo
// never silently swallows the rest of the document.

const DEFAULT_META = {
  kicker: 'Software Requirements Specification',
  title: 'Untitled\nDocument',
  description: '',
  preparedFor: '',
  preparedBy: 'Beforth',
  date: '',
  version: '1.0 Draft',
  brand: 'BEFORTH',
  docLabel: '',
  footerLabel: 'Beforth — Document',
  howToRead: '',
};

function parseMeta(text) {
  const meta = Object.assign({}, DEFAULT_META);
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3);
    if (end !== -1) {
      const block = text.slice(3, end);
      block.split('\n').forEach((line) => {
        const idx = line.indexOf(':');
        if (idx === -1) return;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) meta[k] = v;
      });
    }
  }
  return meta;
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s) {
  let t = escapeHtml(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/-&gt;/g, '→');
  return t;
}

function isBlockStarter(line) {
  return (
    /^PAGEBREAK$/i.test(line) || /^BLANKPAGE$/i.test(line) || /^##\s+/.test(line) || /^#\s+/.test(line) ||
    /^PILL:/i.test(line) || /^NOTE:/i.test(line) || /^EXAMPLE:/i.test(line) ||
    /^DIAGRAM:/i.test(line) || /^IMAGE:/i.test(line) ||
    /^TABLE\s+REQ$/i.test(line) || /^TABLE\s+DATA$/i.test(line) || /^TABLE\s+PRICE$/i.test(line) ||
    /^CARDS$/i.test(line) || /^GLOSSARY$/i.test(line) || /^STEPS$/i.test(line) ||
    /^BULLETS$/i.test(line) || /^TOTALS$/i.test(line) || /^SIGNATURE$/i.test(line)
  );
}

function colIdx(headers, rows) {
  return headers.map((h, ci) => {
    const vals = rows.map((r) => (r[ci] || '').trim()).filter((v) => v !== '');
    if (!vals.length) return false;
    return vals.every((v) => /^[₹$€£]?\s?-?[\d,]+(\.\d+)?%?$/.test(v));
  });
}

function parseBody(lines) {
  const blocks = [];
  let i = 0;
  let para = [];
  function flushPara() {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ') });
      para = [];
    }
  }
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === '') { flushPara(); i++; continue; }

    if (/^PAGEBREAK$/i.test(line)) { flushPara(); blocks.push({ type: 'pagebreak' }); i++; continue; }
    if (/^BLANKPAGE$/i.test(line)) { flushPara(); blocks.push({ type: 'blankpage' }); i++; continue; }

    if (/^##\s+/.test(line)) {
      flushPara();
      const rest = line.replace(/^##\s+/, '');
      const [num, ...titleParts] = rest.split('|');
      blocks.push({ type: 'h2', num: titleParts.length ? num.trim() : '', title: titleParts.length ? titleParts.join('|').trim() : num.trim() });
      i++; continue;
    }
    if (/^#\s+/.test(line)) {
      flushPara();
      const rest = line.replace(/^#\s+/, '');
      const [num, ...titleParts] = rest.split('|');
      blocks.push({ type: 'h1', num: titleParts.length ? num.trim() : '', title: titleParts.length ? titleParts.join('|').trim() : num.trim() });
      i++; continue;
    }
    if (/^PILL:/i.test(line)) {
      flushPara();
      blocks.push({ type: 'pill', text: line.replace(/^PILL:/i, '').trim() });
      i++; continue;
    }
    if (/^IMAGE:/i.test(line)) {
      flushPara();
      const rest = line.replace(/^IMAGE:/i, '').trim();
      const [src, ...capParts] = rest.split('|');
      blocks.push({ type: 'image', src: src.trim(), caption: capParts.join('|').trim() });
      i++; continue;
    }
    if (/^NOTE:/i.test(line)) {
      flushPara();
      const title = line.replace(/^NOTE:/i, '').trim();
      i++;
      const body = [];
      while (i < lines.length && !/^END NOTE$/i.test(lines[i].trim())) {
        if (isBlockStarter(lines[i].trim())) break;
        body.push(lines[i]); i++;
      }
      if (i < lines.length && /^END NOTE$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'note', title, body: body.join('\n').trim() });
      continue;
    }
    if (/^EXAMPLE:/i.test(line)) {
      flushPara();
      const title = line.replace(/^EXAMPLE:/i, '').trim();
      i++;
      const body = [];
      while (i < lines.length && !/^END EXAMPLE$/i.test(lines[i].trim())) {
        if (isBlockStarter(lines[i].trim())) break;
        body.push(lines[i]); i++;
      }
      if (i < lines.length && /^END EXAMPLE$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'example', title, body: body.join('\n').trim() });
      continue;
    }
    if (/^DIAGRAM:/i.test(line)) {
      flushPara();
      const title = line.replace(/^DIAGRAM:/i, '').trim();
      i++;
      const body = [];
      while (i < lines.length && !/^END DIAGRAM$/i.test(lines[i].trim())) {
        if (isBlockStarter(lines[i].trim())) break;
        body.push(lines[i]); i++;
      }
      if (i < lines.length && /^END DIAGRAM$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'diagram', title, source: body.join('\n').trim() });
      continue;
    }
    if (/^TABLE\s+REQ$/i.test(line)) {
      flushPara(); i++;
      const rows = [];
      while (i < lines.length && !/^END TABLE$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) rows.push(l.split('|').map((s) => s.trim()));
        i++;
      }
      if (i < lines.length && /^END TABLE$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'reqtable', rows });
      continue;
    }
    if (/^TABLE\s+DATA$/i.test(line)) {
      flushPara(); i++;
      const rows = [];
      while (i < lines.length && !/^END TABLE$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) rows.push(l.split('|').map((s) => s.trim()));
        i++;
      }
      if (i < lines.length && /^END TABLE$/i.test(lines[i].trim())) i++;
      const headers = rows.shift() || [];
      blocks.push({ type: 'datatable', headers, rows });
      continue;
    }
    if (/^TABLE\s+PRICE$/i.test(line)) {
      flushPara(); i++;
      const rows = [];
      while (i < lines.length && !/^END TABLE$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) rows.push(l.split('|').map((s) => s.trim()));
        i++;
      }
      if (i < lines.length && /^END TABLE$/i.test(lines[i].trim())) i++;
      const headers = rows.shift() || [];
      blocks.push({ type: 'pricetable', headers, rows });
      continue;
    }
    if (/^CARDS$/i.test(line)) {
      flushPara(); i++;
      const items = [];
      while (i < lines.length && !/^END CARDS$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) { const [t, ...d] = l.split('::'); items.push([t.trim(), d.join('::').trim()]); }
        i++;
      }
      if (i < lines.length && /^END CARDS$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'cards', items });
      continue;
    }
    if (/^GLOSSARY$/i.test(line)) {
      flushPara(); i++;
      const items = [];
      while (i < lines.length && !/^END GLOSSARY$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) { const [t, ...d] = l.split('::'); items.push([t.trim(), d.join('::').trim()]); }
        i++;
      }
      if (i < lines.length && /^END GLOSSARY$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'glossary', items });
      continue;
    }
    if (/^STEPS$/i.test(line)) {
      flushPara(); i++;
      const items = [];
      while (i < lines.length && !/^END STEPS$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) items.push(l);
        i++;
      }
      if (i < lines.length && /^END STEPS$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'steps', items });
      continue;
    }
    if (/^BULLETS$/i.test(line)) {
      flushPara(); i++;
      const items = [];
      while (i < lines.length && !/^END BULLETS$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) items.push(l);
        i++;
      }
      if (i < lines.length && /^END BULLETS$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'bullets', items });
      continue;
    }
    if (/^TOTALS$/i.test(line)) {
      flushPara(); i++;
      const items = [];
      while (i < lines.length && !/^END TOTALS$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) { const [t, ...d] = l.split('::'); items.push([t.trim(), d.join('::').trim()]); }
        i++;
      }
      if (i < lines.length && /^END TOTALS$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'totals', items });
      continue;
    }
    if (/^SIGNATURE$/i.test(line)) {
      flushPara(); i++;
      const items = [];
      while (i < lines.length && !/^END SIGNATURE$/i.test(lines[i].trim())) {
        const l = lines[i].trim();
        if (isBlockStarter(l)) break;
        if (l) { const [t, ...d] = l.split('::'); items.push([t.trim(), d.join('::').trim()]); }
        i++;
      }
      if (i < lines.length && /^END SIGNATURE$/i.test(lines[i].trim())) i++;
      blocks.push({ type: 'signature', items });
      continue;
    }

    para.push(raw.trim());
    i++;
  }
  flushPara();
  return blocks;
}

function parseDoc(text) {
  const meta = parseMeta(text);
  let body = text;
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3);
    if (end !== -1) body = text.slice(end + 3);
  }
  const lines = body.split('\n');
  if (lines.length && lines[0].trim() === '') lines.shift();
  const blocks = parseBody(lines);
  return { meta, blocks };
}

module.exports = { DEFAULT_META, parseMeta, parseDoc, parseBody, isBlockStarter, escapeHtml, inline, colIdx };
