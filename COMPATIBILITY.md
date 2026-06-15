# Web VPython WASM compatibility notes

The WASM runner executes programs with CPython through Pyodide. This gives Web VPython real Python semantics in the browser, but a few older GlowScript/RapydScript conveniences are intentionally different.

## Define functions before passing or calling them

In classic GlowScript/RapydScript, this pattern often worked even though the function was defined later:

```python
scene.bind('mousedown', clicked)

def clicked(event):
    print(event.pos)
```

In the WASM runner, names are resolved using standard Python rules. Define the function before it is referenced:

```python
def clicked(event):
    print(event.pos)

scene.bind('mousedown', clicked)
```

The same rule applies to other callbacks, button bindings, and ordinary function calls.

## `range()` requires integer arguments

The WASM runner uses CPython's built-in `range()`, which only accepts integer start, stop, and step values:

```python
for x in range(1, 10, 0.9):   # TypeError in CPython / WASM
    print(x)
```

For non-integer steps, use an explicit floating-point loop or a library helper such as NumPy:

```python
import numpy as np

for x in np.arange(1, 10, 0.9):
    print(x)
```

As with normal Python floating-point arithmetic, decimal steps such as `0.1` may produce values with small binary floating-point roundoff. Use `round(...)` when displaying values if exact decimal formatting is important.
