const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Works around a Chromium renderer crash (SIGTRAP inside the "fontations" font
// backend) seen on some newer macOS builds with this Electron/Chromium version.
app.commandLine.appendSwitch('disable-features', 'FontationsFontBackend');

const DOC_FILTERS = [
  { name: 'Beforth Doc', extensions: ['beforthdoc', 'txt'] },
  { name: 'All Files', extensions: ['*'] },
];
const IMAGE_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
];

let mainWindow;

// Packaged builds get their icon from build/icon.icns|ico|icons (see the
// "build" key in package.json) baked into the app bundle/exe by
// electron-builder. This path is only for `npm start` (unpackaged dev mode),
// where Windows/Linux would otherwise show the generic Electron icon.
const ICON_PATH = path.join(__dirname, '..', '..', 'build', 'icon.png');

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'Beforth Doc Studio',
    backgroundColor: '#0B0E14',
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.BFDS_DEBUG_LOG) {
    mainWindow.webContents.on('console-message', (evt, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('render-process-gone', (evt, details) => {
      console.log('[renderer-gone]', JSON.stringify(details));
    });
  }

  buildMenu();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Document', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => handleOpen() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { type: 'separator' },
        { label: 'Insert Image…', accelerator: 'CmdOrCtrl+I', click: () => handlePickImage() },
        { label: 'Insert Diagram Template', accelerator: 'CmdOrCtrl+D', click: () => send('menu:insert-diagram') },
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('menu:export-pdf') },
        { label: 'Export DOCX…', accelerator: 'CmdOrCtrl+E', click: () => send('menu:export-docx') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function handleOpen() {
  const res = await dialog.showOpenDialog(mainWindow, {
    filters: DOC_FILTERS,
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths.length) return;
  const filePath = res.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    send('doc:loaded', { filePath, content });
  } catch (e) {
    dialog.showErrorBox('Could not open file', String(e.message || e));
  }
}
ipcMain.on('menu:trigger-open', () => handleOpen());

async function handlePickImage() {
  const res = await dialog.showOpenDialog(mainWindow, {
    filters: IMAGE_FILTERS,
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths.length) return;
  send('menu:image-picked', { filePath: res.filePaths[0] });
}

// ---- IPC: save / save-as (content pushed up from renderer) ----
ipcMain.handle('doc:save', async (evt, { filePath, content }) => {
  let target = filePath;
  if (!target) {
    const res = await dialog.showSaveDialog(mainWindow, {
      filters: DOC_FILTERS,
      defaultPath: 'document.beforthdoc',
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    target = res.filePath;
  }
  fs.writeFileSync(target, content, 'utf8');
  return { canceled: false, filePath: target };
});

ipcMain.handle('doc:save-as', async (evt, { content }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    filters: DOC_FILTERS,
    defaultPath: 'document.beforthdoc',
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { canceled: false, filePath: res.filePath };
});

ipcMain.handle('dialog:pick-image', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    filters: IMAGE_FILTERS,
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  return { canceled: false, filePath: res.filePaths[0] };
});

// ---- IPC: export arbitrary text (standalone HTML, etc.) ----
ipcMain.handle('export:text', async (evt, { content, defaultName, extFilters }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    filters: extFilters || [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: defaultName || 'export.html',
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { canceled: false, filePath: res.filePath };
});

// ---- IPC: export DOCX (renderer built the buffer, main handles the save dialog + write) ----
ipcMain.handle('export:docx', async (evt, { bytes, defaultName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
    defaultPath: (defaultName || 'document') + '.docx',
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, Buffer.from(bytes));
  return { canceled: false, filePath: res.filePath };
});

// ---- IPC: export PDF (main renders via Chromium's print pipeline) ----
ipcMain.handle('export:pdf', async (evt, { defaultName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: (defaultName || 'document') + '.pdf',
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  const pdfBuffer = await mainWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'none' },
    preferCSSPageSize: false,
  });
  fs.writeFileSync(res.filePath, pdfBuffer);
  return { canceled: false, filePath: res.filePath };
});

app.whenReady().then(() => {
  // macOS Dock icon isn't picked up from BrowserWindow's `icon` option like
  // Windows/Linux — it needs setting explicitly (packaged builds get the
  // real Dock icon from build/icon.icns instead, this is dev-mode only).
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(ICON_PATH);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
