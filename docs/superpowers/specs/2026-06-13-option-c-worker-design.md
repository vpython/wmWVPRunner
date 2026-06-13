# Option C (WebWorker) Design: Synchronous Python Execution

**Date:** 2026-06-13  
**Issue:** wmWVPRunner #1 — `rate()` inside user functions causes SyntaxError  
**Solution:** Move Python execution to Web Worker with SharedArrayBuffer synchronization  
**Status:** Design approved, ready for implementation planning

---

## Executive Summary

**Problem:** The current regex-based approach injects `await` before `rate()` calls, but `await` is only valid inside `async def`. Inside user-defined functions, this creates a SyntaxError. AST rewriting (Option B) can fix this, but still requires users to understand async concepts.

**Solution:** Run Python on a dedicated Web Worker with synchronous execution. The worker blocks (via `Atomics.wait`) when Python calls `rate()`. The main thread handles frame timing and rendering, then signals the worker to resume. Users write **normal Python** with no async concept exposure.

**Outcome:** 
- Users see no async/await complexity
- `rate()` works from anywhere (nested functions, callbacks, etc.)
- Code is indistinguishable from desktop VPython
- Graphics calls are proxied to main thread seamlessly

---

## Architecture

### Execution Model

```
Main Thread (Browser)                Web Worker (Pyodide)
════════════════════════════════════ ════════════════════════════════════
• WebGL canvas (scene, display)      • Python interpreter
• Frame rendering & timing           • User program execution
• Graphics object instantiation      • I/O redirection (stdout/stderr)
• SharedArrayBuffer management       • Synchronization point (Atomics.wait)

              ↕ postMessage IPC ↕
        (graphics calls, I/O events)

         ↕ SharedArrayBuffer ↕
    (frame sync, timing signals)
```

### Execution Flow: rate() Call

```
User Python:  def move():
                  rate(60)

Worker:       1. Python calls rate(60)
              2. rate() posts {type: 'rate', fps: 60}
              3. rate() calls Atomics.wait(buffer, 0)
              4. *** BLOCKED ***

Main:         5. Receives 'rate' message
              6. Renders frame
              7. Measures elapsed time, updates buffer[2]
              8. Calls Atomics.notify(buffer, 0)

Worker:       9. Atomics.wait unblocks
              10. Python continues normally
              11. move() returns
```

### Execution Flow: Graphics Call

```
User Python:  s = sphere(pos=vector(1,0,0), radius=0.5)

Worker:       1. Python calls sphere(...)
              2. sphere() posts {type: 'call_gfx', func: 'sphere', args: [...]}
              3. sphere() calls Atomics.wait(buffer, 0)
              4. *** BLOCKED ***

Main:         5. Receives 'call_gfx' message
              6. Calls JS sphere(...) → creates WebGL object
              7. Stores object, writes objectId to buffer[1]
              8. Calls Atomics.notify(buffer, 0)

Worker:       9. Atomics.wait unblocks
              10. sphere() creates proxy, returns to Python
              11. s is now a proxy object; Python continues
```

---

## Communication Protocol

### Message Types (Worker → Main)

```javascript
// rate(fps) synchronization
{
  type: 'rate',
  fps: 60
}
// Main will render, then Atomics.notify worker

// Graphics call (sphere, box, etc.)
{
  type: 'call_gfx',
  func: 'sphere',
  args: [[1, 0, 0], 0.5],           // positional args as array
  kwargs: {color: [1, 0, 0]}         // keyword args as object
}
// Main will execute, write objectId to buffer[1], then Atomics.notify

// I/O: standard output
{
  type: 'stdout',
  text: 'Hello, world!'
}

// I/O: standard error
{
  type: 'stderr',
  text: 'Error: ...'
}

// Program completion
{
  type: 'done',
  result: null
}

// Program error
{
  type: 'error',
  error: 'Traceback...'
}
```

### Message Types (Main → Worker)

These are informational only; timing is controlled by SharedArrayBuffer.

```javascript
// Acknowledge (optional, for logging)
{
  type: 'ack',
  messageType: 'rate'  // which message we're acknowledging
}
```

### SharedArrayBuffer Layout

```javascript
// Int64Array with 4 elements
const buffer = new Int64Array(sharedBuffer);

// buffer[0]: Signal flag for Atomics.wait/notify
//            0 = worker waiting, 1 = proceed
//
// buffer[1]: Graphics call result (object ID)
//            Main writes object ID here before notify
//
// buffer[2]: Frame start time (milliseconds)
//            Main writes performance.now() here
//
// buffer[3]: Reserved for future use
```

**Synchronization pattern:**

```javascript
// In worker:
Atomics.wait(buffer, 0, 0);  // Block until notify on index 0

// In main (when ready to proceed):
Atomics.notify(buffer, 0);   // Wake worker
```

---

## File Structure

### New Files

**`src/lib/workers/pyodide-worker.js`**
- Worker entry point
- Initializes Pyodide (loads from CDN)
- Imports vpython package
- Message event loop: handles 'rate', 'call_gfx', I/O, etc.
- Manages SharedArrayBuffer and synchronization
- ~200–250 lines

**`vpython/_worker_bridge.py`**
- Python module loaded when running in worker environment
- Wraps `rate(fps)` to post message and block on buffer
- Wraps graphics calls (`sphere`, `box`, `vector`, etc.) to post and wait
- Redirects stdout/stderr to worker postMessage
- Detects worker context (via global injected by JS)
- ~150–200 lines

### Modified Files

**`src/routes/+page.svelte`**
- Replace `runMe()` function
- Instead of `runPythonAsync(asyncProgram)`, post code to worker
- Set up message listener for worker output (stdout, stderr, done, error)
- Initialize SharedArrayBuffer and pass to worker
- Remove regex substitution logic (lines 148–154)

**`vpython/__init__.py`**
- Conditionally import `_worker_bridge` when in worker context
- Otherwise import normal synchronous stubs (for testing, if needed)

**`src/lib/utils/utils.js`**
- Add `initializeWorker(code, sharedBuffer)` function
- Worker instantiation and message setup

### Deprecated/Removed

- The regex substitution array in `+page.svelte:148-154` — no longer needed
- Async/await injection logic — worker makes it unnecessary

---

## Implementation Phases

### Phase 1: Worker Skeleton & Message Loop (~3–4 hours)
**Goal:** Bare-bones worker that can receive code and initialize Pyodide.

- Create `src/lib/workers/pyodide-worker.js`
- Load Pyodide on worker
- Import vpython package
- Set up message listener (stub handlers for each message type)
- Test: worker initializes, main can post and receive empty acknowledgment

**Checkpoint:** Worker logs "Ready" when initialized.

### Phase 2: rate() Synchronization (~2–3 hours)
**Goal:** `rate()` blocks the worker, main thread renders, worker resumes.

- Implement `rate(fps)` wrapper in `_worker_bridge.py`
- Implement 'rate' message handler in worker JS
- Implement SharedArrayBuffer + Atomics.wait/notify in worker
- Implement frame timing and notify logic in main thread
- Test: simple `for i in range(10): rate(60)` works without SyntaxError

**Checkpoint:** Console shows frame timing, no hangs.

### Phase 3: Graphics Proxy Bridge (~3–4 hours)
**Goal:** `sphere()`, `box()`, etc. calls are proxied to main thread.

- Implement graphics call wrapper in `_worker_bridge.py`
- Map `sphere`, `box`, `vector`, `color`, etc. to postMessage calls
- Implement 'call_gfx' message handler in worker JS
- Proxy object management (ID → JS object mapping in main)
- Test: `s = sphere(pos=vector(1,0,0)); s.size = vector(2,2,2)` works

**Checkpoint:** Simple scene with sphere renders without error.

### Phase 4: I/O Redirection (~1–2 hours)
**Goal:** Capture stdout/stderr from worker, display in UI.

- Redirect Python's `sys.stdout` / `sys.stderr` in `_worker_bridge.py`
- Implement 'stdout' / 'stderr' message handlers in main
- Update stdout textarea display logic
- Test: `print()` and error messages appear in output

**Checkpoint:** Output appears in textarea correctly.

### Phase 5: Testing, Deployment Headers & Integration (~2–3 hours)
**Goal:** Full integration, deployment config, test all Issue #1 scenarios.

- Add HTTP response headers for SharedArrayBuffer:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- Test in Chrome, Firefox, Safari with DevTools both open and closed
- Verify Issue #1 examples work: nested functions, loops, event-like callbacks
- Regression test: existing programs still run
- Update `do_build.sh` if needed for header configuration

**Checkpoint:** All Issue #1 test cases pass.

---

## Deployment Requirements

### HTTP Headers

For `SharedArrayBuffer` to work in modern browsers, the following HTTP response headers are required:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Current Deployment Targets:**
- **Google Cloud Storage (GCS):** No built-in support for custom headers in bucket-level responses. Requires Cloud CDN or a proxy layer (Cloud Load Balancer + Cloud Run).
- **Cloud Run:** Can set headers in response middleware. Update the Dockerfile or app config.
- **Netlify:** Headers can be set via `netlify.toml`.
- **Local testing:** SvelteKit dev server can be configured to add these headers.

**Action Items:**
- For Cloud Run: update Dockerfile or middleware to include headers
- For GCS: evaluate options (CDN, proxy, or switch to Cloud Run)
- For local: update `svelte.config.js` or dev server config
- Update `do_build.sh` to verify headers are present

### Browser Support

- **Chrome/Edge:** Full support for SharedArrayBuffer (with headers)
- **Firefox:** Full support (with headers, slightly different COOP/COEP rules)
- **Safari:** Supported in iOS 15.2+, macOS 12.1+

Fallback for unsupported browsers: graceful error message (not in scope for this phase).

---

## Python Environment Detection

The worker needs to know it's running in a worker context so it can load `_worker_bridge` instead of expecting synchronous execution.

**Mechanism:**
1. Main thread injects a global flag: `globalThis.__pyodide_worker = true`
2. `vpython/__init__.py` checks for this flag
3. If true, imports `_worker_bridge`; otherwise, uses normal stubs

```python
# In vpython/__init__.py
import sys

if hasattr(sys, 'js') and globalThis.__pyodide_worker:
    from . import _worker_bridge
    # Overwrite builtins with worker-aware versions
    # (rate, sphere, etc. are now async-compatible via worker)
```

---

## Known Limitations & Edge Cases

### 1. Lambdas with rate()
**Status:** Not supported (same as current).

Lambdas cannot be async, so `lambda: rate(60)` won't work. This is a Python language constraint, not a worker limitation. Users should use named functions instead.

**Error handling:** Same as today — Python syntax error at load time.

### 2. Generator Functions
**Status:** Supported (transparent).

Generator functions can yield while the worker is blocked. This works naturally with our synchronous model.

### 3. Class Methods & Dunder Methods
**Status:** Fully supported.

`rate()` inside `__init__`, `update()`, etc. works because they're all in the same execution context (the worker).

### 4. Multiple Coroutines / asyncio
**Status:** Not supported.

If user code imports `asyncio` and tries to run concurrent tasks, the worker's synchronous execution won't support it. This is outside the scope of Issue #1; document as unsupported for Pyodide.

### 5. input() Function
**Status:** Requires follow-up work (Issue #2).

`input()` needs a separate bridge to main thread for dialog rendering. Not in scope for this phase; tracked separately.

### 6. Graphics object persistence
**Status:** Fully supported.

Objects created in the worker have proxies that remain valid for the lifetime of the program. Updating properties, deleting objects, etc. all work through proxy forwarding.

---

## Testing Strategy

### Unit Tests (Phase by phase)
- **Phase 1:** Worker initializes, message loop responds
- **Phase 2:** Atomics.wait/notify timing; frame delta calculations
- **Phase 3:** Graphics call proxy creation; property access on proxies
- **Phase 4:** stdout/stderr capture and display
- **Phase 5:** Full integration test with real VPython programs

### Regression Tests
Run existing test programs (if any) to ensure no functionality is lost.

### Manual QA Checklist
- [ ] Simple loop with rate() — no SyntaxError, smooth animation
- [ ] rate() inside nested function — works
- [ ] rate() inside class method — works
- [ ] Nested rate() calls (rate in two functions, one calls the other) — works
- [ ] Graphics objects created and properties modified — renders correctly
- [ ] stdout/stderr output appears in textarea — correct order, no truncation
- [ ] Works in Chrome with DevTools closed (the original pain point)
- [ ] Works in Firefox and Safari
- [ ] Deployment headers present on deployed version

---

## Rollback & Recovery

If issues arise post-deployment:

1. **Quick rollback:** Revert to commit before this branch, redeploy (5 min)
2. **Diagnosis:** Check browser console for worker errors, SharedArrayBuffer availability
3. **Fallback:** If worker approach is broken, Option B (AST rewrite) is still viable as a fallback; code is unmodified, so Option B implementation can proceed in parallel

---

## Success Criteria

✅ **After Phase 5, all of the following must be true:**

1. `rate()` works inside user-defined functions without SyntaxError
2. `rate()` works at arbitrary nesting depth (no special handling needed)
3. User code requires **zero async/await** keywords
4. Code is syntactically identical to desktop VPython
5. Issue #1 GitHub test cases all pass
6. Existing programs continue to work (regression test)
7. HTTP headers are correctly set in all deployment targets
8. Works in Chrome, Firefox, Safari

---

## Appendix: Glossary

- **SharedArrayBuffer:** JavaScript typed array that is shared between main thread and worker, used for synchronization via Atomics.wait/notify.
- **Atomics.wait/notify:** Synchronization primitives; wait blocks a thread until notify is called on the same index.
- **Proxy object:** In worker context, a placeholder that forwards method calls to main thread and waits for result.
- **COOP/COEP headers:** Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy; required to enable SharedArrayBuffer in modern browsers.
- **Pyodide:** JavaScript port of Python runtime; runs Python in the browser via WebAssembly.
