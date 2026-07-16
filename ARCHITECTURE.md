# SmartPDF — Architettura Tecnica

> Documento di architettura redatto in fase di kick-off (2026-07-04).
> Obiettivo: applicazione desktop Electron per la gestione quotidiana di PDF —
> veloce, minimalista (ispirata ad Anteprima di macOS), con editing "PDF-native"
> che non rasterizza mai il testo originale.

---

## 1. Decisioni architetturali fondanti

### Il principio cardine: "due motori PDF, un solo documento"

Non esiste una singola libreria open-source che faccia bene sia il **rendering** sia la **manipolazione** di PDF. La scelta corretta — e quella che fa la differenza tra un progetto che funziona e uno che rasterizza tutto in immagini — è usarne due, con responsabilità nette:

| Motore | Libreria | Responsabilità | Dove gira |
|---|---|---|---|
| Rendering | **pdf.js** (Mozilla) | Disegnare le pagine su canvas + **text layer selezionabile** + annotation layer per gli AcroForms | Renderer (in Web Worker) |
| Manipolazione | **pdf-lib** | Riordino/rotazione/merge/split pagine, scrittura testo, creazione e compilazione AcroForms, embed firme PNG/SVG | Main process |

Questo è esattamente ciò che garantisce l'editing "PDF-native": **pdf.js** genera un layer di testo HTML trasparente sopra il canvas (il testo originale resta selezionabile e ricercabile, mai rasterizzato), mentre **pdf-lib** modifica la struttura interna del PDF (oggetti COS, content stream) senza mai toccare i glifi esistenti. Quando si aggiunge un testo, pdf-lib *appende* un nuovo operatore di disegno al content stream della pagina — il testo preesistente rimane intatto e selezionabile.

**In ottica TypeScript**: pdf-lib è *scritta in TypeScript* nativamente (non tipizzata a posteriori), con un'API ad alto livello (`PDFDocument`, `PDFPage`, `PDFForm`, `PDFTextField`, `PDFCheckBox`…) che rende impossibili a compile-time interi cluster di errori. pdf.js espone typings ufficiali (`pdfjs-dist` include i `.d.ts`).

### Il documento vive nel Main process

La decisione più importante per performance e stabilità:

- Il **Main process** detiene il `Uint8Array` del PDF e lo stato canonico del documento. È l'unica *source of truth*.
- Il **Renderer** riceve solo ciò che serve a disegnare: i byte (trasferiti una volta via `ArrayBuffer`) e un **modello di documento serializzabile**.
- Le operazioni di edit non modificano subito i byte: il Renderer accumula un **log di operazioni** (command pattern: `RotatePage`, `MovePage`, `AddText`, `PlaceSignature`…) che viene applicato da pdf-lib nel Main solo al salvataggio.

**Vantaggi diretti sugli obiettivi:**
1. **Anti-crash alla Acrobat**: se il Renderer crasha (canvas, GPU, memoria), il documento e le modifiche pendenti sono al sicuro nel Main. Si riapre la finestra e si riprende.
2. **Undo/redo gratis**: il log di comandi è la cronologia. Ogni comando è un membro di una *discriminated union* — il compilatore obbliga a gestirli tutti.
3. **Performance**: niente riscritture del PDF a ogni interazione. Il drag&drop delle miniature riordina solo un array di indici; pdf-lib riscrive il file una volta sola.

---

## 2. Tech Stack completo e giustificazioni

| Layer | Scelta | Perché (in ottica TS/performance) |
|---|---|---|
| Runtime | **Electron** (ultima LTS) | Requisito. Chromium recente = canvas/OffscreenCanvas performanti |
| Build | **electron-vite** | HMR istantaneo in dev, bundle separati e ottimizzati per main/preload/renderer, TS out-of-the-box. Avvio dev < 1s |
| Frontend | **React 18+ + TypeScript** | Ecosistema maturo per i pezzi critici (dnd, virtualizzazione) |
| Stato UI | **Zustand** | ~1 KB, selettori tipizzati, funziona *fuori* dai componenti React — essenziale per aggiornare lo stato da eventi IPC senza re-render a cascata |
| Drag & drop | **dnd-kit** | TypeScript-first, accessibile, performante su liste virtualizzate |
| Virtualizzazione | **@tanstack/react-virtual** | La sidebar miniature con un PDF da 800 pagine deve montare ~15 DOM node, non 800 (milestone 2) |
| Styling | **CSS Modules + design tokens (CSS custom properties)** | Zero runtime. I token replicano palette/spaziatura di Aurora Studio in un unico file |
| Icone | **Lucide** (stile) | Tratti sottili e coerenti, estetica minimale in linea con Anteprima/Aurora Studio |
| Rendering PDF | **pdfjs-dist** in Web Worker | Vedi §1 |
| Manipolazione PDF | **pdf-lib** (+ **@pdf-lib/fontkit** per font custom con subsetting) | Vedi §1 |
| Packaging | **electron-builder** | Target nativi Win (NSIS), macOS (dmg, universal), Linux (AppImage/deb) da un'unica config |
| Test | **Vitest** (unit, motore PDF) + **Playwright** (E2E Electron) | Il motore di edit, essendo puro TS senza DOM, è testabile al 100% senza Electron |

**Perché non Vue?** Andrebbe bene, ma dnd-kit e TanStack Virtual — i due pezzi da cui dipende la qualità dell'interazione con le miniature — hanno le implementazioni di riferimento in React. La UI qui è il prodotto.

**Nota su MuPDF/PDFium (wasm)**: se in futuro pdf.js diventasse il collo di bottiglia su documenti enormi, `mupdf-js` (wasm) è il piano B per il rendering. L'architettura a due motori con interfaccia `PdfRenderEngine` astratta rende lo swap indolore.

---

## 3. Struttura delle cartelle

```
smartpdf/
├── electron.vite.config.ts
├── electron-builder.yml            # target win/mac/linux
├── tsconfig.json                   # base condivisa (strict: true)
├── tsconfig.node.json              # main + preload
├── tsconfig.web.json               # renderer
│
├── src/
│   ├── shared/                     # ⭐ codice importato da ENTRAMBI i processi
│   │   ├── ipc/
│   │   │   ├── contracts.ts        # tipi request/response di OGNI canale IPC
│   │   │   └── api.ts              # interfaccia esposta dal preload al renderer
│   │   └── domain/
│   │       └── commands.ts         # discriminated union delle operazioni di edit
│   │                               #   + reducer puro condiviso (UI e motore)
│   │
│   ├── main/                       # processo Main — Node, filesystem, pdf-lib
│   │   ├── index.ts                # bootstrap, lifecycle, single-instance lock
│   │   ├── ipc/                    # handler registrati sui contratti tipizzati
│   │   └── pdf/                    # ⭐ il "motore" — puro TS, zero dipendenze Electron
│   │       └── engine.ts           # applyCommands(bytes, cmds) → bytes
│   │
│   ├── preload/
│   │   └── index.ts                # contextBridge: espone SOLO l'API tipizzata
│   │
│   └── renderer/                   # UI — nessun accesso a Node, mai
│       ├── index.html
│       └── src/
│           ├── app/                # shell applicativa
│           ├── components/         # Toolbar, Sidebar, Viewer, PageView…
│           ├── pdf-render/         # wrapper pdf.js (worker, cache, engine)
│           ├── stores/             # Zustand: documento, comandi, UI
│           ├── lib/                # azioni applicative (open, save)
│           └── styles/             # tokens.css (design system "Aurora")
│
└── resources/                      # icone app, entitlements macOS
```

Due punti strutturali che valgono più di tutto il resto:

1. **`src/shared/` è il cuore del sistema.** Contiene i tipi di dominio e i contratti IPC importati da entrambi i lati. Se cambia la firma di un'operazione, *entrambi* i processi smettono di compilare finché non vengono allineati.
2. **`src/main/pdf/` è puro TypeScript senza dipendenze da Electron.** Il motore prende byte + comandi e restituisce byte: testabile con Vitest in millisecondi, riusabile, isolato.

---

## 4. Separazione Main/Renderer e strategia IPC

### Ruoli

- **Main**: filesystem (open/save, recenti), pdf-lib (tutte le mutazioni), dialoghi nativi, menu, autosave/recovery, lifecycle. *Nessuna* logica di presentazione.
- **Preload**: unico ponte. Espone via `contextBridge` un oggetto `window.smartpdf` con metodi tipizzati — non espone mai `ipcRenderer` grezzo.
- **Renderer**: pdf.js (rendering read-only vicino al canvas), tutta la UI. *Nessun* accesso a Node — con `sandbox: true` non potrebbe comunque.

### Il contratto IPC tipizzato (il pattern chiave)

`shared/ipc/contracts.ts` definisce una mappa che associa a ogni canale i tipi di richiesta e risposta. Due wrapper generici — uno nel Main sopra `ipcMain.handle`, uno nel preload sopra `ipcRenderer.invoke` — sono vincolati a quella mappa. Risultato: **impossibile invocare un canale inesistente, passare un payload sbagliato o interpretare male una risposta**. Il 90% dei bug tipici delle app Electron (typo nei nomi canale, payload drift) diventa errore di compilazione.

I byte del PDF viaggiano **una sola volta** all'apertura come `ArrayBuffer`; il resto del traffico IPC è composto da piccoli oggetti di dominio serializzabili. Mai bitmap via IPC: le miniature le genera pdf.js nel Renderer.

### Configurazione di sicurezza (non negoziabile)

```
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
```

più: CSP restrittiva, `will-navigate` e `setWindowOpenHandler` bloccati (un PDF può contenere link/JS malevoli), validazione dei path lato Main (il Renderer non sceglie mai path arbitrari: chiede, il Main apre il dialogo nativo e decide). Un PDF è **input non fidato**: il parsing con pdf.js in un renderer sandboxato è esattamente il modello di sicurezza giusto.

---

## 5. Come le core feature si mappano sull'architettura

**Gestione pagine (drag&drop, rotazione, merge/split).** La sidebar è una lista di miniature (bitmap renderizzate dal worker pdf.js a bassa risoluzione). Il drop genera un comando `MovePage { from, to }` — operazione su array in memoria, istantanea. pdf-lib la materializza solo al salvataggio. La rotazione è un attributo `/Rotate` del page object: zero rasterizzazione, testo intatto.

**Editing PDF-native.** Click sul canvas → overlay HTML di input in coordinate pagina (conversione viewport→PDF coordinate space, origine in basso a sinistra — *branded types* `PdfPoint` vs `ScreenPoint` prevengono bug reali). Alla conferma, comando `AddText`. pdf-lib embedda il font (subsetting via fontkit) e appende l'operatore di testo al content stream.

**AcroForms + calcoli.** pdf.js legge le annotazioni Widget; la UI le renderizza come input HTML sovrapposti. I valori diventano comandi `SetFieldValue` gestiti da pdf-lib *senza flatten*. Per i **calcoli**: mai eseguire il JavaScript embedded nei PDF (superficie d'attacco enorme, motivo storico di metà delle CVE di Acrobat). Motore di calcolo dichiarativo proprio (`{ target, op, sources }`): copre il 95% dei casi reali, deterministico e testabile. Supporto opzionale alle formule AFM standard (`AFSimple_Calculate`) parsandole — mai eseguendole.

**Firme come layer.** La firma PNG/SVG viene embeddata da pdf-lib come **immagine in un'annotazione Stamp**, non fusa nel content stream. Resta un oggetto discreto — riposizionabile, ridimensionabile, eliminabile anche dopo il salvataggio. Nessun flatten. SVG: raster @3x per la v1, conversione vettoriale come evoluzione.

**Performance di avvio.** Bundle minimi, finestra su `ready-to-show`, pdf.js lazy al primo documento. Target: finestra visibile < 1s, prima pagina prioritaria, resto in background.

---

## 6. Perché TypeScript rende SmartPDF meno "Acrobat-crashy"

1. **Il formato PDF è un campo minato di casi opzionali.** Con `strict: true` + `noUncheckedIndexedAccess`, ogni accesso potenzialmente nullo è un errore di compilazione: si è *costretti* a gestire il PDF malformato prima di eseguire.
2. **Discriminated unions per il command-log**: `type EditCommand = MovePage | RotatePage | …` con exhaustiveness check (`never`): aggiungendo un comando, il compilatore elenca ogni punto del codice da aggiornare.
3. **Errori come valori tipizzati**: le operazioni restituiscono `Result<T, PdfError>` invece di eccezioni che attraversano l'IPC. L'app degrada, non crasha.
4. **Il contratto IPC condiviso**: il confine processo-processo — dove le app Electron marciscono silenziosamente — è verificato a ogni build.
5. **Branded types per i sistemi di coordinate** e identificatori (`PageId` vs indice numerico).

---

## Roadmap

1. ✅ **Scaffold**: electron-vite + struttura + sicurezza + contratto IPC tipizzato.
2. ✅ **Milestone 1 — Viewer**: rendering con text layer, zoom, sidebar miniature a scomparsa.
3. 🟡 **Milestone 2 — Pagine**: ✅ drag&drop, rotazione, eliminazione, salvataggio via command-log, **undo/redo**, **merge** (fusione multi-sorgente), **estrazione/split**, scorciatoie da tastiera. ⏳ Rimane: virtualizzazione della sidebar (rinviata — vedi nota sotto).
4. 🟡 **Milestone 3 — Editing e Forms**: ✅ **inserimento testo PDF-native** (strumento testo, crea/modifica/sposta/elimina, disegno con pdf-lib come vero testo selezionabile — verificato estraendolo con pdf.js). ⏳ Rimane: AcroForms compilabili + motore di calcolo dichiarativo.
5. ✅ **Milestone 4 — Documenti multipli (tab) + apertura dal sistema**: barra delle tab (una tab per PDF, ognuna col proprio command-log/undo/zoom); **drag&drop di più PDF** sulla finestra → una tab per file; apertura da **"Apri con…" del sistema operativo** (file association PDF + gestione `open-file` su macOS e `argv`/`second-instance` su Windows/Linux, istanza singola). Base per sostituire il viewer di sistema. Estetica "Aurora" confermata, icona già fatta.
6. ✅ **Milestone 5 — SmartView (immagini universali) — COMPLETA**: rinomina app in **SmartView**; **workspace polimorfico** (`Tab` union `kind: 'pdf'|'image'|'markdown'`, dispatcher `Toolbar`/`Sidebar`/`Viewer`); **zoom del documento** separato dalla chrome (`Cmd/Ctrl +/-/0` + pinch trackpad via `wheel`+`ctrlKey` centrato sul cursore; menu app senza acceleratori di zoom, `webFrame.setVisualZoomLevelLimits(1,1)`); **viewer immagini di ogni formato** con `sharp` (`image/engine.ts`: metadata + anteprima WebP shrink-on-load ≤4096px, EXIF-aware, **BigTIFF veloce**; apertura unificata pdf+immagini `files:open`/`files:openPaths`; una tab per immagine; `ImageViewer`/`ImageToolbar` contestuali; `asarUnpack` sharp); **home = file recenti** (JSON in userData, "svuota", tasti *Apri* / *Crea file testo*); **popup di salvataggio immagine** con formato + compressione (JPEG/PNG/WebP/AVIF/TIFF-compression/GIF; HEIF-hevc e JXL non nella build di libvips → non offerti); **export batch** di immagini selezionate → cartella (concorrenza = n° CPU, barra di avanzamento); **sidebar immagini = griglia virtualizzata** (`@tanstack/react-virtual`) con multi-selezione (click/Shift/Cmd); **sottosistema Salva / Salva con nome** (`document:save` con guardia mtime, `document:saveAs` che adotta il path). *Nota:* la tab Markdown creata da "Crea file testo" mostra un placeholder finché l'editor (M7) non è pronto.
7. ✅ **Milestone 6 — Firme, PDF/A e packaging — COMPLETA (v1)**: **firme immagine come layer** (comandi `add/move/resize/remove-signature` nel command-log, PNG/SVG scelti via `signature:pick` e rasterizzati con sharp, disegnati da pdf-lib `drawImage`, riposizionabili/ridimensionabili/eliminabili dall'overlay `SignatureAnnotations`); **export PDF/A-2b** (`document:exportPdfA`): XMP `pdfaid` + OutputIntent con ICC sRGB incorporato + font **LiberationSans** incorporato via `@pdf-lib/fontkit` (subset), salvato senza object streams; **packaging** corretto: dmg mac **per-arch** (x64+arm64) per i binari sharp, `extraResources` per font/ICC, associazioni file estese alle immagini + apertura da OS di PDF **e** immagini (`image:opened`). *Conformità PDF/A-2b VALIDATA con veraPDF* (ISO 19005-2, profilo 2b): l'output è certificato conforme su tutti i percorsi d'export (testo, riordino, firma PNG, campo testo AcroForm, checkbox) — vedi la nota "PDF/A-2b VALIDATO con veraPDF (v0.4)" e `pdfa.verify.test.ts`. Residuo: le non-conformità *ereditate* da un PDF sorgente già non conforme non vengono ripulite (l'inserimento non le introduce, ma non le sana); la firma è disegnata nel content stream (Stamp-annotation discreta = raffinamento futuro); notarizzazione/signing richiedono certificati (non in questa iterazione). Il rollout come *viewer predefinito* è l'ultimo passo, dopo la M7.
8. ✅ **Milestone 7 — Editor Markdown integrato — COMPLETA**: editor **CodeMirror 6** (`@codemirror/lang-markdown`) per-tab, modalità **Editor / Split / Anteprima**; render **markdown-it** (+ `markdown-it-task-lists` + plugin **callout** `> [!tipo]` fatto a mano) sanitizzato con **DOMPurify**; **toolbar di formattazione** (grassetto ⌘B, corsivo ⌘I, heading, quote, callout, liste/task, codice, link) con gli stessi comandi delle scorciatoie; apertura `.md/.markdown/.txt` (dialogo, drag&drop, home recenti), **Salva/Salva con nome** (`markdown:save`/`saveAs`) con dirty, **export in PDF** via `webContents.printToPDF` offscreen (nessuna libreria extra). Niente wikilink né hashtag.

> ✅ **AcroForms (M3 slice 2) — compilazione FATTA (v1)**: overlay `FormAnnotations` (widget da pdf.js `getAnnotations`) per campi **testo / checkbox / dropdown**, comando `set-field-value` nel command-log, riempimento con l'API form di **pdf-lib** *senza flatten* (i campi restano editabili; verificato con test). Preservato via il fast-path in-place (nessuna modifica strutturale). **Restano**: radio-group, **motore di calcolo dichiarativo** (`{target,op,sources}`, mai eseguire JS del PDF) e preservazione AcroForm anche con **riordino** pagine (serve mutazione in-place del page tree invece di `copyPages`).

## Piano tecnico delle milestone future (M5–M7)

### Principi trasversali (valgono per tutte)
- **Reattività prima di tutto:** il lavoro pesante (decode/encode immagini, render markdown di file grossi) sta **sempre fuori dal thread del renderer** — nel processo main/Node (I/O, sharp) o in un Web Worker. Il renderer resta fluido anche coi file pesanti.
- **Zero dipendenze per l'utente finale:** l'app è **self-contained**. I binari nativi (sharp/libvips) vengono impacchettati (`asarUnpack`); l'utente non installa nulla. "Senza dipendenze" = nessun runtime esterno richiesto, non "nessuna libreria npm".
- **Il più leggera possibile:** librerie **modulari e tree-shakeable** (CodeMirror 6, markdown-it), preferenza per le **capacità native di Electron** (es. `printToPDF`) rispetto a librerie aggiuntive, **lazy-load** dei motori pesanti (sharp/geotiff caricati solo quando serve davvero un'immagine).
- **Multi-OS:** un solo comportamento su mac/win/linux; dove un binario è per-arch, si producono target per-arch (come già fa **Aurora Studio**: dmg x64 + arm64, `asarUnpack` di sharp).

### Fondamenta da introdurre in M5 (abilitano M5 e M7)

**1. Workspace polimorfico (tab tipizzate).** Oggi `TabState` è specifico del PDF. Va generalizzato in una **discriminated union** per `kind`:
```ts
type Tab =
  | { kind: 'pdf';      /* stato attuale: base, command-log, ... */ }
  | { kind: 'image';    /* filePath, metadata, zoom, pan, ... */ }
  | { kind: 'markdown'; /* filePath, source, dirty, viewMode, ... */ }
```
La barra tab resta comune; **Toolbar, Sidebar e Viewer diventano polimorfici** e mostrano gli strumenti del `kind` attivo — *"i workspace si adattano ai tipi di file che aprono"* (es. immagini → niente "unisci PDF", sì "salva come…/converti in PDF"; markdown → toolbar di formattazione). I componenti PDF esistenti si spostano dietro `kind === 'pdf'` senza cambiare la loro logica interna.

> ✅ **Fatto (fondamenta, non funzionalità):** `documentStore.ts` ha ora `PdfTab | ImageTab | MarkdownTab` (`ImageTab`/`MarkdownTab` minimali: solo `kind/docId/fileName/filePath`, niente zoom/pan/metadata/viewMode speculativi — verranno aggiunti quando la relativa funzionalità arriverà davvero). I campi top-level restano PDF-shaped (`ActiveFields = Omit<PdfTab,'kind'> & { kind: Tab['kind'] }`): l'unica tab con stato reale oggi è quella PDF, quindi niente narrowing sparso nei componenti esistenti. `Toolbar`/`Sidebar`/`Viewer` sono diventati dispatcher sottili che montano `Pdf*` (rinominati da Toolbar/Sidebar/Viewer originali, logica interna intatta) quando `kind==='pdf'`, o un `PlaceholderPane`/`PlaceholderToolbar` altrimenti. Nessuna azione crea ancora tab `image`/`markdown` (serve supporto IPC per aprire file non-PDF, non fatto in questo passo) — i rami placeholder sono verificati solo dall'esaustività di TypeScript, non a runtime.

**2. Sottosistema Salva / Salva con nome / anti-sovrascrittura.** Ogni tab salvabile tiene `filePath` + `mtime`/hash di quando è stata caricata o salvata.
- **Salva** (`Cmd/Ctrl+S`): sovrascrive `filePath`. Prima di scrivere, il main **ricontrolla `mtime`/hash su disco**: se il file è cambiato dall'esterno → **avviso** ("il file è stato modificato fuori dall'app, sovrascrivere?"). Se la tab non ha ancora `filePath` → si comporta come *Salva con nome*.
- **Salva con nome** (`Cmd/Ctrl+Shift+S`): dialogo; l'overwrite di un file esistente è già confermato dal dialogo nativo dell'OS.
- Nuovo canale IPC `document:save` (scrive su path noto con guardia `mtime`) accanto all'esistente `document:saveAs`. Vale per PDF, markdown e singola immagine.

**3. Home / file recenti.** La `EmptyState` diventa una home: **griglia dei file recenti** (persistiti in un piccolo JSON in `app.getPath('userData')`, nessun DB), con **Svuota**, e in alto i tasti **Crea file testo** (nuova tab markdown vuota) e **Apri**. Ogni recente ricorda il `kind` per l'icona.

### Milestone 5 — SmartView: stack e scelte

**Rinomina** → `productName`/`appId`/titoli/`empty-title` a **SmartView** (la M5 è il punto giusto: da qui apre più di un tipo di file).

**Motore immagini: `sharp` (libvips nativo), nel processo main.** Stessa scelta di **Aurora Studio** (già in produzione lì) → coerenza, **riuso del suo codice di export** e del pattern di packaging già risolto (`asarUnpack: node_modules/sharp/**` + `@img/**`, dmg per-arch). Sharp dà:
- **Apertura e thumbnail veloci** anche su file enormi grazie allo **shrink-on-load** (decodifica solo alla risoluzione che serve): è la chiave del *"BigTIFF caricati veloci"*.
- **Decodifica di ogni formato**: JPEG, PNG, WebP, AVIF, GIF, TIFF/BigTIFF, SVG; HEIC/HEIF e JPEG-XL se libvips è compilato con `libheif`/`libjxl` (verificare la build; fallback `libheif-js` WASM per HEIC).
- **Encoding con compressione parametrica** per il popup di salvataggio.
Il main espone `image:open` (→ metadata + anteprima raster già ridimensionata al viewport), `image:thumbnail`, `image:export`. Il renderer mostra un canvas/`<img>` dalla preview: **niente byte enormi** verso il renderer.

**BigTIFF gigapixel (pan/zoom fluido):** oltre allo shrink-on-load, per il pan/zoom su immagini enormi valutare **`geotiff.js`** (lettura per **tile** e per **overview/piramide**, BigTIFF nativo, streaming): si decodificano solo i tile visibili al livello di zoom corrente. Da adottare solo se la preview-sharp non basta per il gigapixel.

**Zoom documento + pinch (fix del bug attuale — le scorciatoie oggi zoomano la chrome):**
- Disabilitare lo zoom della *chrome* Chromium: `webFrame.setVisualZoomLevelLimits(1, 1)` e **non** registrare gli acceleratori di menu `zoomIn/zoomOut/resetZoom`.
- `Cmd/Ctrl +/-/0` intercettati a mano → agiscono sullo **zoom del documento** (già nello store).
- **Pinch da trackpad:** il gesto genera eventi `wheel` con `event.ctrlKey === true` → si intercetta `wheel` (`passive:false`, `preventDefault`) e si mappa il delta sullo zoom del documento, **centrato sul cursore**. Vale per immagini e PDF.

**Popup di salvataggio immagine (riuso da Aurora Studio + formati aggiunti).** Aurora Studio ha già: selettore **formato** (JPG/PNG/WebP/BMP/GIF/TIFF/Originale), **modalità** Lossless/Lossy (WebP e PNG), **slider qualità %**, **resize** (fit inside), export PDF con optimize+quality. SmartView riusa questo modello e **aggiunge i formati mancanti**:
- **AVIF** — `sharp.avif({ quality, lossless, effort })`
- **HEIF/HEIC** — `sharp.heif({ quality, compression })` (se disponibile nella build; altrimenti annota il limite)
- **TIFF con compressione scelta** — `sharp.tiff({ compression: 'lzw'|'deflate'|'jpeg'|'zstd'|'none', quality, predictor })`
- **JPEG XL** — `sharp.jxl({ quality, lossless })` (se libvips lo include)
Il popup mostra dinamicamente solo i controlli pertinenti al formato (come già fa Aurora).

**Export batch.** Con molte immagini aperte come miniature: **selezione multipla** nella sidebar (click, `Shift`=range, `Cmd/Ctrl`=toggle); "Esporta selezione…" apre lo stesso popup formato/compressione + **scelta cartella**; il main processa la coda con **concorrenza limitata** (~`os.cpus().length`) e **barra di avanzamento**. sharp lavora fuori dal renderer.

**Virtualizzazione sidebar (il rinvio della M2, ora dovuto).** Con centinaia di miniature serve **`@tanstack/react-virtual`** (windowing): monta solo le miniature visibili (+ margine), thumbnail on-demand con **cache LRU**. Per le **immagini** la sidebar è una griglia con multi-selezione (niente riordino dnd → virtualizzazione semplice). Per le **pagine PDF** il riordino dnd-kit resta e la virtualizzazione si integra solo se emerge un PDF da molte centinaia di pagine (misurazione item durante il drag: delicata — vedi nota storica).

### Milestone 7 — Editor Markdown: stack e scelte

**Editor: `CodeMirror 6`** (`@codemirror/lang-markdown`, `state`, `view`). Perché: modulare e **tree-shakeable** (leggero), sintassi markdown **scrivibile a mano** con evidenziazione, **keymap** personalizzabile per le scorciatoie, API di **decorazioni** per la preview inline in stile Obsidian. Editor per-tab sul modello tab polimorfico.

**Anteprima** (toggle in toolbar):
- **Split/preview** (base consigliata): sorgente CM6 a sinistra, HTML renderizzato a destra — semplice e robusta; *"se uso un heading lo vedo"*.
- **Live preview inline** (evoluzione stile Obsidian): decorazioni CM6 che nascondono il markup e stilizzano inline. Più complessa; dopo la split.

**Rendering Markdown: `markdown-it`** (veloce, piccolo, estensibile) con plugin:
- task list `- [ ]` → `markdown-it-task-lists`
- **callout Obsidian** `> [!todo]` / `> [!note]` / `> [!warning]` → piccolo plugin dedicato (o `markdown-it-obsidian-callouts`)
- quote `>`, heading, liste, codice sono nativi CommonMark/GFM
- **Sicurezza: `DOMPurify`** sull'HTML prima di iniettarlo (il `.md` è input **non fidato**; mai `dangerouslySetInnerHTML` senza sanitizzazione — coerente con contextIsolation/sandbox)
- **Esclusi per ora** (come richiesto): **wikilink** `[[...]]` e **hashtag** `#tag` restano testo semplice.

**Toolbar formattazione + scorciatoie.** Comandi CM6 sul testo selezionato: grassetto `Cmd/Ctrl+B` (`**`), corsivo `Cmd/Ctrl+I` (`*`), heading (`#`…`######`), quote (`>`), **callout** (`> [!todo]`), lista/task, `code`/blocco, link. Ogni bottone chiama lo stesso comando della scorciatoia.

**Nuovo file di testo.** "Crea file testo" → nuova tab markdown **untitled** (`filePath: null`); al primo *Salva* parte *Salva con nome* con estensione `.md`.

**Export Markdown → PDF (come Obsidian).** Capacità **nativa di Electron** `webContents.printToPDF` su un `webContents` offscreen che carica l'HTML della preview (sanitizzato) col CSS del tema: **nessuna libreria aggiuntiva**, resa fedele all'anteprima. (pdf-lib perderebbe il layout HTML → si preferisce `printToPDF`.)

### Riepilogo librerie per ambito

| Ambito | Libreria / mezzo | Perché |
|---|---|---|
| Immagini: decode/encode/thumbnail/batch | **sharp** (libvips nativo, nel main) | come Aurora Studio; shrink-on-load = BigTIFF veloce; ogni formato; compressione parametrica; fuori dal renderer |
| BigTIFF gigapixel pan/zoom (opz.) | **geotiff.js** | lettura per tile + overview/piramide, BigTIFF nativo |
| HEIC fallback (se libvips senza heif) | **libheif-js** (WASM) | HEIC portabile senza nativo |
| Virtualizzazione liste/griglie | **@tanstack/react-virtual** | windowing per centinaia di miniature |
| Editor testo/markdown | **CodeMirror 6** | modulare, leggero, keymap + decorazioni |
| Render Markdown | **markdown-it** (+ task-lists, callouts) | veloce, piccolo, estensibile |
| Sanitizzazione HTML preview | **DOMPurify** | `.md` = input non fidato |
| Markdown/preview → PDF | **Electron `printToPDF`** (nativo) | zero dipendenze, resa fedele |
| Firme (M6) | **pdf-lib** `drawImage` | già in stack |
| PDF/A (M6) | pdf-lib + XMP/OutputIntent/ICC + **fontkit** + trailer ID/apparenze; **veraPDF** valida (test `pdfa.verify`) | PDF/A-2b **certificato** |

Tutte le scelte rispettano i vincoli richiesti: **massima reattività** (pesante nel main/worker), **self-contained** (nativi impacchettati), **leggerezza** (moduli tree-shakeable + capacità native di Electron), **multi-OS** (target per-arch dove serve il nativo, come Aurora Studio).

### Modello a tab (dalla Milestone 4)
Lo stato per-documento (base, `sizes`, command-log, redoStack, pagine/testi derivati, selezione, strumento, zoom, `savedPath`) diventa **per-tab**. Nello store Zustand i campi per-documento a livello top restano la **copia di lavoro della tab attiva**; le tab inattive sono **snapshot congelati** in `tabs: TabState[]`, indicizzati per `docId`. Cambio tab = cattura dell'attiva nello snapshot + idratazione dello snapshot di destinazione nei campi top-level. Così i componenti esistenti (Toolbar/Viewer/Sidebar/PageView) continuano a leggere i campi top-level senza modifiche. I `PDFDocumentProxy` di pdf.js vivono in una mappa globale per `sourceId` (UUID, unici tra le tab, nessuna collisione): alla chiusura di una tab si distruggono solo i `sourceId` di quella tab (base + tutte le sorgenti dei suoi `insert-pages`). L'apertura non azzera più i proxy: ogni file apre una **nuova** tab. L'apertura da OS/drag&drop passa i **path** al main (`document:openPath` per il drag&drop via `webUtils.getPathForFile`; push `document:opened` per l'"Apri con"), che legge i byte, registra il documento e li invia al renderer — un unico percorso di registrazione condiviso col dialogo.

### Nota su PDF/A (Milestone 6)
PDF/A (probabile target PDF/A-2b) impone vincoli che pdf-lib non applica da solo: metadati XMP conformi, profilo ICC di output incorporato (`OutputIntent`), **tutti** i font incorporati e sottoimpostati (niente font standard non incorporati — quindi il testo inserito dovrà usare un font reale via fontkit, non l'Helvetica standard della v0.3), nessuna cifratura, nessun contenuto proibito (JS, trasparenze non permesse in alcuni livelli). Serve quindi un passo di post-produzione dedicato (aggiunta XMP + OutputIntent + verifica incorporamento font). Da valutare `veraPDF` come validatore di conformità in fase di test.

### PDF/A-2b VALIDATO con veraPDF (v0.4)
La conformità PDF/A ora **non è più "best-effort": è certificata da veraPDF** (ISO 19005-2, profilo `2b`). Correzioni applicate in `engine.ts` (`addPdfAMetadata` e il passo `decorate`) dopo aver validato l'output reale con la CLI veraPDF 1.30.2, che aveva evidenziato tre non-conformità concrete:

1. **§6.1.3-1 — array `ID` nel trailer mancante.** pdf-lib non scrive l'`ID` del file. Ora `addPdfAMetadata` imposta `context.trailerInfo.ID` con due File Identifier (ID permanente del documento + ID di revisione, 16 byte hex ciascuno via `node:crypto`), riusando l'ID permanente del sorgente se presente.
2. **§6.2.11.4.1 — font delle apparenze AcroForm non incorporato.** Le apparenze dei campi generate da pdf-lib usano Helvetica standard. In modalità PDF/A `decorate` rigenera le apparenze con `form.updateFieldAppearances(font)` usando il **font incorporato condiviso** (Liberation subset), lo stesso del testo.
3. **§6.3.3-2 — apparenze `D`/`R` sui widget.** `createCheckBox`/pulsanti generano anche l'apparenza Down. `stripNonNormalAppearances` rimuove `D` e `R` dai dizionari `/AP`, lasciando solo `N`.

**Validazione automatica:** `src/main/pdf/pdfa.verify.test.ts` genera un PDF/A per ciascun percorso d'export (in-place con testo, copyPages/riordino, firma PNG, campo testo AcroForm, checkbox) e lo passa alla CLI veraPDF asserendo `isCompliant="true"`. Il test **si auto-salta** se il binario non è presente (variabile `VERAPDF_CLI`, default `tools/verapdf/verapdf`), così `npm test` gira ovunque; con veraPDF installato la certificazione gira insieme alla suite.

**Installazione veraPDF** (Java/JRE nel PATH richiesta): `npm run verapdf:install` — scarica ed esegue in modalità automatica l'installer IzPack ufficiale in `tools/verapdf/` (gitignored). Validazione manuale: `npm run test:pdfa`. In CI: eseguire `verapdf:install` poi `test:pdfa` come gate di conformità.

### Modello multi-sorgente (dalla v0.2)
Per supportare il merge, ogni pagina dell'arrangiamento porta un `sourceId` oltre al `sourceIndex`: può quindi provenire da documenti diversi. Il main tiene, per ogni `docId`, una mappa `sourceId → byte` (l'originale + le sorgenti importate). Il comando `insert-pages` inserisce pagine da una nuova sorgente. Il reducer puro condiviso è invariato nella filosofia, solo esteso. Le chiavi pagina (`sourceId#sourceIndex`) sono stabili e uniche: fanno da React key e da id per il drag&drop.

### Annotazioni di testo PDF-native (dalla v0.3)
Il testo inserito è modellato come `TextBox` (id, `pageKey`, x/y in spazio-pagina PDF non ruotato con origine in basso a sinistra, testo, dimensione) e vive nel command-log (`add-text`/`edit-text`/`move-text`/`remove-text`), ridotto da `reduceTexts`/`reduceDocument`. Le coordinate sono ancorate allo spazio PDF (non allo schermo), quindi restano corrette sotto zoom e rotazione; la conversione schermo↔PDF usa il `PageViewport` di pdf.js (`convertToPdfPoint`/`convertToViewportPoint`). Al salvataggio pdf-lib disegna il testo con `drawText` (Helvetica standard) nel content stream: è **vero testo selezionabile**, non rasterizzato (verificato ri-estraendolo con pdf.js). Limiti v0.3: font unico Helvetica/WinAnsi (Latin-1; caratteri fuori codifica → `?`) e testo su riga singola. Font custom + subsetting via fontkit e multi-riga sono evoluzioni.

### Note tecniche
- **Salvataggio (v0.3):** se NON ci sono modifiche strutturali (solo rotazioni e/o testo), il motore muta il documento base **in-place**, preservando integralmente struttura, AcroForm, outline e metadati (e ci disegna sopra il testo). Con riordino/eliminazione/merge/estrazione usa invece `copyPages`, che non ricollega gli AcroForm a livello di catalogo (le annotazioni di pagina sì). La mutazione in-place del page tree per preservare i moduli anche in caso di riordino è il lavoro della prossima slice M3 (AcroForms).
- **Virtualizzazione sidebar (rinviata):** l'integrazione di `@tanstack/react-virtual` con il sortable di dnd-kit è delicata (misurazione degli item durante il drag). Con documenti fino a qualche centinaia di pagine il rendering delle miniature è già lazy per canvas; la virtualizzazione vera si affronterà quando emergerà un caso reale (PDF con molte centinaia di pagine).
