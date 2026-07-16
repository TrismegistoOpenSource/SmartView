import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { registerDocumentHandlers, openFiles } from './ipc/document.handlers'
import { openImageFiles, isImagePath } from './image/engine'
import { buildAppMenu } from './menu'

// Le build macOS si chiamano SmartView-AppleSilicon e SmartView-Intel (bundle
// name e id distinti, altrimenti LaunchServices le confonde). Electron però
// deriva da quel nome anche la cartella dei dati utente: senza questa riga le
// due architetture userebbero due cartelle diverse e i file recenti sparirebbero
// passando da un Mac all'altro. Va prima di ogni app.getPath('userData').
app.setName('SmartView')

const isPdfPath = (p: string): boolean => /\.pdf$/i.test(p)

const devServerUrl = process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
let rendererReady = false
/** true se il renderer segnala tab con modifiche non salvate (guardia alla chiusura). */
let hasUnsavedChanges = false
/** File chiesti dall'OS prima che il renderer fosse pronto a riceverli. */
const pendingFiles: string[] = []

// Il renderer notifica lo stato "dirty" complessivo delle tab.
ipcMain.on('ui:setDirty', (_event, dirty: boolean) => {
  hasUnsavedChanges = Boolean(dirty)
})

/** Estrae i path supportati (PDF o immagini) da una lista di argomenti (argv Windows/Linux). */
function supportedPathsFromArgv(argv: string[]): string[] {
  return argv.filter((arg) => !arg.startsWith('-') && (isPdfPath(arg) || isImagePath(arg)))
}

/** Timer di debounce: raggruppa gli open-file consecutivi in un unico flush. */
let flushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Instrada i file verso il renderer. macOS invia un evento `open-file` PER FILE
 * anche quando se ne aprono più insieme ("Apri con…"): accumuliamo in coda e
 * svuotiamo con un piccolo debounce così le immagini finiscono in UNA galleria.
 */
function requestOpen(filePaths: string[]): void {
  const supported = filePaths.filter((p) => isPdfPath(p) || isImagePath(p))
  if (supported.length === 0) return
  pendingFiles.push(...supported)
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (mainWindow && rendererReady && pendingFiles.length > 0) void flush(pendingFiles.splice(0))
  }, 60)
}

async function flush(filePaths: string[]): Promise<void> {
  const docs = await openFiles(filePaths.filter(isPdfPath))
  for (const doc of docs) mainWindow?.webContents.send('document:opened', doc)
  // Immagini in un unico push → il renderer le apre come una sola tab galleria.
  const images = await openImageFiles(filePaths.filter(isImagePath))
  if (images.length > 0) mainWindow?.webContents.send('image:opened', images)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#f5f6f8',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  mainWindow = win

  win.once('ready-to-show', () => win.show())

  // Il renderer è pronto a ricevere i push solo a caricamento completato:
  // svuota qui la coda dei file arrivati dall'OS prima dell'avvio.
  win.webContents.on('did-finish-load', () => {
    rendererReady = true
    if (pendingFiles.length > 0) void flush(pendingFiles.splice(0))
  })
  // Guardia alla chiusura dell'app: se ci sono modifiche non salvate, conferma.
  let allowClose = false
  win.on('close', (event) => {
    if (!hasUnsavedChanges || allowClose) return
    event.preventDefault()
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        buttons: ['Esci senza salvare', 'Annulla'],
        defaultId: 1,
        cancelId: 1,
        message: 'Ci sono modifiche non salvate',
        detail: 'Chiudendo SmartView perderai le modifiche non salvate nelle tab aperte.'
      })
      .then(({ response }) => {
        if (response === 0) {
          allowClose = true
          win.close()
        }
      })
  })
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
      rendererReady = false
    }
  })

  // Un PDF è input non fidato: la finestra non naviga mai altrove
  // e i link esterni si aprono solo nel browser di sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// macOS consegna i file da "Apri con…" via evento, anche prima di whenReady.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  requestOpen([filePath])
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Windows/Linux: una seconda apertura (es. "Apri con…") arriva come argv qui.
  app.on('second-instance', (_event, argv) => {
    requestOpen(supportedPathsFromArgv(argv))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    buildAppMenu()
    registerDocumentHandlers()
    createWindow()
    // File passati al primo avvio (Windows/Linux "Apri con…").
    requestOpen(supportedPathsFromArgv(process.argv.slice(1)))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
