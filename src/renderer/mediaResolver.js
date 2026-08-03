// Turns DIAGRAM (Mermaid text) and IMAGE (file path) blocks into ready-to-embed
// PNG bytes + pixel dimensions, for both the live preview (SVG) and DOCX export
// (raster PNG, since docx's ImageRun needs a bitmap, not SVG).
const fs = require('fs');
const path = require('path');

let mermaidInstance = null;
async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import('mermaid');
    mermaidInstance = mod.default || mod;
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#EBF0FF',
        primaryBorderColor: '#1A5BFF',
        primaryTextColor: '#0D1117',
        lineColor: '#6B7280',
        secondaryColor: '#EDF0F8',
        tertiaryColor: '#FFFFFF',
        fontFamily: 'Inter, sans-serif',
        background: '#FFFFFF',
      },
    });
  }
  return mermaidInstance;
}

let diagramSeq = 0;
async function renderMermaidSvg(source) {
  const mermaid = await getMermaid();
  const id = 'bfdiagram-' + (diagramSeq++);
  const { svg } = await mermaid.render(id, source);
  return svg;
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

async function rasterizeToPng(url, scale) {
  const img = await loadImageEl(url);
  const w = img.naturalWidth || img.width || 400;
  const h = img.naturalHeight || img.height || 300;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  return { buffer, width: w, height: h };
}

const MAX_W = 560; // px — roughly the printable content width at 96dpi
function fitWidth(w, h) {
  if (w <= MAX_W) return { width: w, height: h };
  const ratio = MAX_W / w;
  return { width: MAX_W, height: Math.round(h * ratio) };
}

async function resolveDiagram(source) {
  const svg = await renderMermaidSvg(source);
  const svgDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
  const png = await rasterizeToPng(svgDataUrl, 2);
  return { svg, ...fitWidth(png.width, png.height), buffer: png.buffer };
}

async function resolveImage(filePath) {
  const ext = (path.extname(filePath) || '').toLowerCase().replace('.', '');
  let dataUrl;
  if (ext === 'svg') {
    const text = fs.readFileSync(filePath, 'utf8');
    dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(text, 'utf8').toString('base64');
  } else {
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';
    dataUrl = 'data:' + mime + ';base64,' + fs.readFileSync(filePath).toString('base64');
  }
  const png = await rasterizeToPng(dataUrl, 1);
  return { ...fitWidth(png.width, png.height), buffer: png.buffer };
}

// Walk parsed blocks once, resolve every unique diagram/image referenced, and
// cache the results so re-renders (typing elsewhere in the doc) don't
// re-render unchanged diagrams or re-read unchanged image files.
async function resolveMedia(blocks, cache) {
  const media = cache || new Map();
  for (const b of blocks) {
    const key = b.type === 'diagram' ? 'd:' + b.source : b.type === 'image' ? 'i:' + b.src : null;
    if (!key || media.has(key)) continue;
    try {
      media.set(key, b.type === 'diagram' ? await resolveDiagram(b.source) : await resolveImage(b.src));
    } catch (e) {
      media.set(key, { error: String((e && e.message) || e) });
    }
  }
  return media;
}

module.exports = { resolveMedia, renderMermaidSvg };
