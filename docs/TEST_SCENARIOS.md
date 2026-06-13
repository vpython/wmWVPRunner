# Issue #1 Test Scenarios

This document describes manual test scenarios for verifying the Web Worker implementation resolves Issue #1 (rate() function in synchronous Python code).

## Overview

After deploying wmWVPRunner, test each scenario below by:
1. Opening https://wmvprunner.dev (or your deployment URL)
2. Pasting the Python code into the editor
3. Clicking "Run"
4. Verifying it executes without errors

Each test should complete in a few seconds. Watch the console for output and errors.

---

## Test 1: rate() at top level

**Purpose:** Verify rate() works without wrapping in async def or await

**Code:**
```python
from vpython import rate

for i in range(5):
    print(f"Frame {i}")
    rate(10)

print("Top-level rate test passed")
```

**Expected Result:**
- Prints `Frame 0` through `Frame 4`
- Prints `Top-level rate test passed`
- No SyntaxError
- Completes in ~0.5 seconds (5 frames at 10 FPS)

---

## Test 2: rate() inside user function

**Purpose:** Verify rate() works when called from a user-defined function

**Code:**
```python
from vpython import rate

def move():
    for i in range(3):
        print(f"Move frame {i}")
        rate(10)

move()
print("Nested rate test passed")
```

**Expected Result:**
- Prints `Move frame 0`, `Move frame 1`, `Move frame 2`
- Prints `Nested rate test passed`
- No SyntaxError
- Completes in ~0.3 seconds

---

## Test 3: rate() in nested functions

**Purpose:** Verify rate() works in deeply nested function calls

**Code:**
```python
from vpython import rate

def outer():
    def inner():
        for i in range(2):
            print(f"Inner {i}")
            rate(10)
    inner()

outer()
print("Deep nested rate test passed")
```

**Expected Result:**
- Prints `Inner 0`, `Inner 1`
- Prints `Deep nested rate test passed`
- No SyntaxError
- Completes in ~0.2 seconds

---

## Test 4: rate() in class methods

**Purpose:** Verify rate() works when called from class instance methods

**Code:**
```python
from vpython import rate

class Animator:
    def animate(self):
        for i in range(2):
            print(f"Animating {i}")
            rate(10)

a = Animator()
a.animate()
print("Class method rate test passed")
```

**Expected Result:**
- Prints `Animating 0`, `Animating 1`
- Prints `Class method rate test passed`
- No SyntaxError
- Completes in ~0.2 seconds

---

## Test 5: Mixed graphics and rate()

**Purpose:** Verify rate() works alongside graphics object creation and manipulation

**Code:**
```python
from vpython import sphere, vector, rate, color

s = sphere(pos=vector(0, 0, 0), radius=1, color=color.red)
print(f"Created sphere at {s.pos}")

for i in range(2):
    print(f"Animation frame {i}")
    s.pos.x += 0.5
    rate(5)

print("Graphics + rate test passed")
```

**Expected Result:**
- Prints `Created sphere at <0, 0, 0>`
- Prints `Animation frame 0`, `Animation frame 1`
- Sphere appears on canvas and moves right
- Prints `Graphics + rate test passed`
- No errors
- Completes in ~0.4 seconds

---

## Test 6: Rapid rate() calls (stress test)

**Purpose:** Verify rate() handles high call frequency without breaking

**Code:**
```python
from vpython import rate

print("Running 50 rapid frames...")
for i in range(50):
    if i % 10 == 0:
        print(f"  Frame {i}")
    rate(60)

print("Rapid rate test passed")
```

**Expected Result:**
- Prints progress messages
- Handles 50 frames at 60 FPS smoothly
- No crashes or "maximum call stack" errors
- Completes in ~0.8 seconds

---

## Browser Console Checks

After running any test, verify in the browser console:

1. **Check for SharedArrayBuffer availability:**
   ```javascript
   typeof SharedArrayBuffer !== 'undefined'  // Should be true
   ```

2. **Check worker status:**
   ```javascript
   // Should show worker is alive
   console.log('Worker initialized:', window._workerReady);
   ```

3. **Check for errors:**
   - Filter console to show only "Errors"
   - Should be empty (or only pre-existing errors)

---

## Regression Tests

Verify existing programs (without rate()) still work:

### Test A: Simple graphics
```python
from vpython import sphere, vector, color

s = sphere(pos=vector(0, 0, 0), radius=1, color=color.blue)
print(f"Created {s}")
```

### Test B: Vector math
```python
from vpython import vector

v1 = vector(1, 2, 3)
v2 = vector(4, 5, 6)
v3 = v1 + v2
print(f"{v1} + {v2} = {v3}")
```

### Test C: Multiple objects
```python
from vpython import box, sphere, vector, color

b = box(pos=vector(0, 0, 0), length=2, height=1, width=1, color=color.red)
s = sphere(pos=vector(3, 0, 0), radius=0.5, color=color.blue)
print(f"Created box and sphere")
```

---

## Deployment Verification

Before running these tests in production, verify:

1. **Headers are set:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Reload page
   - Click on `index.html` response
   - Verify `Response Headers` include:
     - `cross-origin-opener-policy: same-origin`
     - `cross-origin-embedder-policy: require-corp`

2. **Headers NOT needed:**
   - These tests work without special headers in development
   - But production deployment MUST set them

3. **Cross-browser testing:**
   - Chrome (latest)
   - Firefox (latest)
   - Safari (latest)
   - Edge (latest)

---

## Known Limitations

The following are NOT expected to work (out of scope for Issue #1):

- **Lambdas with rate():**
  ```python
  f = lambda: rate(10)  # Not supported
  f()
  ```
  Reason: Python language constraint (lambdas can't contain statements)

- **input() dialog:**
  ```python
  x = input("Enter a number: ")  # Not implemented yet
  ```
  Reason: Issue #2 (requires separate implementation)

- **asyncio operations:**
  ```python
  async def foo():
      await asyncio.sleep(1)  # Not compatible with synchronous worker
  ```
  Reason: Worker model is synchronous; asyncio requires event loop

---

## Troubleshooting

### Symptom: SyntaxError on rate()
**Cause:** Old code transformation still being applied
**Fix:** Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R), clear cache

### Symptom: "SharedArrayBuffer is not defined"
**Cause:** Deployment headers not set
**Fix:** Add COOP/COEP headers to server config (see IMPLEMENTATION_NOTES.md)

### Symptom: Worker doesn't initialize
**Cause:** Pyodide CDN not reachable
**Fix:** Check Network tab for failed requests, verify CDN is accessible

### Symptom: rate() hangs or is very slow
**Cause:** Frame sync issue or browser too busy
**Fix:** Close other tabs, try with fewer frames, check for JavaScript errors in console

---

## Test Results Template

Use this to document test results:

```
Test Date: [DATE]
Browser: [BROWSER + VERSION]
Deployment: [URL]
Headers Verified: YES / NO

Test 1 (Top-level): PASS / FAIL [notes]
Test 2 (User function): PASS / FAIL [notes]
Test 3 (Nested functions): PASS / FAIL [notes]
Test 4 (Class methods): PASS / FAIL [notes]
Test 5 (Graphics + rate): PASS / FAIL [notes]
Test 6 (Stress test): PASS / FAIL [notes]

Regression A (Simple graphics): PASS / FAIL [notes]
Regression B (Vector math): PASS / FAIL [notes]
Regression C (Multiple objects): PASS / FAIL [notes]

Overall Result: PASS / FAIL
Blockers: [NONE] / [list]
```
