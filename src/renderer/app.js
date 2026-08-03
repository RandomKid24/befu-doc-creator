const { ipcRenderer } = require('electron');
const path = require('path');
const { Packer } = require('docx');
const { DEFAULT_META, parseDoc, escapeHtml } = require('./parser');
const { renderDoc } = require('./render');
const { buildDocxDoc } = require('./docxBuilder');
const { resolveMedia } = require('./mediaResolver');

const SAMPLE_SRC = `# 1 | Introduction
## 1.1 | Purpose
This document specifies the requirements for the system. It is written for both the client and the development team.

## 1.2 | Scope
The system covers the full lifecycle described in this specification, from intake through to completion and reporting.

# 2 | System Overview
At its core, the workflow moves through four stages.

DIAGRAM: High-level Flow
graph LR
  A[Intake] --> B[Processing]
  B --> C[Review]
  C --> D[Completion]
END DIAGRAM

NOTE: Track of Material Means
Being able to see where a used item ended up -> which machine, which job, or which location it was consumed against.
END NOTE

# 3 | User Roles & Stakeholders
CARDS
Store Department :: Receives material, manages racks/locations, issues items against Job Orders.
Purchase Department :: Handles Purchase Requisitions, vendor quotations, and Purchase Orders.
Accounts Department :: Receives a copy of every PO for the payment procedure.
END CARDS

# 4 | Functional Requirements
PILL: 4.1 Item & Vendor Master
TABLE REQ
ITM-01 | Every item record shall store Name, Quantity, Rate, and Value. | Memo 8
ITM-02 | Item master shall support unit conversion formulas, e.g. 1 drum = 200 kg. | Memo 8
VEN-01 | Vendor Assessment shall record Year of Establishment, Employees, Certifications. | Notes p.3
END TABLE

EXAMPLE: Worked Example
If minimum stock is 10 and the buffer is +30, the reminder fires at 40 units — before stock actually runs out.
END EXAMPLE

# 5 | Reference Data Fields
TABLE DATA
Plan | Spare Parts | Labour
AMC | Not included | Free
CMC | Included, with exclusions | Included
END TABLE

# 6 | Process
STEPS
Work order is created from the contract.
Schedule and pre-requisites are agreed with the customer.
Visit is conducted and logged.
Report and feedback are submitted.
END STEPS

# A | Glossary
GLOSSARY
RM :: Raw Material
BOM :: Bill of Material — the list of items required for a Job/Work Order
PO :: Purchase Order
END GLOSSARY
`;

const HELP_HTML = `
<h3>How this works</h3>
<p>Fill in <strong>Document Info</strong> once (cover page, header/footer labels). Then write your content in the <strong>Content</strong> tab using the simple blocks below. The preview updates as you type. Export with the buttons top-right, or use the File menu / keyboard shortcuts.</p>

<h3>File menu &amp; shortcuts</h3>
<p><code>⌘N</code> New · <code>⌘O</code> Open · <code>⌘S</code> Save · <code>⇧⌘S</code> Save As · <code>⌘I</code> Insert Image · <code>⌘D</code> Insert Diagram · <code>⌘P</code> Export PDF · <code>⌘E</code> Export DOCX</p>

<h3>Adding pages</h3>
<p>Every <code>#</code> heading starts its own new page automatically. Use these when you want extra control:</p>
<pre>PAGEBREAK</pre>
<p>Ends the current page right where you put this line and starts a fresh page for whatever comes next.</p>
<pre>BLANKPAGE</pre>
<p>Inserts a completely empty page — no header, no footer, nothing on it. Whatever content comes after it automatically starts on its own new page.</p>

<h3>Headings (also builds your Table of Contents automatically)</h3>
<pre># 1 | Introduction
## 1.1 | Purpose</pre>
<p><code>#</code> = major section (own page). <code>##</code> = sub-heading. Use <code>A</code> / <code>B</code> for appendix letters instead of numbers.</p>

<h3>Paragraphs</h3>
<p>Just type plain text. Blank line = new paragraph. <code>**bold**</code> works. <code>-&gt;</code> becomes an arrow →.</p>

<h3>Diagrams (flowcharts, written as text)</h3>
<pre>DIAGRAM: High-level Flow
graph LR
  A[Intake] --> B[Processing]
  B --> C[Review]
END DIAGRAM</pre>
<p>Uses <a href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank">Mermaid</a> syntax — flowcharts (<code>graph</code>), sequence diagrams (<code>sequenceDiagram</code>), and more. Renders live in the preview and embeds as a real image in both the PDF and DOCX export. Use <strong>Insert Diagram</strong> (toolbar or <code>⌘D</code>) for a starter template.</p>

<h3>Images (your own design files, screenshots, exported diagrams)</h3>
<pre>IMAGE: /Users/you/Desktop/architecture.png | Optional caption</pre>
<p>Use <strong>Insert Image…</strong> (toolbar or <code>⌘I</code>) to pick a file with the native file picker — it inserts the correct path for you. Works with PNG, JPG, GIF, WEBP, and SVG.</p>

<h3>Module pill (small badge above a table)</h3>
<pre>PILL: 4.1 Item & Vendor Master</pre>

<h3>Requirement table (ID / Requirement / Source)</h3>
<pre>TABLE REQ
PROC-01 | A Purchase Order shall record lead time. | Notes p.2
PROC-02 | Another requirement here. | Memo 6
END TABLE</pre>

<h3>Generic data table (any headers)</h3>
<pre>TABLE DATA
Plan | Spare Parts | Labour
AMC | Not included | Free
CMC | Included | Included
END TABLE</pre>

<h3>Pricing table (for quotations — numeric columns auto right-align)</h3>
<pre>TABLE PRICE
Item | Description | Qty | Rate | Amount
Website Development | Full-stack build | 1 | 150000 | 150000
END TABLE</pre>

<h3>Totals (subtotal / tax / total)</h3>
<pre>TOTALS
Subtotal :: 162000
Tax (18% GST) :: 28260
Total :: 185260
END TOTALS</pre>

<h3>Note callout (blue)</h3>
<pre>NOTE: Title Here
Body text for the note.
END NOTE</pre>

<h3>Example callout (yellow)</h3>
<pre>EXAMPLE: Title Here
Body text for the example.
END EXAMPLE</pre>

<h3>Cards grid (roles, actors, terms)</h3>
<pre>CARDS
Name :: Short description.
END CARDS</pre>

<h3>Numbered steps</h3>
<pre>STEPS
First step text.
Second step text.
END STEPS</pre>

<h3>Bullet list (terms &amp; conditions)</h3>
<pre>BULLETS
Prices are valid for 30 days from the date of this quotation.
END BULLETS</pre>

<h3>Signature blocks</h3>
<pre>SIGNATURE
For Beforth :: Authorized Signatory
For Client :: Authorized Signatory
END SIGNATURE</pre>

<h3>Glossary</h3>
<pre>GLOSSARY
Term :: Definition.
END GLOSSARY</pre>

<h3>Exporting</h3>
<p><strong>Export PDF</strong> renders a real PDF straight to disk (native save dialog) — no print dialog needed. <strong>Export DOCX</strong> generates a real, editable Word file with the same branding — tables, colors, headers/footers, page numbers, and images/diagrams all carry over. <strong>Export HTML</strong> saves a standalone rendered copy you can reopen, print, or email.</p>
`;

const metaFields = ['kicker', 'title', 'description', 'preparedFor', 'preparedBy', 'date', 'version', 'brand', 'docLabel', 'footerLabel', 'howToRead'];

const els = {
  metaForm: document.getElementById('metaForm'),
  editorWrap: document.getElementById('editorWrap'),
  helpPanel: document.getElementById('helpPanel'),
  srcEditor: document.getElementById('srcEditor'),
  previewInner: document.getElementById('previewInner'),
  status: document.getElementById('status'),
  fileLabel: document.getElementById('fileLabel'),
};
els.helpPanel.innerHTML = HELP_HTML;

let currentFilePath = null;
let dirty = false;

function baseName(p) {
  if (!p) return 'Untitled';
  const b = path.basename(p);
  return b.replace(/\.(beforthdoc|txt)$/i, '');
}
function updateFileLabel() {
  els.fileLabel.innerHTML = (dirty ? '<span class="dirty">●</span> ' : '') + escapeHtml(baseName(currentFilePath)) + (currentFilePath ? '' : ' (unsaved)');
  els.fileLabel.title = currentFilePath || 'Not yet saved';
}
function markDirty() { dirty = true; updateFileLabel(); }

function buildFullSource() {
  let fm = '---\n';
  metaFields.forEach((f) => {
    const el = document.getElementById('m_' + f);
    const v = (el.value || '').replace(/\n/g, '\\n');
    fm += `${f}: ${v}\n`;
  });
  fm += '---\n';
  return fm + els.srcEditor.value;
}

function loadIntoForm(meta) {
  metaFields.forEach((f) => {
    const el = document.getElementById('m_' + f);
    if (el) el.value = (meta[f] || '').replace(/\\n/g, '\n');
  });
}

function applyFullSource(full) {
  const doc = parseDoc(full);
  loadIntoForm(doc.meta);
  let body = full;
  if (full.startsWith('---')) {
    const end = full.indexOf('---', 3);
    if (end !== -1) body = full.slice(end + 3).replace(/^\n/, '');
  }
  els.srcEditor.value = body;
  doRender();
}

// ---------------- Toasts & page count ----------------
function showToast(message, isError) {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.innerHTML = '<span class="dot"></span><span></span>';
  el.querySelector('span:last-child').textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

let lastPageCount = null;
let toastCheckTimer = null;
let mediaCache = new Map();
let renderSeq = 0;

async function doRender() {
  const mySeq = ++renderSeq;
  const full = buildFullSource();
  const doc = parseDoc(full);
  mediaCache = await resolveMedia(doc.blocks, mediaCache);
  if (mySeq !== renderSeq) return; // a newer render started while we awaited — drop this stale one
  const html = await renderDoc(doc, { media: mediaCache });
  if (mySeq !== renderSeq) return;
  els.previewInner.innerHTML = html;
  const count = els.previewInner.querySelectorAll('.doc-page').length;
  const pcEl = document.getElementById('pageCount');
  if (pcEl) pcEl.textContent = count + (count === 1 ? ' page' : ' pages');

  clearTimeout(toastCheckTimer);
  toastCheckTimer = setTimeout(() => {
    if (lastPageCount !== null && count !== lastPageCount) {
      const diff = count - lastPageCount;
      showToast(diff > 0 ? `+${diff} page${diff > 1 ? 's' : ''} added (now ${count})` : `${-diff} page${-diff > 1 ? 's' : ''} removed (now ${count})`);
    }
    lastPageCount = count;
  }, 900);
}

let renderTimer = null;
function scheduleRender() {
  markDirty();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(doRender, 180);
}

// ---------------- Tabs ----------------
document.querySelectorAll('.etab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.etab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    els.metaForm.classList.remove('show');
    els.editorWrap.classList.remove('show');
    els.helpPanel.classList.remove('show');
    const which = tab.dataset.tab;
    if (which === 'meta') els.metaForm.classList.add('show');
    if (which === 'src') els.editorWrap.classList.add('show');
    if (which === 'help') els.helpPanel.classList.add('show');
  });
});
function switchToContentTab() {
  document.querySelector('.etab[data-tab="src"]').click();
}

metaFields.forEach((f) => {
  const el = document.getElementById('m_' + f);
  if (el) el.addEventListener('input', scheduleRender);
});
els.srcEditor.addEventListener('input', scheduleRender);

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart != null ? textarea.selectionStart : textarea.value.length;
  const end = textarea.selectionEnd != null ? textarea.selectionEnd : textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
}

// ---------------- File operations ----------------
function resetToBlank() {
  loadIntoForm(DEFAULT_META);
  els.srcEditor.value = '# 1 | Introduction\nStart typing here.';
  currentFilePath = null;
  dirty = false;
  updateFileLabel();
  doRender();
}

async function doSave() {
  const content = buildFullSource();
  const res = await ipcRenderer.invoke('doc:save', { filePath: currentFilePath, content });
  if (res.canceled) return;
  currentFilePath = res.filePath;
  dirty = false;
  updateFileLabel();
  els.status.textContent = 'Saved';
  showToast('Saved "' + baseName(currentFilePath) + '"');
}
async function doSaveAs() {
  const content = buildFullSource();
  const res = await ipcRenderer.invoke('doc:save-as', { content });
  if (res.canceled) return;
  currentFilePath = res.filePath;
  dirty = false;
  updateFileLabel();
  showToast('Saved "' + baseName(currentFilePath) + '"');
}
function doNew() {
  if (dirty && !window.confirm('Discard unsaved changes and start a new document?')) return;
  resetToBlank();
  showToast('New document');
}

document.getElementById('btnNew').addEventListener('click', doNew);
document.getElementById('btnSave').addEventListener('click', doSave);
document.getElementById('btnSaveAs').addEventListener('click', doSaveAs);
document.getElementById('btnOpen').addEventListener('click', () => {
  if (dirty && !window.confirm('Discard unsaved changes and open a different document?')) return;
  ipcRenderer.send('menu:trigger-open');
});

ipcRenderer.on('doc:loaded', (evt, { filePath, content }) => {
  applyFullSource(content);
  currentFilePath = filePath;
  dirty = false;
  updateFileLabel();
  showToast('Opened "' + baseName(filePath) + '"');
});
ipcRenderer.on('menu:new', () => doNew());
ipcRenderer.on('menu:save', () => doSave());
ipcRenderer.on('menu:save-as', () => doSaveAs());

// ---------------- Insert Image / Diagram ----------------
async function pickAndInsertImage() {
  const res = await ipcRenderer.invoke('dialog:pick-image');
  if (res.canceled) return;
  switchToContentTab();
  insertAtCursor(els.srcEditor, `IMAGE: ${res.filePath} | \n`);
  scheduleRender();
}
function insertDiagramTemplate() {
  switchToContentTab();
  insertAtCursor(els.srcEditor, `\nDIAGRAM: Process Flow\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do the thing]\n  B -->|No| D[Skip]\nEND DIAGRAM\n\n`);
  scheduleRender();
}
document.getElementById('btnInsertImage').addEventListener('click', pickAndInsertImage);
document.getElementById('btnInsertDiagram').addEventListener('click', insertDiagramTemplate);
ipcRenderer.on('menu:image-picked', (evt, { filePath }) => {
  switchToContentTab();
  insertAtCursor(els.srcEditor, `IMAGE: ${filePath} | \n`);
  scheduleRender();
});
ipcRenderer.on('menu:insert-diagram', () => insertDiagramTemplate());

// ---------------- Exporting ----------------
async function doExportPdf() {
  const btn = document.getElementById('btnExportPdf');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Rendering…';
  try {
    const res = await ipcRenderer.invoke('export:pdf', { defaultName: baseName(currentFilePath) });
    if (!res.canceled) showToast('PDF exported to ' + baseName(res.filePath) + '.pdf');
  } catch (e) {
    console.error(e); showToast('PDF export failed — see console', true);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}
async function doExportDocx() {
  const btn = document.getElementById('btnExportDocx');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Building…';
  try {
    const full = buildFullSource();
    const parsed = parseDoc(full);
    mediaCache = await resolveMedia(parsed.blocks, mediaCache);
    const docxDocument = buildDocxDoc(parsed, mediaCache);
    const buffer = await Packer.toBuffer(docxDocument);
    const res = await ipcRenderer.invoke('export:docx', { bytes: buffer, defaultName: baseName(currentFilePath) });
    if (!res.canceled) showToast('DOCX exported to ' + baseName(res.filePath) + '.docx');
  } catch (e) {
    console.error(e); showToast('DOCX export failed — see console', true);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}
async function doExportHtml() {
  try {
    const full = buildFullSource();
    const doc = parseDoc(full);
    mediaCache = await resolveMedia(doc.blocks, mediaCache);
    const content = await renderDoc(doc, { media: mediaCache });
    const css = document.querySelector('link[rel="stylesheet"]');
    const cssText = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
    const standalone = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml((doc.meta.title || 'Document').replace(/\\n/g, ' '))}</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${cssText}
body{background:#e8e8e8;} .doc-page{margin:20px auto;box-shadow:0 4px 20px rgba(0,0,0,.15);}
@media print{ body{background:none;} .doc-page{margin:0;box-shadow:none;break-after:page;} .doc-page:last-child{break-after:auto;} @page{size:A4;margin:0;} }
</style></head><body>${content}</body></html>`;
    const res = await ipcRenderer.invoke('export:text', {
      content: standalone,
      defaultName: baseName(currentFilePath) + '.html',
      extFilters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (!res.canceled) showToast('HTML exported to ' + baseName(res.filePath) + '.html');
  } catch (e) {
    console.error(e); showToast('HTML export failed — see console', true);
  }
}
document.getElementById('btnExportPdf').addEventListener('click', doExportPdf);
document.getElementById('btnExportDocx').addEventListener('click', doExportDocx);
document.getElementById('btnDownloadHtml').addEventListener('click', doExportHtml);
ipcRenderer.on('menu:export-pdf', doExportPdf);
ipcRenderer.on('menu:export-docx', doExportDocx);

// ---------------- Boot ----------------
loadIntoForm(DEFAULT_META);
document.getElementById('m_kicker').value = DEFAULT_META.kicker;
document.getElementById('m_title').value = 'Sample\nRequirements Document';
document.getElementById('m_description').value = 'A short example showing every block type this tool supports — headings, tables, callouts, cards, steps, diagrams, and a glossary.';
document.getElementById('m_preparedFor').value = 'Your Client';
document.getElementById('m_preparedBy').value = 'Beforth';
document.getElementById('m_date').value = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
document.getElementById('m_brand').value = 'BEFORTH';
document.getElementById('m_version').value = '1.0 Draft';
document.getElementById('m_docLabel').value = 'Sample · Requirements Document';
document.getElementById('m_footerLabel').value = 'Beforth — Sample Document';
document.getElementById('m_howToRead').value = 'This is a demo. Open the Syntax Guide tab to see every block type used below, then replace this content with your own.';
els.srcEditor.value = SAMPLE_SRC;
updateFileLabel();
doRender();
