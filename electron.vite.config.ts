import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// CSP restrittiva iniettata solo in build: in dev interferirebbe con l'HMR di Vite.
// 'wasm-unsafe-eval' abilita SOLO la compilazione WebAssembly (serve alla sandbox
// QuickJS di pdf.js per il calcolo dei moduli), NON l'eval() di JavaScript: la
// postura resta forte (nessun eval di stringhe JS, nessuna sorgente esterna).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob:"
].join('; ')

function injectCsp(): Plugin {
  return {
    name: 'smartpdf:inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    }
  }
}

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    plugins: [react(), injectCsp()],
    resolve: {
      alias: {
        ...sharedAlias,
        '@': resolve('src/renderer/src')
      }
    }
  }
})
