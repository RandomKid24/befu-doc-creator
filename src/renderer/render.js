const { escapeHtml, inline, colIdx } = require('./parser');

function fileUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p) || /^file:\/\//i.test(p) || /^data:/i.test(p)) return p;
  return 'file://' + encodeURI(p.replace(/\\/g, '/'));
}

function renderCover(meta) {
  const titleLines = (meta.title || '').split('\\n').map((l) => escapeHtml(l)).join('<br>');
  return `<div class="doc-page doc-cover">
    <div class="kicker">${escapeHtml(meta.kicker)}</div>
    <div class="mid">
      <div class="wordmark">${escapeHtml(meta.brand)}</div>
      ${meta.preparedFor ? `<div class="preparedfor">Prepared for ${escapeHtml(meta.preparedFor)}</div>` : ''}
      <div class="title">${titleLines}</div>
      ${meta.description ? `<div class="desc">${escapeHtml(meta.description)}</div>` : ''}
    </div>
    <div class="bottom">
      <div class="mcol"><div class="mlabel">Prepared By</div><div class="mvalue">${escapeHtml(meta.preparedBy)}</div></div>
      <div class="mcol"><div class="mlabel">Prepared For</div><div class="mvalue">${escapeHtml(meta.preparedFor)}</div></div>
      <div class="mcol"><div class="mlabel">Date</div><div class="mvalue">${escapeHtml(meta.date)}</div></div>
      <div class="mcol"><div class="mlabel">Version</div><div class="mvalue">${escapeHtml(meta.version)}</div></div>
    </div>
  </div>`;
}

function runHeader(meta) {
  return `<div class="doc-runheader"><div class="b">${escapeHtml(meta.brand)}</div><div class="d">${escapeHtml(meta.docLabel)}</div></div>`;
}
function footer(meta, pageNum) {
  return `<div class="doc-footer"><span>${escapeHtml(meta.footerLabel)}</span><span>Page ${pageNum}</span></div>`;
}

function renderInfoPage(meta, pageNum) {
  const rows = [
    ['Document Title', (meta.title || '').replace(/\\n/g, ' ')],
    ['Prepared By', meta.preparedBy],
    ['Prepared For', meta.preparedFor],
    ['Date', meta.date],
    ['Version', meta.version],
  ];
  const trs = rows.filter((r) => r[1]).map((r) => `<tr><td class="lbl">${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`).join('');
  const howto = meta.howToRead ? `<div class="callout"><span class="lbl">How to Read This Document</span><p>${inline(meta.howToRead)}</p></div>` : '';
  return `<div class="doc-page"><div class="doc-content">
    ${runHeader(meta)}
    <h1 class="sec">DOCUMENT INFORMATION</h1>
    <table class="infotable">${trs}</table>
    <div style="height:4mm"></div>
    ${howto}
  </div>${footer(meta, pageNum)}</div>`;
}

function renderTocPage(meta, blocks, pageNum) {
  const rows = [];
  blocks.forEach((b) => {
    if (b.type === 'h1') rows.push(`<div class="toc-row"><span class="tn">${escapeHtml(b.num || '')}</span><span class="tt">${escapeHtml(b.title)}</span></div>`);
    if (b.type === 'h2') rows.push(`<div class="toc-row sub"><span class="tn">${escapeHtml(b.num || '')}</span><span class="tt">${escapeHtml(b.title)}</span></div>`);
  });
  return `<div class="doc-page"><div class="doc-content">
    ${runHeader(meta)}
    <h1 class="sec">TABLE OF CONTENTS</h1>
    ${rows.join('')}
  </div>${footer(meta, pageNum)}</div>`;
}

async function renderBlock(b, ctx) {
  switch (b.type) {
    case 'h2':
      return `<h2 class="sub">${b.num ? escapeHtml(b.num) + ' &nbsp; ' : ''}${escapeHtml(b.title)}</h2>`;
    case 'p':
      return `<p>${inline(b.text)}</p>`;
    case 'pill':
      return `<div class="pill">${inline(b.text)}</div>`;
    case 'note':
      return `<div class="callout"><span class="lbl">${escapeHtml(b.title)}</span>${b.body.split('\n\n').map((p) => `<p>${inline(p)}</p>`).join('')}</div>`;
    case 'example':
      return `<div class="example"><span class="lbl">${escapeHtml(b.title)}</span>${b.body.split('\n\n').map((p) => `<p>${inline(p)}</p>`).join('')}</div>`;
    case 'image':
      return `<figure class="doc-figure"><img src="${fileUrl(b.src)}" alt="${escapeHtml(b.caption || '')}">${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''}</figure>`;
    case 'diagram': {
      const entry = ctx && ctx.media ? ctx.media.get('d:' + b.source) : null;
      if (!entry || entry.error) return `<div class="diagram-error">Diagram failed to render${b.title ? ': ' + escapeHtml(b.title) : ''}${entry && entry.error ? ' — ' + escapeHtml(entry.error) : ''}</div>`;
      return `<figure class="doc-figure doc-diagram">${entry.svg}${b.title ? `<figcaption>${inline(b.title)}</figcaption>` : ''}</figure>`;
    }
    case 'reqtable':
      return `<table class="reqtable"><colgroup><col class="c-id"><col class="c-req"><col class="c-src"></colgroup>
        <thead><tr><th>Req ID</th><th>Requirement</th><th>Source</th></tr></thead>
        <tbody>${b.rows.map((r) => `<tr><td class="reqid">${escapeHtml(r[0] || '')}</td><td>${inline(r[1] || '')}</td><td>${escapeHtml(r[2] || '')}</td></tr>`).join('')}</tbody></table>`;
    case 'datatable':
      return `<table class="datatable"><thead><tr>${b.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'pricetable': {
      const numCol = colIdx(b.headers, b.rows);
      return `<table class="pricetable"><thead><tr>${b.headers.map((h, ci) => `<th${numCol[ci] ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr>${r.map((c, ci) => `<td${numCol[ci] ? ' class="num"' : ''}>${inline(c || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    case 'totals':
      return `<div class="totals"><table><tbody>${b.items.map(([label, val], idx) => {
        const isLast = idx === b.items.length - 1;
        return `<tr${isLast ? ' class="grand"' : ''}><td class="tlabel">${escapeHtml(label)}</td><td class="tval">${escapeHtml(val)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    case 'bullets':
      return `<ul class="bullets">${b.items.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>`;
    case 'signature':
      return `<div class="siggrid">${b.items.map(([name, role]) => `<div class="sigbox"><div class="sline"></div><div class="sname">${escapeHtml(name)}</div><div class="srole">${escapeHtml(role)}</div></div>`).join('')}</div>`;
    case 'cards':
      return `<div class="cardgrid">${b.items.map(([t, d]) => `<div class="card"><div class="ct">${escapeHtml(t)}</div><div class="cd">${inline(d)}</div></div>`).join('')}</div>`;
    case 'steps':
      return `<ol class="steps">${b.items.map((s) => `<li>${inline(s)}</li>`).join('')}</ol>`;
    case 'glossary':
      return `<dl class="gloss">${b.items.map(([t, d]) => `<dt>${escapeHtml(t)}</dt><dd>${inline(d)}</dd>`).join('')}</dl>`;
    default:
      return '';
  }
}

async function renderDoc(doc, ctx) {
  const { meta, blocks } = doc;
  let pageNum = 1;
  let html = renderCover(meta); pageNum++;
  html += renderInfoPage(meta, pageNum); pageNum++;
  html += renderTocPage(meta, blocks, pageNum); pageNum++;

  let pageCounter = pageNum;
  let body = '';
  let opened = false;

  for (const b of blocks) {
    if (b.type === 'h1') {
      if (opened) { body += `</div>${footer(meta, pageCounter++)}</div>`; }
      body += `<div class="doc-page"><div class="doc-content">${runHeader(meta)}<h1 class="sec">${b.num ? `<span class="n">${escapeHtml(b.num)}</span>` : ''}${escapeHtml(b.title)}</h1>`;
      opened = true;
    } else if (b.type === 'pagebreak') {
      if (opened) { body += `</div>${footer(meta, pageCounter++)}</div>`; }
      opened = false;
    } else if (b.type === 'blankpage') {
      if (opened) { body += `</div>${footer(meta, pageCounter++)}</div>`; }
      body += `<div class="doc-page"></div>`;
      pageCounter++;
      opened = false;
    } else {
      if (!opened) {
        body += `<div class="doc-page"><div class="doc-content">${runHeader(meta)}`;
        opened = true;
      }
      body += await renderBlock(b, ctx);
    }
  }
  if (opened) { body += `</div>${footer(meta, pageCounter++)}</div>`; }

  return html + body;
}

module.exports = { renderDoc, renderCover, runHeader, footer, renderInfoPage, renderTocPage, fileUrl };
