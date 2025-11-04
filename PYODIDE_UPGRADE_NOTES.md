# Pyodide Upgrade Investigation Notes

## Current Status (v2.0.2)

**Working Version**: Pyodide v0.23.3 (Python 3.10)
- Deployed and functional across all browsers
- Works in Chrome with DevTools closed ✓

## The Problem

Upgrading to Pyodide v0.24.0+ (Python 3.11+) causes a Chrome-specific stack overflow:
- **Error**: `RangeError: Maximum call stack size exceeded`
- **Location**: `pyodide.asm.wasm` during `import vpython.vector`
- **Chrome only**: Works fine in Firefox/Safari
- **DevTools workaround**: Opening DevTools prevents the crash (slows Chrome execution)

## Investigation Results

### What We Tested

1. **Pyodide v0.29.0** (Python 3.13)
   - ✅ NumPy imports work (this was fixed)
   - ❌ vpython.vector crashes
   - The issue was introduced somewhere between v0.23.3 and v0.24.0

2. **Pyodide v0.27.4** (Python 3.12)
   - ❌ vpython.vector still crashes
   - Same stack overflow behavior

3. **Pyodide v0.26.2** (Python 3.11)
   - Not tested, but likely has same issue

### Root Cause Analysis

The crash occurs during Python class definition parsing in WASM:
- `vpython/vector.py` is a 350-line class with 7 `@property` decorators
- Python 3.11+ changed how WASM modules are compiled/optimized
- Chrome's V8 engine has stricter stack limits than Safari/Firefox for WASM execution
- The combination triggers deep recursion during class import

### Failed Workarounds

- ❌ JavaScript delays before import (doesn't help during import)
- ❌ Reducing Python recursion limit (issue is in C/WASM layer)
- ❌ Splitting imports into multiple calls
- ❌ Removing Cython wheel (wasn't the issue)

## Path Forward: Upgrading to Modern Pyodide

To upgrade to Pyodide v0.29.0+ (Python 3.13), we need to address the vpython.vector issue.

### Option 1: Rebuild Cython Vector (RECOMMENDED)

The `cyvector` Cython extension should be much faster and won't have the stack overflow issue.

**Current wheel**: `cyvector-0.1-cp311-cp311-emscripten_3_1_39_wasm32.whl`
- Built for Python 3.11
- Not compatible with Python 3.13 in Pyodide v0.29.0

**TODO**:
1. Find the Cython source for `cyvector`
2. Rebuild for Python 3.13: `cyvector-0.1-cp313-cp313-emscripten_3_1_46_wasm32.whl`
3. Test with Pyodide v0.29.0
4. If successful, update to v0.29.0 and use Cython vector

**Benefits**:
- Much faster vector operations
- Avoids the pure Python class definition stack overflow
- Gets modern Pyodide features and Python 3.13

**Build instructions** (when source is found):
```bash
# Install Pyodide build tools
pip install pyodide-build

# Build the wheel
pyodide build

# Output: dist/cyvector-0.1-cp313-cp313-emscripten_3_1_46_wasm32.whl
```

### Option 2: Simplify vector.py

Rewrite `vpython/vector.py` to be less complex:
- Reduce number of `@property` decorators
- Split into smaller classes
- Simplify method chains

**Pros**: No build tools needed
**Cons**: More work, may hurt performance, maintains pure Python version

### Option 3: Wait for Pyodide/Chrome Fix

Monitor these for updates:
- Pyodide changelog: https://pyodide.org/en/stable/project/changelog.html
- Chrome V8 WASM improvements
- Pyodide GitHub issues related to stack overflow

**Pros**: No work required
**Cons**: Timeline unknown, may never be fixed

## Recommended Next Steps

1. ✅ Deploy current working version (v0.23.3) - **DONE**
2. 🔍 Locate cyvector source code
3. 🔨 Rebuild cyvector for Python 3.13
4. ✅ Test with Pyodide v0.29.0
5. 🚀 Deploy upgraded version

## Files to Update When Upgrading

When ready to upgrade Pyodide:

1. **`src/routes/+layout.svelte:2`**
   ```html
   <script src="https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js"></script>
   ```

2. **`src/routes/+page.svelte:25`**
   ```javascript
   let pyodideURL = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/'
   ```

3. **`static/cyvector-*.whl`**
   - Replace with Python 3.13 version

4. **Version strings**
   - Update to v3.0.0 in `+page.svelte` and `utils.js`

5. **`CLAUDE.md`**
   - Update status to reflect successful upgrade

## Testing Checklist

When testing upgraded version:

- [ ] Works in Chrome (DevTools closed)
- [ ] Works in Chrome (DevTools open)
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] vpython.vector imports successfully
- [ ] NumPy imports work
- [ ] User programs execute correctly
- [ ] No performance regression

## Reference Links

- Pyodide releases: https://github.com/pyodide/pyodide/releases
- Building packages: https://pyodide.org/en/stable/development/building-and-testing-packages.html
- Emscripten versions: https://emscripten.org/docs/introducing_emscripten/release_notes.html

## Questions to Answer

1. Where is the cyvector source code?
2. What are the build dependencies?
3. Are there other Cython modules we should rebuild?
4. Should we maintain both pure Python and Cython versions?
