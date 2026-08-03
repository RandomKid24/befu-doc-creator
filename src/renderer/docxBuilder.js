const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  WidthType, BorderStyle, ShadingType, AlignmentType, Header, Footer,
  PageNumber, VerticalAlign, TabStopType,
} = require('docx');
const { colIdx } = require('./parser');

const DXA_PAGE_WIDTH = 9500; // usable width in twips at ~1in margins on A4/Letter-ish
const NAVY = '0D1117', BLUE = '1A5BFF', STONE = '6B7280', BORDER = 'D1D8E8', TINT = 'EBF0FF', YELLOWBG = 'FFF8E8', YELLOWBORDER = 'E8A93B';

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 2, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
};
const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };

function txt(s, opts = {}) { return new TextRun(Object.assign({ text: (s || '').replace(/\n/g, ' ') }, opts)); }
function para(s, opts = {}) { return new Paragraph({ spacing: { after: 140 }, children: [txt(s, opts)] }); }

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY },
    borders: cellBorders, verticalAlign: VerticalAlign.CENTER, margins: { top: 70, bottom: 70, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 16 })] })],
  });
}
function bodyCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: TINT } : undefined,
    borders: cellBorders, verticalAlign: VerticalAlign.TOP, margins: { top: 70, bottom: 70, left: 100, right: 100 },
    children: [new Paragraph({ alignment: opts.align, children: [new TextRun({ text: (text || ''), size: 16, bold: !!opts.bold, color: opts.color })] })],
  });
}

function h1Para(b) {
  return new Paragraph({
    pageBreakBefore: true, spacing: { before: 80, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BORDER, space: 4 } },
    children: [
      b.num ? new TextRun({ text: b.num + '  ', bold: true, color: BLUE, size: 34 }) : new TextRun({ text: '' }),
      new TextRun({ text: b.title, bold: true, color: NAVY, size: 34 }),
    ],
  });
}
function h2Para(b) {
  return new Paragraph({
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text: (b.num ? b.num + '  ' : '') + b.title, bold: true, color: BLUE, size: 24 })],
  });
}

function calloutBox(title, bodyText, fill, borderColor, labelColor) {
  const paras = bodyText.split('\n').filter((p) => p.trim() !== '').map((p) => new Paragraph({ spacing: { after: 60 }, children: [txt(p, { size: 19, color: '1C2333' })] }));
  return new Table({
    width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [DXA_PAGE_WIDTH],
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill },
        borders: { top: noBorders.top, bottom: noBorders.bottom, right: noBorders.right, left: { style: BorderStyle.SINGLE, size: 24, color: borderColor } },
        margins: { top: 140, bottom: 140, left: 200, right: 200 },
        children: [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title.toUpperCase(), bold: true, color: labelColor, size: 16 })] }), ...paras],
      })],
    })],
  });
}

function reqTable(rows) {
  const w = [1100, 6900, 1500];
  const header = new TableRow({ tableHeader: true, children: [headerCell('REQ ID', w[0]), headerCell('REQUIREMENT', w[1]), headerCell('SOURCE', w[2])] });
  const body = rows.map((r, i) => new TableRow({
    children: [
      bodyCell(r[0] || '', w[0], { shade: i % 2 === 1, bold: true, color: BLUE }),
      bodyCell(r[1] || '', w[1], { shade: i % 2 === 1 }),
      bodyCell(r[2] || '', w[2], { shade: i % 2 === 1, color: STONE }),
    ],
  }));
  return new Table({ width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: w, rows: [header, ...body] });
}
function dataTable(headers, rows) {
  const n = headers.length || 1; const w = headers.map(() => Math.floor(DXA_PAGE_WIDTH / n));
  const header = new TableRow({ tableHeader: true, children: headers.map((h, i) => headerCell(h, w[i])) });
  const body = rows.map((r, ri) => new TableRow({ children: r.map((c, i) => bodyCell(c || '', w[i] || w[0], { shade: ri % 2 === 1 })) }));
  return new Table({ width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: w, rows: [header, ...body] });
}
function priceTable(headers, rows) {
  const n = headers.length || 1; const w = headers.map(() => Math.floor(DXA_PAGE_WIDTH / n));
  const numCols = colIdx(headers, rows);
  const header = new TableRow({ tableHeader: true, children: headers.map((h, i) => headerCell(h, w[i])) });
  const body = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => bodyCell(c || '', w[i] || w[0], { shade: ri % 2 === 1, align: numCols[i] ? AlignmentType.RIGHT : undefined })),
  }));
  return new Table({ width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: w, rows: [header, ...body] });
}
function totalsBlock(items) {
  const w = [2600, 1800];
  const spacerW = DXA_PAGE_WIDTH - w[0] - w[1];
  const rows = items.map(([label, val], idx) => {
    const isLast = idx === items.length - 1;
    const topBorder = isLast ? { top: { style: BorderStyle.SINGLE, size: 10, color: NAVY } } : undefined;
    return new TableRow({
      children: [
        new TableCell({ width: { size: spacerW, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph('')] }),
        new TableCell({
          width: { size: w[0], type: WidthType.DXA }, borders: noBorders,
          margins: { top: 60, bottom: 60, left: 60, right: 100 },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: topBorder, children: [new TextRun({ text: label, color: isLast ? NAVY : STONE, bold: isLast, size: isLast ? 20 : 18 })] })],
        }),
        new TableCell({
          width: { size: w[1], type: WidthType.DXA }, borders: noBorders,
          margins: { top: 60, bottom: 60, left: 100, right: 60 },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: topBorder, children: [new TextRun({ text: val, color: isLast ? NAVY : '1C2333', bold: isLast, size: isLast ? 20 : 18 })] })],
        }),
      ],
    });
  });
  return new Table({ width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [spacerW, w[0], w[1]], rows });
}
function cardsGrid(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = [items[i], items[i + 1]];
    rows.push(new TableRow({
      children: pair.map((it) => {
        if (!it) return new TableCell({ width: { size: DXA_PAGE_WIDTH / 2, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph('')] });
        const [t, d] = it;
        return new TableCell({
          width: { size: DXA_PAGE_WIDTH / 2, type: WidthType.DXA }, borders: cellBorders, margins: { top: 120, bottom: 120, left: 150, right: 150 },
          children: [
            new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: t, bold: true, color: NAVY, size: 19 })] }),
            new Paragraph({ children: [new TextRun({ text: d, color: STONE, size: 17 })] }),
          ],
        });
      }),
    }));
  }
  return new Table({ width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [DXA_PAGE_WIDTH / 2, DXA_PAGE_WIDTH / 2], rows });
}
function glossaryParas(items) {
  const out = [];
  items.forEach(([t, d]) => {
    out.push(new Paragraph({ spacing: { before: 120, after: 20 }, children: [new TextRun({ text: t, bold: true, color: NAVY, size: 19 })] }));
    out.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: d, color: STONE, size: 17 })] }));
  });
  return out;
}
function stepsParas(items) {
  return items.map((s, i) => new Paragraph({
    spacing: { after: 100 }, indent: { left: 260 },
    children: [new TextRun({ text: (i + 1) + '.  ', bold: true, color: NAVY, size: 18 }), txt(s, { size: 18 })],
  }));
}
function bulletsParas(items) {
  return items.map((s) => new Paragraph({
    spacing: { after: 80 }, indent: { left: 260 },
    children: [new TextRun({ text: '•  ', bold: true, color: BLUE, size: 18 }), txt(s, { size: 18 })],
  }));
}
function signatureTable(items) {
  const n = items.length || 1; const w = Math.floor(DXA_PAGE_WIDTH / n);
  const cells = items.map(([name, role]) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: noBorders, margins: { top: 400, bottom: 0, left: 100, right: 200 },
    children: [
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY } }, spacing: { after: 80 }, children: [new TextRun({ text: ' ', size: 2 })] }),
      new Paragraph({ children: [new TextRun({ text: name, bold: true, color: NAVY, size: 18 })] }),
      new Paragraph({ children: [new TextRun({ text: role, color: STONE, size: 16 })] }),
    ],
  }));
  return new Table({ width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: items.map(() => w), rows: [new TableRow({ children: cells })] });
}
function pillPara(text) {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: ' ' + text.toUpperCase() + ' ', bold: true, color: 'FFFFFF', size: 16, shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' } })],
  });
}
function figureParas(entry, captionText) {
  if (!entry || entry.error) {
    return [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: '[image unavailable' + (entry && entry.error ? ': ' + entry.error : '') + ']', italics: true, color: STONE, size: 17 })] })];
  }
  const out = [new Paragraph({
    spacing: { before: 100, after: captionText ? 40 : 160 }, alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type: 'png', data: entry.buffer, transformation: { width: entry.width, height: entry.height } })],
  })];
  if (captionText) {
    out.push(new Paragraph({ spacing: { after: 160 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: captionText, italics: true, color: STONE, size: 16 })] }));
  }
  return out;
}

function buildDocxDoc(docObj, media) {
  const { meta, blocks } = docObj;
  media = media || new Map();

  const titleLines = (meta.title || '').split('\\n');
  const coverChildren = [
    new Paragraph({ spacing: { before: 1200, after: 200 }, children: [new TextRun({ text: (meta.kicker || '').toUpperCase(), bold: true, color: BLUE, size: 18, characterSpacing: 20 })] }),
    new Paragraph({ spacing: { before: 1600, after: 80 }, children: [new TextRun({ text: (meta.brand || 'BEFORTH'), bold: true, color: NAVY, size: 32 })] }),
  ];
  if (meta.preparedFor) coverChildren.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'PREPARED FOR ' + meta.preparedFor.toUpperCase(), bold: true, color: STONE, size: 16 })] }));
  titleLines.forEach((line, i) => coverChildren.push(new Paragraph({ spacing: { after: i === titleLines.length - 1 ? 200 : 0 }, children: [new TextRun({ text: line, bold: true, color: NAVY, size: 48 })] })));
  if (meta.description) coverChildren.push(new Paragraph({ spacing: { before: 100, after: 1200 }, children: [new TextRun({ text: meta.description, color: '1C2333', size: 19 })] }));
  coverChildren.push(new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: BORDER } }, spacing: { before: 600, after: 150 }, children: [new TextRun('')] }));
  const metaW = Math.floor(DXA_PAGE_WIDTH / 4);
  coverChildren.push(new Table({
    width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [metaW, metaW, metaW, metaW],
    rows: [new TableRow({
      children: [
        ['PREPARED BY', meta.preparedBy], ['PREPARED FOR', meta.preparedFor], ['DATE', meta.date], ['VERSION', meta.version],
      ].map(([lab, val]) => new TableCell({
        width: { size: metaW, type: WidthType.DXA }, borders: noBorders, margins: { right: 150 },
        children: [
          new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: lab, bold: true, color: NAVY, size: 14 })] }),
          new Paragraph({ children: [new TextRun({ text: val || '', color: STONE, size: 16 })] }),
        ],
      })),
    })],
  }));

  const header = new Header({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: DXA_PAGE_WIDTH }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } },
      children: [
        new TextRun({ text: (meta.brand || 'BEFORTH'), bold: true, color: NAVY, size: 20 }),
        new TextRun({ text: '\t' + (meta.docLabel || ''), color: STONE, size: 14 }),
      ],
    })],
  });
  const footer = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: DXA_PAGE_WIDTH }],
      children: [
        new TextRun({ text: (meta.footerLabel || ''), color: STONE, size: 14 }),
        new TextRun({ text: '\tPage ', color: STONE, size: 14 }),
        new TextRun({ children: [PageNumber.CURRENT], color: STONE, size: 14 }),
        new TextRun({ text: ' of ', color: STONE, size: 14 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], color: STONE, size: 14 }),
      ],
    })],
  });

  const infoRows = [
    ['Document Title', (meta.title || '').replace(/\\n/g, ' ')], ['Prepared By', meta.preparedBy],
    ['Prepared For', meta.preparedFor], ['Date', meta.date], ['Version', meta.version],
  ].filter((r) => r[1]);
  const infoTable = new Table({
    width: { size: DXA_PAGE_WIDTH, type: WidthType.DXA }, columnWidths: [2600, DXA_PAGE_WIDTH - 2600],
    rows: infoRows.map(([lab, val]) => new TableRow({
      children: [
        new TableCell({ width: { size: 2600, type: WidthType.DXA }, borders: cellBorders, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: lab.toUpperCase(), bold: true, color: NAVY, size: 15 })] })] }),
        new TableCell({ width: { size: DXA_PAGE_WIDTH - 2600, type: WidthType.DXA }, borders: cellBorders, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })] }),
      ],
    })),
  });
  const infoChildren = [
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'DOCUMENT INFORMATION', bold: true, color: NAVY, size: 34 })] }),
    infoTable,
  ];
  if (meta.howToRead) {
    infoChildren.push(new Paragraph({ spacing: { before: 200 } }));
    infoChildren.push(calloutBox('How to Read This Document', meta.howToRead, TINT, BLUE, BLUE));
  }

  const tocChildren = [new Paragraph({ pageBreakBefore: true, spacing: { after: 240 }, children: [new TextRun({ text: 'TABLE OF CONTENTS', bold: true, color: NAVY, size: 34 })] })];
  blocks.forEach((b) => {
    if (b.type === 'h1') {
      tocChildren.push(new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: DXA_PAGE_WIDTH, leader: 'dot' }],
        spacing: { after: 80 },
        children: [new TextRun({ text: (b.num || '') + '   ', bold: true, color: BLUE, size: 18 }), new TextRun({ text: b.title + '\t', color: NAVY, size: 18 })],
      }));
    }
    if (b.type === 'h2') {
      tocChildren.push(new Paragraph({
        indent: { left: 360 }, tabStops: [{ type: TabStopType.RIGHT, position: DXA_PAGE_WIDTH, leader: 'dot' }],
        spacing: { after: 60 },
        children: [new TextRun({ text: (b.num || '') + '   ', bold: true, color: BLUE, size: 16 }), new TextRun({ text: b.title + '\t', color: STONE, size: 16 })],
      }));
    }
  });

  const bodyChildren = [];
  blocks.forEach((b) => {
    switch (b.type) {
      case 'h1': bodyChildren.push(h1Para(b)); break;
      case 'h2': bodyChildren.push(h2Para(b)); break;
      case 'p': bodyChildren.push(para(b.text, { size: 19, color: '1C2333' })); break;
      case 'pill': bodyChildren.push(pillPara(b.text)); break;
      case 'note': bodyChildren.push(calloutBox(b.title, b.body, TINT, BLUE, BLUE)); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'example': bodyChildren.push(calloutBox(b.title, b.body, YELLOWBG, YELLOWBORDER, 'B9791A')); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'image': bodyChildren.push(...figureParas(media.get('i:' + b.src), b.caption)); break;
      case 'diagram': bodyChildren.push(...figureParas(media.get('d:' + b.source), b.title)); break;
      case 'reqtable': bodyChildren.push(reqTable(b.rows)); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'datatable': bodyChildren.push(dataTable(b.headers, b.rows)); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'pricetable': bodyChildren.push(priceTable(b.headers, b.rows)); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'totals': bodyChildren.push(totalsBlock(b.items)); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'cards': bodyChildren.push(cardsGrid(b.items)); bodyChildren.push(new Paragraph({ spacing: { after: 160 } })); break;
      case 'glossary': bodyChildren.push(...glossaryParas(b.items)); break;
      case 'steps': bodyChildren.push(...stepsParas(b.items)); bodyChildren.push(new Paragraph({ spacing: { after: 80 } })); break;
      case 'bullets': bodyChildren.push(...bulletsParas(b.items)); bodyChildren.push(new Paragraph({ spacing: { after: 80 } })); break;
      case 'signature': bodyChildren.push(new Paragraph({ spacing: { before: 200 } })); bodyChildren.push(signatureTable(b.items)); break;
      case 'pagebreak': bodyChildren.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] })); break;
      case 'blankpage':
        bodyChildren.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }));
        bodyChildren.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun('')] }));
        break;
      default: break;
    }
  });

  const sections = [
    { properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } }, children: coverChildren },
    { properties: { page: { margin: { top: 900, bottom: 800, left: 900, right: 900 } } }, headers: { default: header }, footers: { default: footer }, children: infoChildren },
    { properties: { page: { margin: { top: 900, bottom: 800, left: 900, right: 900 } } }, headers: { default: header }, footers: { default: footer }, children: tocChildren },
    { properties: { page: { margin: { top: 900, bottom: 800, left: 900, right: 900 } } }, headers: { default: header }, footers: { default: footer }, children: bodyChildren.length ? bodyChildren : [new Paragraph('')] },
  ];

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 19 } } } },
    sections,
  });
}

module.exports = { buildDocxDoc };
