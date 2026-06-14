# wmWVPRunner — Known Issues & Brainstorm Notes

Last updated: 2026-06-13

---

## Issue #1 — `rate()` (and `scene.waitfor`, `get_library`) inside user functions → SyntaxError

**Status: FIXED (Option B — AST transformer).** Implemented in
`vpython/_async_transform.py`; `+page.svelte` calls `transform_source()` before
`runPythonAsync` instead of the old regex substitution. The transformer promotes
the necessary functions to `async def` and inserts `await`, preserving line
numbers and comments. Option C (WebWorker) was prototyped but abandoned — see
note at the end of this section. Verified in-browser: `rate()` inside a function
animates with no SyntaxError.

**GitHub:** #9, #20 (multiple reporters — most-reported bug)

**Root cause:** The runner applies regex substitutions to add `await` before `rate(…)`, `scene.waitfor(…)`, and `get_library(…)`. Pyodide's `runPythonAsync` makes the top-level module scope async, so `await rate(60)` works at top level. But inside a user-defined `def`, `await` is a SyntaxError unless the function is declared `async def`. The regex never touches `def` declarations.

```python
# This works fine (top-level):
for i in range(100):
    rate(60)

# This fails (rate inside a user function):
def move():
    rate(60)   # becomes: await rate(60) inside a sync def → SyntaxError

move()
```

**Impact:** Extremely high — almost every non-trivial VPython animation uses this pattern.

### Brainstormed Options

**Option A — Regex: `def` → `async def` everywhere**

Add substitution `/\bdef\b/` → `async def`. All user functions become async.

Problem: calling an async function without `await` silently returns a coroutine — the body never runs. You'd also need `await` before every call to a user function, but a regex can't distinguish user functions from builtins (`sphere()`, `len()`, etc.).

Verdict: half-measure that breaks as much as it fixes.

---

**Option B — Python AST transformer (run inside Pyodide) ← RECOMMENDED SHORT-TERM**

Parse the user program as a Python AST *before* any text substitution, then:

1. Walk the tree and mark known async-needing calls — `rate(…)`, `scene.waitfor(…)`, `get_library(…)` — by wrapping them in `ast.Await` nodes.
2. Any `FunctionDef` that now contains an `Await` node anywhere in its body → promote to `AsyncFunctionDef`.
3. Propagate: any `Call` to a function now known to be async → wrap in `ast.Await`. This may trigger further promotions in step 2.
4. Repeat steps 2–3 until no changes (handles deep call chains).
5. `ast.unparse()` the transformed tree and run with `runPythonAsync`.

Python's `ast` module is available in Pyodide. `ast.unparse()` is available in Python 3.9+; we're on Python 3.13 (Pyodide 0.29.4). The transformer would live in `vpython/_async_transform.py` and be called from the JS side before `runPythonAsync`.

Pros: correct, handles arbitrary nesting and transitive call chains, no fragile text hacks.  
Cons: ~100 lines of AST visitor code. Known edge cases to handle: lambdas (can't be `async` — they can't contain `rate()` either, so probably fine), class `__init__` and dunder methods, generator functions, comprehensions.

---

**Option C — Run Python in a WebWorker with `Atomics.wait` ← RECOMMENDED LONG-TERM**

Move Pyodide entirely off the main browser thread into a `Worker`. Python runs synchronously. When Python calls `rate(60)`, the worker:
1. Posts a message to the main thread (which drives WebGL rendering).
2. Calls `Atomics.wait(sharedBuffer, …)` to synchronously block for the frame interval.

Python programs need **zero async modifications** — they look like normal desktop Python. `def` works as expected, `rate()` is just a regular function call.

Also makes `input()` and `sleep()` tractable (see Issue #2).

Pros: cleanest UX, programs are real Python with no surprises, future-proof.  
Cons: significant architectural rewrite (~1 week). Requires `SharedArrayBuffer`, which requires HTTP response headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

GCS and Cloud Run can both serve these headers but it is a deployment config change. WebGL must stay on the main thread; all object-creation calls (sphere, box, etc.) become `postMessage` to the main thread and synchronously await an acknowledgment via `Atomics.wait`.

---

**Option D — Document the constraint, require users to write `async def`**

Zero code changes. Users write:
```python
async def move():
    await rate(60)

await move()
```

Verdict: significant regression from GlowScript and from normal Python. Not acceptable for a novice audience.

---

**Current recommendation:** Implement Option B now to unblock users. Plan Option C as a future architectural improvement.

---

## Issue #2 — `input()` throws I/O error

**GitHub:** #3

`input()` tries to read from stdin, which doesn't exist in the browser. The JS side has a `winput` function (imported in `__init__.py`) that presumably provides a browser-based prompt dialog. It just needs to be injected as the Python `input` builtin before running user code — e.g., `builtins.input = winput` in the Pyodide globals setup, or by exposing it from `core_funcs.py`.

---

## Issue #3 — `scene.delete()` AttributeError

**GitHub:** #11

`delete` is a reserved word in JavaScript; `getattr(self.jsObj, 'delete')` fails via the Pyodide FFI proxy. Fix: add an explicit `delete()` method to `canvasProxy` in `core_funcs.py` that calls the JS function via bracket notation or a helper.

---

## Issue #4 — `graphPlotter.plot()` fails with float data

**GitHub:** #19

`gcurve.plot()` on the JS side calls `checkval()` which rejects Pyodide proxy objects — it expects plain JS numbers. The Python `graphPlotter.plot()` method (`core_funcs.py` ~line 303) passes arguments directly without `to_js()` conversion. Fix: convert numeric kwargs/args with `to_js()` before the JS call.

---

## Issue #5 — `copy()` not defined

**GitHub:** #8

GlowScript programs use `copy(ball)` as a standalone function. The WASM runner has `clone()` as a method on `glowProxy` but no top-level `copy()`. Fix: add a thin `copy(obj)` wrapper in `core_funcs.py` that delegates to `obj.clone()`, and export it from `__init__.py`.

---

## Issue #6 — `MathJax` not accessible from Python

**GitHub:** #23

`MathJax` is a window global loaded by the GlowScript canvas JS, but it isn't exposed to Python. Fix: `from js import MathJax` (or `from js import window as js_window; MathJax = js_window.MathJax`) in `core_funcs.py` or `__init__.py`, and add to `__all__`.

---

## Issue #7 — `Date` function not accessible

**GitHub:** #13

JavaScript `Date` is not bridged to Python. Fix: `from js import Date` added to `__init__.py` and `__all__`.

---

## Issue #8 — `ghbars` uses wrong JS factory

**Code inspection — not yet reported**

`class ghbars` in `core_funcs.py:314` is passed `factory=js_gdots` — it silently renders as a dot plot. `js_ghbars` is never imported from js. Either import `ghbars as js_ghbars` and fix the factory, or remove `ghbars` and document it as unsupported.

---

## Issue #9 — `range()` with float step

**GitHub:** #17

**Status: WON'T FIX (documented decision, 2026-06-14).** The WASM runner runs
real Python, where `range()` only accepts integers. RapydScript allowed float
steps, but we are deliberately NOT overriding `range()` to diverge from standard
Python — keeping the runtime faithful to Python is more valuable than matching
that one RapydScript extension. Float steps should use `numpy.arange(start,
stop, step)` or a manual loop/comprehension. This belongs in the user-facing
compatibility notes (webVPythonDocsHome), not in runner code.

---

## Issue #10 — `cyvector` wheel never installed (dead code)

**Code inspection**

`mpipCode` in `utils.js:1–3` defines micropip install code for the Cython vector wheel but is never called anywhere. The pure Python `vector.py` is always used. Also, the current wheel (`cp311`) is incompatible with Python 3.13 (Pyodide 0.29.4). The cyvector source needs to be located and rebuilt for cp313 before this path can be activated. See also `PYODIDE_UPGRADE_NOTES.md` and `AGENTS.md` (TODO item).

---

## Issue #11 — Error messages are opaque (NameError with no symbol name)

**GitHub:** #6

`__reportScriptError` sends `JSON.stringify(err)` which for a JS `Error` object often serializes to just `{}` or `{"type":"NameError","__error_address":...}` with no useful message text. The Python traceback is typically more useful and is available in the stderr stream — but it may not always surface clearly in the UI.

---

## Pending Commits (flaskHost + Makefile, unrelated to above)

These changes are sitting uncommitted in the parent workspace and should be committed before switching machines:

- `flaskHost/src/ide.js`: vec kwargs exclusion, WASM version guard (requires ≥3.2), editor dark mode + code hints toggles (hints OFF by default)
- `flaskHost/src/templates/index.html`: removed `editor.main.nls.js` script tag (gone in Monaco 0.55.1), added dark/hints checkboxes
- `flaskHost/package.json` + `package-lock.json`: Monaco 0.55.1 upgrade
- `flaskHost/serve.sh`: new file (`docker compose up`)
- `Makefile`: `stop` target, comment updated from "glowThings" to "webvpython"
