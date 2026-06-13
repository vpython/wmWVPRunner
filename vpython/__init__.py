import sys

# Check if running in Pyodide worker context
_in_worker = hasattr(sys, 'js') and sys.modules.get('__main__').__dict__.get('__pyodide_worker', False)

if _in_worker:
    # In worker context, import bridge and use its rate() and graphics functions
    from . import _worker_bridge
    rate = _worker_bridge.rate
    sphere = _worker_bridge.sphere
    box = _worker_bridge.box
    cylinder = _worker_bridge.cylinder
    pyramid = _worker_bridge.pyramid
    cone = _worker_bridge.cone
    torus = _worker_bridge.torus
    helix = _worker_bridge.helix
    ring = _worker_bridge.ring
    vertex = _worker_bridge.vertex
    compound = _worker_bridge.compound
    curve = _worker_bridge.curve
else:
    # In main thread or non-worker context, use rate from core_funcs
    from .core_funcs import rate

# Conditionally import from core_funcs (avoid conflicts in worker mode for graphics functions)
if not _in_worker:
    from .core_funcs import pyramid, ring, sphere, box, cylinder, cone, helix, vertex, compound, curve
else:
    # In worker mode, these come from _worker_bridge above
    pass

from .core_funcs import js_vec, arrow, label, scene
from .core_funcs import ellipsoid, text, distant_light, local_light, button
from .core_funcs import slider, radio, checkbox, menu, wtext, points, get_library
from .core_funcs import triangle, quad, extrusion, canvas, attach_light
from .core_funcs import graph, gcurve, gvbars, gdots, js_debug, simple_sphere, js_window
from .shapespaths_orig import *
from .vector import adjust_axis, adjust_up, comp, cross, diff_angle, dot, hat, mag, mag2, norm, object_rotate, proj, rotate
from .vec_js import vector_js as vector
from .color import color
from js import textures, bumpmaps, winput

import time
clock = time.perf_counter

def sleep(dt): # don't use time.sleep because it delays output queued up before the call to sleep
    t = clock()+dt
    while clock() < t:
        rate(60)

vec = vector
py_vec = vector

__all__ = ["sphere", "box", "color", "vec", "py_vec", "js_vec", "vector", "rate","sleep",
"cylinder", "arrow", "cone", "helix", 'adjust_axis', 'adjust_up', 'comp', 'cross', 'diff_angle', 'dot',
'hat', 'mag', 'mag2', 'norm', 'object_rotate', 'proj', 'rotate', 'scene', 'distant_light','label',
'ellipsoid', 'pyramid', 'ring', 'text', 'textures', 'attach_light', 'local_light','button',
'slider', 'wtext', 'radio', 'checkbox', 'menu', 'curve', 'points','vertex', 'triangle','quad',
'extrusion', 'paths','shapes', 'canvas','textures', 'compound','color','js_debug', 'winput',
'graph', 'gcurve', 'gvbars', 'gdots','bumpmaps', 'clock', 'simple_sphere', 'get_library',
'js_window']
