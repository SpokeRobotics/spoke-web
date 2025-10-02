# Spoke Web – Static Next.js Site

A modern static site built with Next.js (App Router) featuring Markdown/MDX content, SideImages layout, Mermaid diagrams, OpenCascade CAD in the browser (via web worker) with Three.js viewers, and a Figma design token ingestion pipeline.

## ✨ Highlights

- **Static export** for GitHub Pages and other static hosts
- **MDX + Markdown** content from `content/`, `docs-submodules/`, and legacy `docs-test/`
- **SideImages layout** selectable via front matter to keep images aligned with their section
- **Floating Table of Contents** with scroll spy on docs pages
- **Mermaid** diagrams, pre-generated to static SVGs
- **OpenCascade.js CAD**: build models from code, load STEP/STL, mesh in a web worker, export STEP/STL/GLB
- **Three.js viewers** with interactive controls and export helpers
- **Design tokens** from Figma JSON exports → CSS custom properties
- **Radix Themes** UI

## 🚀 Quick Start

```bash
# Install
npm install

# Develop
npm run dev  # http://localhost:3000

# Production build (static export)
npm run build
```

## 📁 Project Structure

```
app/                     # Next.js App Router pages
components/              # UI components
content/                 # Local markdown/mdx content 
docs-test/              # Test docs directory 
figma/exports/           # Local JSON token exports input for ingestion
lib/                     # Utilities (markdown, paths, mdx)
public/                  # Static assets
scripts/                 # Build helpers & generators
styles/                  # Global styles + generated token CSS
```

## 📝 Content Model

- **Sources**: Markdown/MDX is read from `content/` and `docs-submodules/` (preferred), and legacy `docs-test/` (fallback).
- **Front matter**: YAML front matter is supported in both Markdown and MDX.
- **Raw HTML**: Allowed and safely parsed (`rehype-raw`) in both `lib/markdown.js` and MDX pipeline.
- **Heading anchors**: `rehype-slug` + `rehype-autolink-headings` add linkable anchors.
- **Base path-aware links**: Home content is post-processed to prepend `NEXT_PUBLIC_BASE_PATH` where needed (`components/templates/HomeTemplate.jsx`).
- **Top-level MDX pages**: Files in `content/*.mdx?` render under `/{slug}` via `app/[slug]/page.js`.

See:
- `lib/markdown.js` – Markdown → HTML pipeline (remark/rehype), multi-root content resolution, and helpers for listing slugs.
- `lib/mdx.js` – MDX RSC renderer with custom components and an optional SideImages rehype.

## 🧩 Mermaid Diagrams

- Author Mermaid code blocks in docs or use provided examples.
- `npm run diagrams:generate` calls `scripts/generate-static-svgs.js` to pre-render SVGs into `public/diagrams/` for static hosting.
- Example generated files and a `manifest.json` live under `public/diagrams/`.
- On production build, `prebuild` runs to ensure diagrams are up-to-date.

References:
- `scripts/generate-static-svgs.js` (batch renderer using Mermaid 11)
- `public/diagrams/` (output)

## 🎨 Design Tokens – Ingestion Flow (Figma → CSS variables)

Token ingestion converts local JSON exports into CSS variables used by the site.

- **Source**: `figma/exports/*.json` (export from Figma Variables or your token JSON)
- **Script**: `scripts/ingest_figma_exports.js`
- **Output**: `styles/figma-tokens.css` with `:root { --theme-...: value; }` variables
- **Mode selection**: `FIGMA_EXPORT_MODE="<Mode Name>"` chooses the Variables “mode” (first mode is default)
- **Supported inputs**:
  - Figma Variables export shape with `variables`, `modes`, `valuesByMode`, `resolvedValuesByMode`
  - Simple tokens object: `{ "Theme A": { "themeColorsAccentAccent1": "#fff", ... }, ... }`

Usage:

```bash
FIGMA_EXPORT_MODE="Theme A" npm run figma:ingest
# writes styles/figma-tokens.css
```

Then import the generated CSS in `styles/globals.css` (or a layout) so variables theme the whole site. Inspect/validate tokens with:

```bash
npm run tokens:inspect
npm run tokens:usage
```

## 🛠 Available npm scripts

```bash
# Development
npm run dev             # Sync content images, start Next dev on port 3000

# Build & serve
npm run build           # Next build (exports static site in production config)
npm run start           # Start Next server (useful without static export)
npm run serve:static    # Serve ./out locally on port 5054 (after build)

# Linting
npm run lint            # Run ESLint

# Prebuild hooks
npm run prebuild        # Generate static diagram SVGs + sync content images (runs automatically before build)

# Assets & diagrams
npm run sync:images       # Copy images from content repos into public/content/images
npm run diagrams:generate # Generate static Mermaid SVGs into public/diagrams

# Tokens
npm run tokens:inspect  # Inspect parsed token exports (debug tooling)
npm run tokens:usage    # Analyze where tokens are referenced in the codebase
npm run figma:ingest    # Ingest local figma/exports/*.json → styles/figma-tokens.css

# Figma utilities (optional)
npm run figma:fetch     # Fetch design assets/tokens (requires env config)
npm run figma:react     # Generate React stubs from design nodes (experimental)
```

## 🌐 Deployment

The project is configured for static export when `NODE_ENV=production`:

- `next.config.mjs` sets `output: 'export'`, `trailingSlash: true`, and unoptimized images for static hosts.
- Configure base path for GitHub Pages via env: `NEXT_PUBLIC_BASE_PATH=/spoke-web`.
- Build outputs to `out/`.

Steps:

1. Set env if deploying to project pages (e.g., `/spoke-web`).
2. `npm run build`
3. Deploy the `out/` directory to your static host.

GitHub Pages
- The repo includes a workflow in `.github/workflows/deploy-pages.yml` that sets `NEXT_PUBLIC_BASE_PATH` and deploys automatically on push to main.

## 📦 Tech Stack

- Next.js 15 (App Router), React 19
- MDX + remark/rehype plugins (GFM, slug, autolink, raw HTML where needed)
- Mermaid 11 (pre-rendered static SVGs)
- Three.js + @react-three/fiber for viewers
- OpenCascade.js (WASM) running in a dedicated web worker
- Radix Themes UI

## 📚 Markdown, MDX, and SideImages

- `app/[slug]/page.js` renders top-level `content/{slug}.mdx?` via the MDX pipeline in `lib/mdx.js`.
- `app/docs/[...slug]/page.js` renders nested docs from `docs-submodules/` via the Markdown pipeline in `lib/markdown.js`.
- Front matter can select alternate layout/renderer:
  - `layout: sideImages` or `renderer: sideImages` → image-right column sections.
- The MDX code component routes CAD blocks to interactive viewers:
  - Back-compat: ```cadjs fences.
  - New style: ```js cad {...} with JSON or key=value params in metastring.

See:
- `lib/mdx.js` → `rehypeSideImagesSections()` and `ClientMdxCodeRenderer.jsx`
- `components/templates/SideImagesDoc.jsx` for HTML SideImages rendering
- `components/FloatingTOC.jsx` integrated on content and docs pages

## 🧠 OpenCascade / CAD features

End-to-end browser CAD powered by OpenCascade.js compiled to WASM and offloaded to a web worker. Key pieces:

- `components/cad/CadWorkbench.jsx` – Workbench with viewer, editor, RUN, and export buttons.
  - Viewer-only mode for loading external models.
  - Workbench mode executes `buildModel(oc)` user code in the worker.
  - Exports: STEP (via worker), STL/GLB (via Three.js geometry exporters).
- `components/cad/workers/OcWorker.js` – The worker runtime that:
  - Initializes OC, executes builds, caches `lastShape`, meshes shapes to buffers, exports STEP.
  - Handles `build`, `exportStep`, and `loadStep` for external STEP files.
- `components/cad/ThreeCadViewer.jsx` – Three.js scene with fit/reset, spin, frame, shading, origin toggles.
- `components/cad/Exporters.js` – STL and GLTF export helpers and blob download utilities.
- `components/cad/mdx` integration – `ClientMdxCodeRenderer.jsx` maps code fences to `<CadBlock/>`.

Model loading and test assets:

- API route `app/api/test-models/[...path]/route.js` serves files from `docs-test/models/` during static export.
- In viewer-only mode, you can set `ui.model` to an `.stl` or `.step` path (e.g., `models/Robody_Frame_48x48x48.step`).
- STEP files are fetched, then meshed by the worker (`loadStep`). STL files are parsed with `STLLoader`.

Exports:

- STEP export runs entirely in the worker and returns a Blob; filename is sanitized and defaults to `${id}.step`.
- STL/GLB export use the last Three.js geometry and client-side download.

Docs helper:

- The workbench can show a quick-reference doc table via `DocsTable` reading `/test/cad-doc/oc-apis.md`.

## 🎮 Three.js integration

- `ThreeCadViewer` renders meshes built from OC buffers or loaded via loaders.
- Controls exposed via `CadWorkbench` toolbar: spin mode, frame mode (hide/light/dark), shading (gray/white/black/off), origin axes.
- Imperative methods: `run`, `fitView`, `resetCamera` exposed via `ref` from `CadWorkbench`.

## 📦 Submodules and external docs

- `docs-submodules/` contains external doc trees (e.g., product or module docs). The docs app route reads from this root.
- Markdown image paths are rewritten to valid public paths (`app/docs/[...slug]/page.js` uses `getImagePath`).
- Legacy `docs-test/` remains as sample content and provides test models/images.

## 🧪 Test pages and samples

- Diagrams: `public/diagrams/flowchart.svg`, `class.svg`, `gitgraph.svg` demonstrate Mermaid theming.
- CAD: Use content pages embedding CAD code blocks to open the interactive workbench; or set `ui.model` to preview test models served by the API above.
- Docs helper: `/test/cad-doc/` static resources feed the in-editor docs table.
- Design page: `app/design/page.js` intentionally returns 404 (placeholder).

## 🔧 Configuration notes

- `next.config.mjs` sets `output: 'export'` in production and configures `basePath/assetPrefix` from `NEXT_PUBLIC_BASE_PATH`.
- Webpack is configured to load `.wasm` and to provide recommended fallbacks for OpenCascade.
- React strict mode is off to avoid WebGL context churn during development.

## 🤝 Contributing

- Branch from main, make changes, and test with `npm run dev`.
- Build locally before PRs to verify static export.

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Radix Themes Documentation](https://www.radix-ui.com/themes)
- [Mermaid Documentation](https://mermaid.js.org)
- [MDX Documentation](https://mdxjs.com)
- [Figma Design File](https://www.figma.com/community/file/1280428825266545105)
- [Figma Variables to JSON](https://www.figma.com/community/plugin/1345399750040406570)

## 📄 License

MIT License.
