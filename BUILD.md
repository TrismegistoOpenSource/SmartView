# Ribuildare SmartView a mano

> **Nella maggior parte dei casi non serve.** Le release sono compilate da
> [GitHub Actions](.github/workflows/build.yml) su runner nativi per ogni
> piattaforma: basta spingere un tag `v*`. Questa guida serve per compilare in
> locale da un unico Mac, dove i binari nativi vanno sistemati a mano.

## Pubblicare una nuova versione

1. Aggiorna la versione in `package.json` e rinomina la cartella del progetto
   (`SmartView_0.1.0` → `SmartView_0.2.0`, schema del workspace).
2. Commit e push su `main`; controlla che la CI sia verde.
3. Spingi il tag:
   ```sh
   git tag v0.2.0 && git push origin v0.2.0
   ```
   La CI ricompila su tutti gli OS, **verifica gli artefatti** (monta i dmg,
   controlla architettura, bundle id, sharp e licenze impacchettate) e pubblica
   tutto nella pagina [Release](https://github.com/TrismegistoOpenSource/SmartView/releases).
   Nessun passo manuale.

Guida per ricostruire gli installer dopo aver archiviato il progetto (cartella
ripulita da `node_modules/`, `out/`, `tools/`). Serve **macOS su Apple Silicon**
(host usato finora) con Node 20+ e Xcode Command Line Tools.

## Target prodotti

| Installer | Piattaforma |
|-----------|-------------|
| `SmartView-AppleSilicon-0.1.0-arm64.dmg` | macOS Apple Silicon |
| `SmartView-Intel-0.1.0.dmg`              | macOS Intel (x64)   |
| `SmartView Setup 0.1.0.exe`              | Windows x64 (NSIS)  |
| `SmartView-0.1.0.AppImage`               | Linux x64           |

Ogni pacchetto è **self-contained**: l'utente finale non installa nulla (né Node
né Java). veraPDF/Java servono solo in fase di test/CI, mai a runtime.

Le due app macOS hanno **architettura pura**, nome e bundle id distinti
(`com.smartview.desktop.arm64` / `.intel`): con id identici macOS le tratta come
la stessa app e ne risolve una sola.

## 1. Dipendenze

La cache npm di sistema (`~/.npm`) ha ownership rotto: usare sempre una cache
scrivibile alternativa.

```sh
cd SmartView_0.1.0/sourcecode
npm install --cache /tmp/npmcache
```

## 2. Binari `sharp` cross-platform (PASSO CRITICO)

`sharp` carica un binario nativo per-piattaforma (`@img/sharp-<plat>` +
`@img/sharp-libvips-<plat>`). Di default `npm install` installa solo quello
dell'host (darwin-arm64). Per impacchettare Mac Intel, Windows e Linux servono
anche i loro binari **presenti tutti insieme** in `node_modules/@img/`.

> ⚠️ NON usare `npm install --os=X --cpu=Y sharp`: **sostituisce** l'insieme dei
> binari (rimuove gli altri `@img` E i nativi host del toolchain come
> `@rollup/rollup-darwin-arm64`, rompendo il build). Vanno estratti a mano.

```sh
# versioni: sharp = 0.35.3, libvips = 1.3.2 (vedi optionalDependencies di sharp)
DL=/tmp/imgdl; mkdir -p "$DL"; cd "$DL"
for p in \
  @img/sharp-darwin-arm64@0.35.3        @img/sharp-libvips-darwin-arm64@1.3.2 \
  @img/sharp-darwin-x64@0.35.3          @img/sharp-libvips-darwin-x64@1.3.2 \
  @img/sharp-linux-x64@0.35.3           @img/sharp-libvips-linux-x64@1.3.2 \
  @img/sharp-win32-x64@0.35.3 ; do            # win32 impacchetta libvips dentro
  npm pack --cache /tmp/npmcache "$p"
done

IMG=<percorso>/SmartView_0.1.0/sourcecode/node_modules/@img
extract() { d="$IMG/$2"; rm -rf "$d"; mkdir -p "$d"; tar -xzf "$1" -C "$d" --strip-components=1; }
extract img-sharp-darwin-arm64-0.35.3.tgz        sharp-darwin-arm64
extract img-sharp-libvips-darwin-arm64-1.3.2.tgz sharp-libvips-darwin-arm64
extract img-sharp-darwin-x64-0.35.3.tgz          sharp-darwin-x64
extract img-sharp-libvips-darwin-x64-1.3.2.tgz   sharp-libvips-darwin-x64
extract img-sharp-linux-x64-0.35.3.tgz           sharp-linux-x64
extract img-sharp-libvips-linux-x64-1.3.2.tgz    sharp-libvips-linux-x64
extract img-sharp-win32-x64-0.35.3.tgz           sharp-win32-x64
```

Verifica: in `node_modules/@img/` devono esserci le 7 cartelle sopra, ognuna con
il suo binario nativo (`.node` / `.dylib` / `.so` / `.dll`).

## 3. Build

```sh
cd SmartView_0.1.0/sourcecode
npm run dist:mac                       # → entrambe le app macOS (arm64 + Intel)
npm run dist:win                       # → SmartView Setup 0.1.0.exe (serve resources/icon.ico)
npm run dist:linux                     # → SmartView-0.1.0.AppImage + .deb
```

Gli installer finiscono in **`../build/`**, cioè in `SmartView_0.1.0/build/`,
fuori dal sorgente. Le cartelle intermedie (`mac/`, `mac-arm64/`,
`win-unpacked/`, `linux-unpacked/`) e i `.blockmap` si possono cancellare
dopo il build.

> ℹ️ I nomi dei dmg li distingue già `productName`, sovrascritto per ogni
> architettura dagli script `dist:mac-arm` / `dist:mac-intel`
> (`SmartView-AppleSilicon-…` e `SmartView-Intel-…`): non serve più rinominare
> nulla a mano.

### Note

- `resources/icon.ico` (icona Windows) è già nel repo. Se va rigenerata: sharp
  non scrive `.ico`, va impacchettato a mano un ICO multi-size dai PNG.
- **`.deb` Linux**: non producibile su macOS (fpm richiede GNU tar; bsdtar di
  macOS non basta). Serve un host Linux o `brew install gnu-tar`. L'AppImage
  copre comunque tutte le distro.
- **Linux/Windows arm64**: non prodotti (mancano i relativi binari sharp).
- **Firma/notarizzazione**: non fatta (identity null). Gli utenti vedranno
  l'avviso Gatekeeper/SmartScreen al primo avvio.

## 4. Test (opzionale)

```sh
npm run typecheck
npm test                 # 30 test; quelli PDF/A si auto-saltano senza veraPDF
npm run verapdf:install  # installa veraPDF in tools/verapdf (richiede Java)
npm run test:pdfa        # validazione PDF/A-2b reale con veraPDF
```
