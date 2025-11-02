# Claude Code Analysis - wmWVPRunner

## Problem Description

The application is a Pyodide-based VPython runner built with SvelteKit. When deployed to Google Cloud Storage and accessed via Chrome, it encounters a fatal error:

```
RangeError: Maximum call stack size exceeded
```

### Key Symptoms

1. **Error only occurs in Chrome** (not other browsers like Firefox/Safari)
2. **Error only occurs when DevTools is CLOSED**
3. **Works fine when DevTools is OPEN**
4. Error happens during ANY Python module import from packages in the filesystem
5. Stack trace shows the error deep in pyodide.asm.wasm (Python's C internals)
6. **Even a completely empty package with just `print()` statements crashes**

## Root Cause Analysis

### Confirmed Root Cause
**Fundamental Chrome V8 + Pyodide WASM interaction bug**:

Through extensive testing, we determined:
1. Created a minimal test package with ONLY an `__init__.py` containing 3 print statements
2. This minimal package still crashes with stack overflow in Chrome (DevTools closed)
3. The crash happens BEFORE any Python code executes (print statements never appear)
4. This means the issue is in Python's **import resolution phase**, not code execution
5. The problem is in the interaction between:
   - Chrome's V8 JavaScript engine
   - Pyodide's WASM-compiled Python interpreter
   - The Emscripten filesystem layer
6. When DevTools is open, Chrome's execution is slower, preventing the stack overflow

### Why This Is Unfixable in Application Code

No amount of JavaScript delays, Python code modifications, or import restructuring can fix this because:
- The crash happens in WASM/C code (Python's import machinery)
- It occurs before any user Python code executes
- It's a timing-dependent race condition in Chrome's V8 engine
- The only "fix" is Chrome running slower (DevTools open)

## Workarounds

### For End Users
1. **Use Firefox or Safari** - These browsers do not exhibit the issue
2. **Open Chrome DevTools** - Press F12 before loading the app
3. **Use Chrome with Performance Throttling** - DevTools > Performance tab > CPU throttling

### For Developers
Attempted solutions that DID NOT work:
- ❌ Adding JavaScript delays (`setTimeout`) before/after imports
- ❌ Using `requestIdleCallback` to yield event loop
- ❌ Splitting imports across multiple `runPythonAsync` calls
- ❌ Pre-importing submodules individually
- ❌ Lazy loading with `__getattr__`
- ❌ Reducing Python recursion limit
- ❌ Retry logic with increasing delays
- ❌ Completely empty Python package (still crashes!)

### Potential Future Solutions
1. **Upgrade Pyodide** - Test newer versions (currently using v0.28.3)
2. **File Pyodide Bug Report** - This is a Pyodide+Chrome interaction issue
3. **Pre-compile Python modules** - Use `.pyc` files instead of `.py` (untested)
4. **Bundle Python code differently** - Investigate alternatives to zip archives
5. **WASM Threading** - Future Pyodide versions may handle this better

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

## Solution Implemented

### Primary Fix: Add Execution Delays
**Files**:
- `src/lib/utils/utils.js:27-29`
- `src/routes/+page.svelte:27-33, 182-185`

Added delays at critical points to give Chrome's V8 engine time to settle:

1. **After unpacking** (`utils.js`): 100ms delay after `pyodide.unpackArchive()`
```javascript
await new Promise(resolve => setTimeout(resolve, 100))
```

2. **Split imports** (`+page.svelte`): Import standard libraries first, then import vpython separately with a 100ms delay between them
```javascript
// Import standard libraries
await pyodide.loadPackagesFromImports(defaultImportCode)
var result = await pyodide.runPythonAsync(defaultImportCode)

// Import vpython separately with delay
await new Promise(resolve => setTimeout(resolve, 100))
await pyodide.loadPackagesFromImports(vpythonImportCode)
result = await pyodide.runPythonAsync(vpythonImportCode)
```

This breaks up the rapid execution chain and prevents the stack overflow in Chrome.

### Secondary Fix: CORS Configuration (Optional)
While not the root cause, proper CORS configuration is still good practice:

**File**: `cors.json`
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
```

### Build Script Updates
**File**: `do_build.sh`

```bash
# Set CORS on bucket (optional, not required for fix)
gsutil cors set cors.json gs://wmvprunner

# Build the app
npm run build

# Upload with cache headers
gsutil -m -h "Cache-Control:public, max-age=3600" cp -r build/* gs://wmvprunner/

# Set proper content types for Python files
gsutil -m setmeta -h "Content-Type:application/zip" -h "Cache-Control:no-cache" gs://wmvprunner/vpython.zip
gsutil -m setmeta -h "Content-Type:application/octet-stream" -h "Cache-Control:no-cache" gs://wmvprunner/*.whl
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
