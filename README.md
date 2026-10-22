# Modpacker

A simple web app that lets you pick mods from **Modrinth** and **CurseForge** and export them as a modpack: a Modrinth `.mrpack` or a CurseForge `.zip`. Everything runs in the browser. Packs are compiled client-side with JSZip, and the core logic needs no backend.

## Features

### Building a pack
- **Global profile**: pick a Minecraft version (fetched live from Modrinth) and a loader: **Fabric, Quilt, Forge or NeoForge**.
  - Quilt profiles also accept Fabric mods, because Quilt runs them.
  - When you change the profile on a non-empty pack, you choose to **re-validate** every mod against the new profile or **clear** the pack.
- **Federated search**: one search bar across Modrinth and CurseForge, with an `All / Modrinth / CurseForge` filter.
  - **Sorting:** relevance, downloads, popularity, newest, recently updated.
  - **Views:** grid or list.
  - **Infinite scroll:** more results load as you scroll.
  - **Hide added mods:** a toggle hides mods already in your pack, including the same mod hosted on the other platform.
  - Press **`/`** to jump to the search box.
- **Mod details view**: click any mod to see:
  - downloads, followers, last update, license, and whether it's needed on the client and/or server
  - categories, screenshots and links
  - a **compatibility list** of every loader and Minecraft version it supports
  - every **compatible file** for your profile, so you can **pin an exact version** instead of the latest
- **Smart workspace**:
  - Fetches the newest compatible file (stable releases first) and adds **required dependencies** recursively.
  - Removing a mod also removes dependencies nothing else needs. Every removal can be **undone**.
  - Search, filter (mine / dependencies / issues) and sort the pack.
  - Tags show pinned, client-only and server-only mods, dependencies, and mods also hosted on the other platform.
  - Warns about mods declared **incompatible** with each other and about the **same jar added twice**.
  - **Copy the mod list** as Markdown.
- **Import**: open an existing `.mrpack` or CurseForge `.zip`. It restores the profile, loader version and pack info, and pins every mod to the exact file the pack used.

### Exporting
- **CurseForge `.zip`**: root `manifest.json` (`manifestType: minecraftModpack`, `manifestVersion: 1`, `projectID`/`fileID` entries), `modlist.html` and an empty `overrides/` folder.
- **Modrinth `.mrpack`**: root `modrinth.index.json` (format version 1, with hashes, `env`, `downloads` and `fileSize`) and an empty `overrides/` folder.
- **Cross-platform bridging**:
  - CurseForge files are looked up on Modrinth by SHA-1.
  - Modrinth jars can be matched on CurseForge with its murmur2 fingerprint.
  - A mod published on both platforms can go into either format.
- **Cross-platform warning**: if some mods can't be referenced by the chosen format, a dialog explains why. You can then **switch format**, **find identical files** on the other platform, or **omit** those mods.

### Customisation
Everything is in **Settings** and saved in your browser:
- **Themes:** Dark, Midnight (OLED), Nether (warm) and Light, or follow the system setting.
- **Accent colours:** 8 to choose from.
- **Text size:** 90–120 %.
- **Density:** comfortable or compact.
- **Results:** grid or list.
- **Pack sidebar:** on the left or the right.
- **Toggles:** infinite scroll, hide added mods, and descriptions.

On phones, the pack and export panels open as a bottom sheet.

### Robust by default
- **Network:** request timeouts, a "slow API" notice, a separate error banner for each source with retry, and rate-limit messages.
- **Loading and empty states:** skeleton loaders and empty states.
- **Accessibility:** keyboard-friendly dialogs with focus trapping, and support for reduced motion.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
```

The build is a static site with a relative base path, so you can host `dist/` anywhere (GitHub Pages, Netlify, Cloudflare Pages, etc.).

### Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` type-checks, tests, builds and publishes the site on every push to `main`. You can also run it by hand from the Actions tab.

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. This only needs doing once.
2. Optional: to enable CurseForge for every visitor, add a repository variable `VITE_CURSEFORGE_PROXY_URL` under **Settings → Secrets and variables → Actions → Variables**. Set it to your deployed proxy URL. Do not add an API key; it would be readable in the published JavaScript.
3. Push to `main`. The site is published at `https://<owner>.github.io/<repo>/`.

## CurseForge access

CurseForge's API requires an `x-api-key` header on every request. Modrinth works with no setup. The app decides how to reach CurseForge in `src/api/curseforgeConfig.ts`:

| Mode | How | Safe to deploy? |
| --- | --- | --- |
| **Proxy** (recommended) | Set `VITE_CURSEFORGE_PROXY_URL`, or paste a proxy URL in **Settings**. The proxy adds the key server-side. | ✅ |
| **Personal key** | Each visitor pastes their own key (from [console.curseforge.com](https://console.curseforge.com/)) in **Settings**. It is stored only in their browser. | ✅ |
| **Build-time key** | `VITE_CURSEFORGE_API_KEY` in `.env.local`. Vite inlines it into the bundle. | ❌ local dev only |

A ready-to-deploy Cloudflare Worker proxy is in [`proxy/cloudflare-worker.js`](proxy/cloudflare-worker.js). It only forwards the endpoints Modpacker uses, and you can lock it to your site's origin. Copy `.env.example` to `.env.local` to configure the app.

Without CurseForge access, the app works in Modrinth-only mode and shows a "Configure" prompt.

## Loader versions

Both formats need a concrete loader build: `fabric-0.16.14` in a CurseForge manifest, `"fabric-loader": "0.16.14"` in a Modrinth index. Launchers reject a bare `"latest"`. The export panel looks up the newest build automatically:

- Fabric: `meta.fabricmc.net`
- Quilt: `meta.quiltmc.org`
- NeoForge: `maven.neoforged.net`
- Forge: `promotions_slim.json`

The field stays editable. If a metadata host blocks the request (some do not send CORS headers), type the version in yourself.

## Project structure

```
src/
  api/          http client, Modrinth & CurseForge clients, project details, loader-version lookup
  state/        external store, pack reducer + selectors, async pack controller, preferences, settings, UI state
  import/       .mrpack / CurseForge .zip parser
  export/       manifest builders, export planner (cross-platform analysis), JSZip packager
  hooks/        federated search, debounce, remote data (game versions, loader versions)
  components/   profile bar, search, mod details, workspace, export, import, settings, UI primitives
  styles/       generated theme + accent palettes (npm run theme)
  lib/          murmur2 fingerprinting, formatting, concurrency helper
proxy/          optional CurseForge proxy (Cloudflare Worker)
```

Not affiliated with Mojang, Microsoft, Modrinth or CurseForge/Overwolf.
