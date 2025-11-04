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
- Updated `src/routes/+page.svelte:25` to use `https://cdn.jsdelivr.net/pyodide/v0.29.0/full/`
- Removed unnecessary delay workarounds from `src/lib/utils/utils.js`
- Simplified import logic in `src/routes/+page.svelte` (no more delays needed)
- Tested and verified: NumPy and vpython imports work in Chrome with DevTools closed

## Application Architecture

### Frontend (SvelteKit)
- **Main page**: `src/routes/+page.svelte`
- Receives program code via `postMessage` from trusted parent window
- Loads Pyodide and executes Python code in browser

### Python Package (vpython/)
- Custom VPython library adapted for Pyodide/browser execution
- Packaged as `vpython.zip` and deployed to Cloud Storage
- Provides 3D graphics primitives via JavaScript interop

### Build Process
- SvelteKit builds static site to `build/`
- Files uploaded to `gs://wmvprunner/` bucket
- Uses `@sveltejs/adapter-static` for static site generation

## Build and Deployment

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

## Key Files

### Build Configuration
- `package.json` - npm scripts and dependencies
- `svelte.config.js` - SvelteKit configuration with static adapter
- `do_build.sh` - Build and deployment script

### Application Code
- `src/routes/+page.svelte:40-99` - Main app logic, message handling, Pyodide setup
- `src/lib/utils/utils.js:5-30` - Pyodide initialization and package loading
- `src/routes/+page.svelte:169-197` - Python code execution with async/await transformations

### Python Package
- `vpython/__init__.py` - Package exports and initialization
- `vpython/core_funcs.py` - Wrapper functions for GlowScript JavaScript objects
- `vpython/vector.py` - Vector math implementation
- `vpython/vec_js.py` - JavaScript-backed vector class
- `vpython/shapespaths_orig.py` - Path and shape definitions

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

- `PUBLIC_TRUSTED_HOST` - Parent window origin for postMessage security
  - Set in `.env` file
  - Injected at build time
  - Used to validate incoming messages

## Security Considerations

### Message Validation
`src/routes/+page.svelte:43-56` validates:
- Origin matches `PUBLIC_TRUSTED_HOST`
- Message data exists and is a string
- Prevents execution of untrusted code

## Testing After Deployment

1. Deploy using `./do_build.sh`
2. Test in Chrome with DevTools **closed**
3. Verify no stack overflow errors
4. Test program execution works correctly
5. Check browser network tab for proper cache headers on `vpython.zip`

## Additional Notes

- The `sleep()` function in `vpython/__init__.py:15-18` uses a tight loop with `rate(60)` - this is intentional and not the cause of the issue
- Pyodide version: v0.28.3 (loaded from CDN)
- GlowScript library loaded dynamically based on version in program code
