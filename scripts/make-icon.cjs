/**
 * Genera l'icona applicativa (resources/icon.png, 1024×1024) rasterizzando
 * un SVG tramite Chromium/Electron — nessun tool esterno (rsvg/inkscape).
 *
 * Uso:
 *   ./node_modules/.bin/electron scripts/make-icon.cjs resources/icon.png
 *
 * Per l'.icns di macOS (multi-risoluzione), dopo aver rigenerato il PNG:
 *   ICONSET=$(mktemp -d)/icon.iconset; mkdir -p "$ICONSET"
 *   while read px name; do sips -z $px $px resources/icon.png \
 *     --out "$ICONSET/icon_$name.png"; done <<'EOF'
 *   16 16x16
 *   32 16x16@2x
 *   32 32x32
 *   64 32x32@2x
 *   128 128x128
 *   256 128x128@2x
 *   256 256x256
 *   512 256x256@2x
 *   512 512x512
 *   1024 512x512@2x
 *   EOF
 *   iconutil -c icns "$ICONSET" -o resources/icon.icns
 *
 * L'icona è il documento della GUI (IconDocument) ingrandito su una
 * piastrella arrotondata GRIGIO SCURO con il logo VIOLA.
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')

/** SVG dell'icona a lato `size`. Riusabile anche da rasterizzatori alternativi. */
function iconSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c303a"/>
      <stop offset="1" stop-color="#1e2129"/>
    </linearGradient>
    <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a99cff"/>
      <stop offset="1" stop-color="#7d6cf0"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="13" flood-color="#8b7bff" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect x="6" y="6" width="${size - 12}" height="${size - 12}" rx="224" ry="224"
        fill="url(#bg)" stroke="#3a3f4b" stroke-width="4"/>
  <g transform="translate(116,104) scale(33)"
     fill="none" stroke="url(#logo)" stroke-width="1.05"
     stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
    <path d="M14 3v5h5"/>
    <path d="M9 13h6"/>
    <path d="M9 17h4"/>
  </g>
</svg>`
}

module.exports = { iconSvg }

// Eseguito direttamente da Electron: rasterizza su PNG.
if (require.main === module || (app && process.argv[2])) {
  const OUT = process.argv[2]
  if (!OUT) {
    console.error('Uso: electron scripts/make-icon.cjs <output.png>')
    process.exit(1)
  }

  const SIZE = 1024
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;background:transparent;overflow:hidden}
    *::-webkit-scrollbar{display:none}
    svg{display:block}
  </style></head><body>${iconSvg(SIZE)}</body></html>`

  app.disableHardwareAcceleration()

  app.whenReady().then(async () => {
    const win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: false }
    })

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((r) => setTimeout(r, 500))

    let image = await win.webContents.capturePage()
    const s = image.getSize()
    if (s.width !== SIZE || s.height !== SIZE) {
      image = image.resize({ width: SIZE, height: SIZE, quality: 'best' })
    }
    writeFileSync(OUT, image.toPNG())
    console.log('Scritto', OUT, image.getSize())
    app.quit()
  })
}
