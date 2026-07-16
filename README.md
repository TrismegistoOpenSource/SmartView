# SmartView

Editor PDF desktop minimalista e veloce, ispirato ad Anteprima di macOS.
Costruito con Electron + TypeScript, con architettura a **due motori**
(pdf.js per il rendering, pdf-lib per le mutazioni) — il testo del PDF
resta sempre selezionabile, mai rasterizzato.

[![Build](https://github.com/TrismegistoOpenSource/SmartView/actions/workflows/build.yml/badge.svg)](https://github.com/TrismegistoOpenSource/SmartView/actions/workflows/build.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Download

Le build compilate sono nella pagina **[Release](https://github.com/TrismegistoOpenSource/SmartView/releases)** — non serve installare nulla per compilare, si scarica e si usa.

| File | Piattaforma |
|---|---|
| `SmartView-AppleSilicon-*.dmg` | macOS Apple Silicon (M1 e successivi) |
| `SmartView-Intel-*.dmg` | macOS Intel |
| `SmartView Setup *.exe` | Windows x64 |
| `SmartView-*.AppImage` | Linux x64 (portabile) |
| `SmartView-*.deb` | Debian / Ubuntu |

Su Windows, al primo avvio compare l'avviso SmartScreen: manca un certificato di
code-signing. Si passa da **Ulteriori informazioni → Esegui comunque**.

### macOS: sbloccare l'app al primo avvio

L'app **non è firmata con un Apple Developer ID**, quindi macOS la mette in
quarantena e al primo avvio dice che è danneggiata o che non può essere aperta.
Non è danneggiata: è la quarantena.

Trascina prima l'app in **Applicazioni**, poi incolla nel Terminale la riga che
corrisponde alla versione scaricata:

```bash
xattr -dr com.apple.quarantine /Applications/SmartView-AppleSilicon.app
```

```bash
xattr -dr com.apple.quarantine /Applications/SmartView-Intel.app
```

Va fatto una volta sola, e serve solo per le app scaricate da internet. In
alternativa: clic destro sull'app → **Apri** → di nuovo **Apri**.

> Questa sezione esiste unicamente perché manca una firma Apple riconosciuta
> (che richiede un account Developer a pagamento). Il giorno in cui il progetto
> ne avrà una e le build saranno notarizzate, la quarantena non scatterà più e
> queste istruzioni andranno rimosse.

## Funzionalità

- Apertura e visualizzazione PDF con **testo selezionabile e ricercabile**
- Sidebar miniature a scomparsa
- **Riordino pagine** via drag & drop
- **Rotazione** ed **eliminazione** pagine
- Zoom
- Undo delle modifiche
- Salvataggio come nuova copia (le modifiche vengono applicate dal
  processo Main via pdf-lib solo al salvataggio)
- Export **PDF/A** (ISO 19005-2, profilo 2b), la cui conformità è verificata
  in CI con veraPDF ad ogni modifica del motore

Vedi [`ARCHITECTURE.md`](./ARCHITECTURE.md) per il razionale tecnico completo.

## Dove salva i dati

Un solo file, la lista dei documenti recenti:

| OS | Percorso |
|---|---|
| macOS | `~/Library/Application Support/SmartView/recents.json` |
| Linux | `~/.config/SmartView/recents.json` |
| Windows | `%AppData%\SmartView\recents.json` |

Le due build macOS hanno nome e bundle id distinti (`SmartView-AppleSilicon`,
`SmartView-Intel`), altrimenti macOS le tratterebbe come la stessa app; la
cartella dati resta però una sola per entrambe, fissata via `app.setName()`.

## Sviluppo

Prerequisiti: Node.js ≥ 20 (testato su 24) e npm ≥ 10.

```bash
npm install
npm run dev        # avvia l'app in hot-reload
```

Altri comandi:

```bash
npm run typecheck  # controllo tipi (main+preload e renderer separati)
npm test           # unit test del motore (Vitest)
npm run build      # transpila in ./out senza pacchettizzare
```

## Compilare dai sorgenti

**electron-builder compila per la piattaforma su cui gira**: ogni comando va
eseguito sul sistema operativo corrispondente. Gli artefatti escono in
`../build/`, fuori dal sorgente.

```bash
npm run dist:mac     # entrambe le app macOS (arm64 + Intel)
npm run dist:mac-arm # solo Apple Silicon
npm run dist:mac-intel # solo Intel
npm run dist:win     # installer NSIS .exe (x64)
npm run dist:linux   # .AppImage e .deb
```

Ogni app macOS ha **architettura pura**, non è un universal binary: `sharp`
carica un binario nativo per-architettura e impacchettarne due nello stesso
bundle è problematico. Compilare l'app Intel da un Mac Apple Silicon richiede
di procurarsi a mano i binari `sharp` x64 — vedi [`BUILD.md`](./BUILD.md).

Per questo le release su GitHub sono compilate da
[GitHub Actions](.github/workflows/build.yml) su runner macOS Apple Silicon,
macOS Intel, Windows e Linux **reali**: ogni runner compila nativamente la
propria architettura e la CI verifica gli artefatti montando i dmg prodotti.

## Struttura

```
src/
  shared/     tipi e logica condivisi tra i processi (command-log, contratti IPC)
  main/       processo Main: filesystem, dialoghi, motore pdf-lib
  preload/    ponte sicuro (contextBridge)
  renderer/   interfaccia React + rendering pdf.js
resources/    icone, font e profilo ICC inclusi nel pacchetto
scripts/      utilità (generazione icona, installazione veraPDF)
```

Configurazione di sicurezza: `contextIsolation`, `sandbox`,
`nodeIntegration: false`, CSP restrittiva, navigazione bloccata.
Un PDF è trattato come input non fidato.

## Licenza

[GPL-3.0](LICENSE). I componenti di terze parti inclusi nell'app, con le
rispettive licenze e citazioni, sono elencati in
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md); i testi delle licenze
viaggiano anche dentro l'app distribuita, nella cartella `licenses/` delle
sue risorse.
