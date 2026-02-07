# Claude Code Analysis - wmWVPRunner

## Status: RESOLVED ✓

**Solution:** Use Pyodide v0.23.3 (Python 3.10)

The Chrome stack overflow issue has been resolved by using Pyodide v0.23.3. Newer versions (v0.24.0+) cause Chrome-specific crashes when importing `vpython.vector`. See `PYODIDE_UPGRADE_NOTES.md` for upgrade path.

## Problem Description

The application is a Pyodide-based VPython runner built with SvelteKit. When using Pyodide v0.28.3 and deployed to Google Cloud Storage, Chrome users encountered a fatal error:

```
RangeError: Maximum call stack size exceeded
```

### Key Symptoms (in v0.28.3)

1. **Error only occurred in Chrome** (not other browsers like Firefox/Safari)
2. **Error only occurred when DevTools was CLOSED**
3. **Worked fine when DevTools was OPEN**
4. Error happened during Python module imports from packages in the filesystem
5. Stack trace showed the error deep in pyodide.asm.wasm (Python's C internals)

## Root Cause

**Chrome V8 + Pyodide v0.28.3 WASM interaction bug**:

The issue was in Python's import resolution phase within the WASM module when interacting with Chrome's V8 engine. The bug was present in Pyodide v0.28.3 but has been fixed in v0.29.0.

### Why Workarounds Didn't Help

No amount of JavaScript delays, Python code modifications, or import restructuring could fix this because:
- The crash happened in WASM/C code (Python's import machinery)
- It occurred before any user Python code executed
- It was a timing-dependent race condition in Chrome's V8 engine
- The only temporary "fix" was Chrome running slower (DevTools open)

## Solution: Upgrade to Pyodide v0.29.0

**Implemented in v2.0.0**:
- Updated `src/routes/+page.svelte:26` to use `https://cdn.jsdelivr.net/pyodide/v0.23.3/full/`
- Removed unnecessary delay workarounds from `src/lib/utils/utils.js`
- Simplified import logic in `src/routes/+page.svelte` (no more delays needed)
- Tested and verified: NumPy and vpython imports work in Chrome with DevTools closed

## Application Architecture

### Frontend (SvelteKit)
- **Main page**: `src/routes/+page.svelte`
- Receives program code via `postMessage` from trusted parent window or VSCode webview
- Loads Pyodide and executes Python code in browser

### Messaging Abstraction (`src/lib/utils/messaging.ts`)
- **`createMessaging(trustedHost)`** — factory that returns the appropriate adapter
- **`isVSCodeWebview()`** — detects if running inside a VSCode webview (checks for `acquireVsCodeApi`)
- **Iframe adapter** — used when embedded as an iframe in a parent page
  - `send()` calls `window.parent.postMessage()` with JSON-stringified data + trusted host origin
  - `onMessage()` validates origin against `trustedHost`, rejects empty/non-string messages, parses JSON
- **VSCode adapter** — used when running as a VSCode extension webview
  - `send()` calls `vscode.postMessage()` with raw object (not stringified)
  - `onMessage()` accepts both object and JSON-string data formats

### Version Parsing (`src/lib/utils/parseVersion.ts`)
- **`parseGlowScriptVersion(firstLine)`** — extracts GlowScript version from the first line of a program
- Matches pattern `GlowScript X.Y` (e.g., `"GlowScript 3.2 VPython"` → `"3.2"`)
- Falls back to `"3.2"` if no match found
- Extracted from inline logic in `+page.svelte` for testability

### Python Package (vpython/)
- Custom VPython library adapted for Pyodide/browser execution
- Packaged as `vpython.zip` and deployed to Cloud Storage
- Provides 3D graphics primitives via JavaScript interop

### VSCode Extension (`extension/`)
- **`extension/src/extension.ts`** — Extension entry point, registers the `wmvprunner.runVPython` command
- **`extension/src/webviewProvider.ts`** — `VPythonWebviewProvider` class
  - `createOrReveal()` — creates a webview panel with the built SvelteKit app
  - `sendProgram(content)` — sends Python code to the webview; queues if webview not ready
  - `getWebviewHtml()` — reads `index.html` from `extension/webview/`, rewrites asset paths to webview URIs, injects `__assetBaseUrl` and CSP headers
  - Returns error HTML with instructions if `extension/webview/` build directory is missing

### Build Process
- SvelteKit builds static site to `build/`
- Files uploaded to `gs://wmvprunner/` bucket
- Uses `@sveltejs/adapter-static` for static site generation

## Build and Deployment

### Cloud Deployment

**File**: `do_build.sh`

```bash
# Clean old artifacts
gsutil -m rm -r gs://wmvprunner/_app/ 2>/dev/null || true
gsutil rm gs://wmvprunner/index.html gs://wmvprunner/favicon.png 2>/dev/null || true

# Set CORS on bucket
gsutil cors set cors.json gs://wmvprunner

# Build the app
npm run build

# Upload with cache headers
gsutil -m -h "Cache-Control:public, max-age=3600" cp -r build/* gs://wmvprunner/

# Set proper content types and no-cache for index
gsutil setmeta -h "Cache-Control:no-cache, no-store, must-revalidate" gs://wmvprunner/index.html
gsutil -m setmeta -h "Content-Type:application/zip" -h "Cache-Control:no-cache" gs://wmvprunner/vpython.zip
```

### VSCode Extension Build

```bash
npm run build:extension
# Equivalent to: npm run build && cp build → extension/webview/ && cd extension && tsc
```

## Testing

### Test Framework: Vitest + jsdom

Tests are configured in two locations:
1. **Root project** (`vite.config.ts`) — uses `jsdom` environment, excludes `extension/`
2. **Extension** (`extension/vitest.config.ts`) — uses `node` environment, aliases `vscode` to mock

### Running Tests

```bash
npm test                    # Run SvelteKit-side tests (17 tests)
cd extension && npm test    # Run extension tests (3 tests)
npm run build               # Verify build still works
```

### Test Files

| File | Tests | What it covers |
|------|-------|----------------|
| `src/lib/utils/version-parsing.test.ts` | 5 | `parseGlowScriptVersion()` — various version strings, fallback behavior |
| `src/lib/utils/messaging.test.ts` | 10 | `isVSCodeWebview()` detection; iframe adapter origin/data validation; VSCode adapter object/JSON handling |
| `src/lib/utils/utils.test.ts` | 2 | `getPyodide()` — `__assetBaseUrl` integration for relative vs prefixed vpython.zip path |
| `extension/src/webviewProvider.test.ts` | 3 | Missing build dir error HTML; asset path rewriting + CSP injection; `sendProgram()` queuing + ready message |

### Test Infrastructure

- **`extension/src/__mocks__/vscode.ts`** — Mock for the `vscode` module (provides `window.createWebviewPanel`, `ViewColumn`, `Uri.file`)
- **`extension/vitest.config.ts`** — Resolves `vscode` import to the mock via alias
- Root `vite.config.ts` has `test.exclude: ['extension/**', 'node_modules/**']` to avoid cross-contamination

## Key Files

### Build Configuration
- `package.json` — npm scripts (`dev`, `build`, `test`, `build:extension`) and dependencies
- `svelte.config.js` — SvelteKit configuration with static adapter
- `vite.config.ts` — Vite config with SvelteKit plugin and test configuration
- `do_build.sh` — Cloud build and deployment script

### Application Code
- `src/routes/+page.svelte` — Main app logic, message handling, Pyodide setup, Python execution
- `src/lib/utils/utils.js` — `getPyodide()` initialization and `vpython.zip` loading (supports `__assetBaseUrl`)
- `src/lib/utils/messaging.ts` — Messaging abstraction (iframe vs VSCode adapters)
- `src/lib/utils/parseVersion.ts` — GlowScript version extraction helper

### Extension Code
- `extension/src/extension.ts` — VSCode extension entry point
- `extension/src/webviewProvider.ts` — Webview panel management, HTML rewriting, CSP injection
- `extension/package.json` — Extension manifest with commands and keybindings

### Python Package
- `vpython/__init__.py` — Package exports and initialization
- `vpython/core_funcs.py` — Wrapper functions for GlowScript JavaScript objects
- `vpython/vector.py` — Vector math implementation
- `vpython/vec_js.py` — JavaScript-backed vector class
- `vpython/shapespaths_orig.py` — Path and shape definitions

## Module Import Chain

```
vpython/__init__.py
├── core_funcs.py
│   ├── js imports (sphere, box, rate, etc.)
│   ├── vec_js.py
│   │   └── vector.py
│   └── shapes_piodide.py
├── shapespaths_orig.py
│   ├── vec_js.py (already imported)
│   └── vector.py (mag, norm functions)
├── vector.py (direct imports)
├── vec_js.py (already imported)
└── color.py
```

Note: While there are multiple imports of the same modules, Python's import system handles this correctly with module caching. The issue was not the imports themselves but the timing of cache operations.

## Environment Variables

- `PUBLIC_TRUSTED_HOST` — Parent window origin for postMessage security
  - Set in `.env` file
  - Injected at build time
  - Used by the iframe messaging adapter to validate incoming message origins

## Security Considerations

### Message Validation (Iframe Mode)
`src/lib/utils/messaging.ts` iframe adapter validates:
- Origin matches `PUBLIC_TRUSTED_HOST`
- Message data exists and is a non-empty string
- JSON parsing succeeds before invoking callback
- Prevents execution of untrusted code

### VSCode Webview CSP
`extension/src/webviewProvider.ts` injects Content-Security-Policy:
- `default-src 'none'` — blocks everything by default
- `script-src` — allows nonce-tagged scripts, webview source, CDN (jsdelivr, glowscript), `unsafe-eval` (required by Pyodide WASM)
- `connect-src` — allows webview source and CDN fetches
- `worker-src blob:` — required for Pyodide web workers

## Testing After Deployment

1. Run `npm test` and `cd extension && npm test` — all tests must pass
2. Deploy using `./do_build.sh`
3. Test in Chrome with DevTools **closed**
4. Verify no stack overflow errors
5. Test program execution works correctly
6. Check browser network tab for proper cache headers on `vpython.zip`

## Additional Notes

- The `sleep()` function in `vpython/__init__.py:15-18` uses a tight loop with `rate(60)` — this is intentional
- Pyodide version: v0.23.3 (loaded from CDN)
- GlowScript library loaded dynamically based on version in program code
- `window.__assetBaseUrl` is set by the VSCode extension webview to enable correct asset loading from webview URIs
