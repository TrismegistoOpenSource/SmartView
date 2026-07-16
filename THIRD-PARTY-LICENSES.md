# Componenti di terze parti

SmartView è distribuito sotto [GPL-3.0](LICENSE). Contiene e ridistribuisce i
componenti elencati qui sotto, ciascuno sotto la propria licenza. Tutte le
licenze sono compatibili con la GPL-3.0 e ne permettono la redistribuzione.

I testi completi delle licenze che lo richiedono sono nella cartella
[`licenses/`](licenses/); questi file vengono anche impacchettati dentro
l'app distribuita (cartella `licenses/` nelle risorse dell'app).

## Runtime e interfaccia

| Componente | Licenza | Copyright / origine |
|---|---|---|
| [Electron](https://www.electronjs.org) | MIT | © GitHub Inc. e contributori |
| — Chromium (dentro Electron) | licenze multiple (BSD e altre) | vedi `LICENSES.chromium.html`, impacchettato nell'app |
| — Node.js (dentro Electron) | MIT | © Node.js contributors |
| [React](https://react.dev) + react-dom | MIT | © Meta Platforms, Inc. |
| [zustand](https://github.com/pmndrs/zustand) | MIT | © Paul Henschel |
| [@tanstack/react-virtual](https://tanstack.com/virtual) | MIT | © Tanner Linsley |
| [@dnd-kit](https://dndkit.com) (core, sortable, utilities) | MIT | © Claudéric Demers |

## Motori PDF

| Componente | Licenza | Copyright / origine |
|---|---|---|
| [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | Apache-2.0 | © Mozilla Foundation |
| — QuickJS (sandbox `pdf.sandbox`, compilato in WASM) | MIT | © Fabrice Bellard, Charlie Gordon |
| [pdf-lib](https://pdf-lib.js.org) | MIT | © Andrew Dillon |
| [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) | MIT | © Devon Govett (fork Hopding) |

Nota: i namespace `adobe:ns:meta/` e `ns.adobe.com/...` che compaiono nei
metadati XMP dei PDF/A esportati sono **identificatori XML obbligatori dello
standard** (ISO 16684 / ISO 19005), non software Adobe: SmartView non contiene
né usa codice Adobe.

## Editor Markdown

| Componente | Licenza | Copyright / origine |
|---|---|---|
| [CodeMirror 6](https://codemirror.net) (`@codemirror/*`) | MIT | © Marijn Haverbeke e altri |
| [markdown-it](https://github.com/markdown-it/markdown-it) | MIT | © Vitaly Puzrin, Alex Kocharin |
| [markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists) | ISC | © Revin Guillen |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 **oppure** Apache-2.0 (qui usato sotto Apache-2.0) | © Cure53 e contributori |

## Elaborazione immagini

| Componente | Licenza | Copyright / origine |
|---|---|---|
| [sharp](https://sharp.pixelplumbing.com) | Apache-2.0 ([testo](licenses/Apache-2.0.txt)) | © Lovell Fuller e contributori |
| [libvips](https://www.libvips.org) (binari `@img/sharp-libvips-*`) | LGPL-3.0-or-later ([testo](licenses/LGPL-3.0.txt)) | © John Cupitt e libvips authors — [sorgenti](https://github.com/libvips/libvips) |

I binari precompilati di libvips includono a loro volta librerie di terze
parti (libpng, libwebp, harfbuzz, lcms, ecc.), ognuna con la propria licenza
permissiva o LGPL: l'elenco completo è nel `README.md` del pacchetto
`@img/sharp-libvips-*`, che viaggia **dentro l'app** in
`app.asar.unpacked/node_modules/@img/`.

## Risorse impacchettate

| Risorsa | Licenza | Copyright / origine |
|---|---|---|
| Liberation Sans 2.1.5 (`resources/fonts/`) | SIL OFL 1.1 ([testo](licenses/OFL-1.1-LiberationSans.txt)) | © 2012 Red Hat, Inc.; dati digitalizzati © 2010 Google Corp. — [origine](https://github.com/liberationfonts/liberation-fonts) |
| `sRGB-v2-micro.icc` (`resources/icc/`) | CC0 1.0 (pubblico dominio) | [Compact ICC Profiles](https://github.com/saucecontrol/Compact-ICC-Profiles) di Clinton Ingram |

Il font viene **incorporato (in subset) nei PDF/A esportati dagli utenti**: la
OFL 1.1 lo consente esplicitamente e non impone alcuna licenza ai documenti che
lo incorporano. Il profilo ICC è incorporato nell'`OutputIntent` dei PDF/A:
essendo CC0, nessun vincolo si trasferisce ai file degli utenti.

## Strumenti solo di sviluppo (non distribuiti nell'app)

electron-vite, Vite, Vitest, TypeScript, electron-builder e
[veraPDF](https://verapdf.org) (validatore PDF/A usato in CI) girano solo in
fase di build/test e non fanno parte dell'app distribuita: le loro licenze non
riguardano chi scarica SmartView.
