import { Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/**
 * Menu applicativo esplicito. Serve soprattutto a NON registrare gli
 * acceleratori di zoom della chrome (`zoomIn`/`zoomOut`/`resetZoom`): quelli
 * scalerebbero l'intera GUI, mentre `Cmd/Ctrl +/-/0` devono agire sullo zoom
 * del DOCUMENTO (gestito nel renderer). Per lo stesso motivo qui non c'è alcun
 * acceleratore `Cmd/Ctrl+W`: la chiusura tab è gestita dalle scorciatoie del
 * renderer (una tab ≠ una finestra).
 */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    // Edit resta completo: copia/incolla servono ai campi testo (annotazioni, Markdown).
    { role: 'editMenu' },
    {
      label: 'Visualizza',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Finestra',
      submenu: [{ role: 'minimize' }, ...(isMac ? [{ role: 'front' as const }] : [])]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
