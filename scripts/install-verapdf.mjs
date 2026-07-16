/**
 * Installa la CLI veraPDF in tools/verapdf per la validazione PDF/A reale.
 *
 * veraPDF è uno strumento Java (richiede una JRE nel PATH). Questo script scarica
 * l'installer IzPack ufficiale e lo esegue in modalità automatica (silenziosa).
 * Idempotente: se tools/verapdf/verapdf esiste già, non fa nulla.
 *
 * Uso:  npm run verapdf:install
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const VERSION = '1.30.2'
const INSTALLER_URL = 'https://software.verapdf.org/releases/verapdf-installer.zip'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const toolsDir = join(root, 'tools')
const installDir = join(toolsDir, 'verapdf')
const cli = join(installDir, 'verapdf')

if (existsSync(cli)) {
  console.log(`veraPDF già installato in ${installDir}`)
  process.exit(0)
}

try {
  execFileSync('java', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('Java non trovato nel PATH: veraPDF richiede una JRE (es. Temurin 17+).')
  process.exit(1)
}

mkdirSync(toolsDir, { recursive: true })
const zip = join(toolsDir, 'verapdf-installer.zip')

console.log('Scarico veraPDF...')
execFileSync('curl', ['-sL', '--fail', '-o', zip, INSTALLER_URL], { stdio: 'inherit' })
execFileSync('unzip', ['-o', '-q', zip, '-d', toolsDir], { stdio: 'inherit' })

const installerJar = join(toolsDir, `verapdf-greenfield-${VERSION}`, `verapdf-izpack-installer-${VERSION}.jar`)
if (!existsSync(installerJar)) {
  console.error(`Installer non trovato: ${installerJar} (versione attesa ${VERSION})`)
  process.exit(1)
}

const answers = join(toolsDir, 'auto-install.xml')
writeFileSync(
  answers,
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
    <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
    <com.izforge.izpack.panels.target.TargetPanel id="install_dir">
        <installpath>${installDir}</installpath>
    </com.izforge.izpack.panels.target.TargetPanel>
    <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
        <pack index="0" name="veraPDF Mac and *nix Scripts" selected="true"/>
        <pack index="1" name="veraPDF Validation model" selected="true"/>
        <pack index="2" name="veraPDF Documentation" selected="false"/>
        <pack index="3" name="veraPDF Sample Files" selected="false"/>
    </com.izforge.izpack.panels.packs.PacksPanel>
    <com.izforge.izpack.panels.install.InstallPanel id="install"/>
    <com.izforge.izpack.panels.finish.SimpleFinishPanel id="finish"/>
</AutomatedInstallation>
`
)

console.log('Installo veraPDF (modalità automatica)...')
execFileSync('java', ['-jar', installerJar, answers], { stdio: 'inherit' })

const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).split('\n')[0]
console.log(`\nOK: ${version} installato in ${installDir}`)
console.log('Esegui `npm run test:pdfa` per la validazione PDF/A certificata.')
