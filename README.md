# Modpacker

A simple web app that lets you pick mods from **Modrinth** and **CurseForge** and export them as a modpack: a Modrinth `.mrpack` or a CurseForge `.zip`. Everything runs in the browser. Packs are compiled client-side with JSZip, and the core logic needs no backend.

## Features

- **Global profile**: pick a Minecraft version (the list comes live from Modrinth) and a loader (Fabric, Forge, NeoForge). When you change the profile on a non-empty pack, you choose to **re-validate** every mod against the new profile or **clear** the pack.
- **Federated search**: one search bar with an `All / Modrinth / CurseForge` filter. Results show icon, title, description, author, download count and a source badge (green for Modrinth, orange for CurseForge). An empty query shows popular mods. Results are debounced, paginated and cancelled when you type again.
- **Smart workspace**:
  - **Add to Pack** fetches the newest compatible file for the profile. Stable releases are preferred over betas and alphas.
  - It stores the metadata the compilers need: filename, SHA-1, SHA-512, download URL and size for Modrinth; numeric project ID and file ID for CurseForge.
  - **Required dependencies are added automatically**, recursively, and pinned versions are honoured. When you remove a mod, dependencies nothing else needs are removed too.
  - Warns about mods that declare each other **incompatible**, and about the **same jar added from both platforms**.
  - The pack is saved in `localStorage`, so a reload keeps your work.
- **Cross-platform bridging**:
  - CurseForge files are looked up on Modrinth by SHA-1. If the identical jar exists there, the mod can go into a `.mrpack` too.
  - Modrinth jars can be matched on CurseForge with its murmur2 fingerprint, so they can go into a CurseForge `.zip`.
- **Export engine**:
  - **CurseForge `.zip`**: root `manifest.json` (`manifestType: minecraftModpack`, `manifestVersion: 1`, `projectID`/`fileID` entries), `modlist.html` and an empty `overrides/` folder.
  - **Modrinth `.mrpack`**: root `modrinth.index.json` (format version 1, with hashes, `env`, `downloads` and `fileSize`) and an empty `overrides/` folder.
- **Cross-platform warning**: if you export a CurseForge `.zip` with Modrinth-only mods (or a `.mrpack` with CurseForge-only mods), a dialog explains why those mods can't be referenced. You can then **switch format**, **find identical files** on the other platform, or **omit** those mods and export anyway.
- **Resilient networking**: request timeouts, a "slow API" notice, separate error banners for each source with retry, rate-limit (429) messages, skeleton loaders and empty states.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
```

The build is a static site with a relative base path, so you can host `dist/` anywhere (GitHub Pages, Netlify, Cloudflare Pages, etc.).

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
- NeoForge: `maven.neoforged.net`
- Forge: `promotions_slim.json`

The field stays editable. If a metadata host blocks the request (some do not send CORS headers), type the version in yourself.

## Project structure

```
src/
  api/          http client, Modrinth & CurseForge clients, loader-version lookup
  state/        external store, pack reducer + selectors, async pack controller, settings
  export/       manifest builders, export planner (cross-platform analysis), JSZip packager
  hooks/        federated search, debounce, remote data (game versions, loader versions)
  components/   profile bar, search grid, workspace, export panel, dialogs, UI primitives
  lib/          murmur2 fingerprinting, formatting, concurrency helper
proxy/          optional CurseForge proxy (Cloudflare Worker)
```

Not affiliated with Mojang, Microsoft, Modrinth or CurseForge/Overwolf.
