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
