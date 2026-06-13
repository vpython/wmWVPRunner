"""
Worker bridge for synchronous Python execution in Web Worker context.

Wraps rate(), graphics calls, and I/O to communicate with main thread via postMessage and SharedArrayBuffer.
"""

import sys
from ctypes import c_int64
import array

# Detect worker context
_IS_WORKER = hasattr(sys, 'js') and sys.modules.get('__main__').__dict__.get('__pyodide_worker', False)

if not _IS_WORKER:
    raise RuntimeError("_worker_bridge should only be imported in worker context")

# Import JavaScript interop
from js import self as js_self, Atomics

# Reference to the shared buffer from the main thread (will be set by worker JS)
_shared_buffer = None
_posted_messages = []

def set_shared_buffer(buffer):
    """Called by worker to set the shared buffer reference."""
    global _shared_buffer
    _shared_buffer = buffer

def _post_message(msg_dict):
    """Post a message to main thread."""
    js_self.postMessage(msg_dict)

def rate(fps):
    """
    Synchronous rate limiting.

    Posts a 'rate' message to main thread and blocks on Atomics.wait()
    until main thread renders frame and calls Atomics.notify().

    Args:
        fps: Frames per second (float)
    """
    if _shared_buffer is None:
        raise RuntimeError("Shared buffer not initialized")

    # Post rate request to main thread
    _post_message({
        'type': 'rate',
        'fps': float(fps)
    })

    # Block until main thread signals completion (Atomics.notify)
    # Buffer[0] is the signal: 0 = waiting, 1 = proceed
    # We set it to 0, then wait. Main will set it to 1 and notify.
    _shared_buffer[0] = 0  # Reset signal

    # Wait on buffer[0]. Main thread will call Atomics.notify(buffer, 0)
    # This is a synchronous block on the worker thread.
    result = Atomics.wait(_shared_buffer, 0, 0)

    # Worker wakes up when notified, Python continues


def gfx_call(func_name, args, kwargs):
    """
    Call a graphics function on main thread and wait for result.

    Posts a 'call_gfx' message and blocks until object is created.
    Main thread writes the object ID to buffer[1] and calls Atomics.notify().

    Args:
        func_name: Name of the graphics function (e.g., 'sphere', 'box')
        args: Positional arguments (list)
        kwargs: Keyword arguments (dict)

    Returns:
        Object ID (integer) from main thread
    """
    if _shared_buffer is None:
        raise RuntimeError("Shared buffer not initialized")

    # Post graphics call to main thread
    _post_message({
        'type': 'call_gfx',
        'func': func_name,
        'args': args,
        'kwargs': kwargs
    })

    # Block until main thread writes object ID and notifies
    _shared_buffer[0] = 0  # Reset signal

    result = Atomics.wait(_shared_buffer, 0, 0)

    # Read object ID from buffer[1]
    object_id = _shared_buffer[1]

    return object_id


def _redirect_stdout(text):
    """Redirect stdout to main thread."""
    _post_message({
        'type': 'stdout',
        'text': str(text)
    })

def _redirect_stderr(text):
    """Redirect stderr to main thread."""
    _post_message({
        'type': 'stderr',
        'text': str(text)
    })


# Graphics function wrappers
def _make_gfx_wrapper(func_name):
    """Create a wrapper that calls gfx_call() for a graphics function."""
    def wrapper(*args, **kwargs):
        # Convert args/kwargs to serializable format
        serializable_args = list(args)  # Assume args are already serializable
        serializable_kwargs = dict(kwargs)

        object_id = gfx_call(func_name, serializable_args, serializable_kwargs)

        if object_id < 0:
            raise RuntimeError(f"Failed to create graphics object: {func_name}")

        # Return a proxy object that will forward method calls
        return GFXProxy(object_id, func_name)

    return wrapper


class GFXProxy:
    """Proxy for graphics objects created on main thread."""

    def __init__(self, object_id, func_name):
        object.__setattr__(self, 'object_id', object_id)
        object.__setattr__(self, 'func_name', func_name)

    def __repr__(self):
        object_id = object.__getattribute__(self, 'object_id')
        func_name = object.__getattribute__(self, 'func_name')
        return f"<GFXProxy {func_name}#{object_id}>"

    def __setattr__(self, name, value):
        """Set attribute on the remote graphics object."""
        if name in ('object_id', 'func_name'):
            # Internal attributes
            object.__setattr__(self, name, value)
        else:
            # Remote property set (not implemented in Phase 3, stub for now)
            _post_message({
                'type': 'gfx_setattr',
                'objectId': object.__getattribute__(self, 'object_id'),
                'attr': name,
                'value': value
            })


# Expose graphics functions
sphere = _make_gfx_wrapper('sphere')
box = _make_gfx_wrapper('box')
cylinder = _make_gfx_wrapper('cylinder')
pyramid = _make_gfx_wrapper('pyramid')
cone = _make_gfx_wrapper('cone')
torus = _make_gfx_wrapper('torus')
helix = _make_gfx_wrapper('helix')
ring = _make_gfx_wrapper('ring')
vertex = _make_gfx_wrapper('vertex')
compound = _make_gfx_wrapper('compound')
curve = _make_gfx_wrapper('curve')


# I/O Redirection Classes
class WorkerStdout:
    """Redirects stdout to main thread via postMessage."""

    def __init__(self):
        self.buffer = ""

    def write(self, text):
        if text and text != '\n':
            _post_message({
                'type': 'stdout',
                'text': text
            })
        return len(text)

    def flush(self):
        pass


class WorkerStderr:
    """Redirects stderr to main thread via postMessage."""

    def __init__(self):
        self.buffer = ""

    def write(self, text):
        if text and text != '\n':
            _post_message({
                'type': 'stderr',
                'text': text
            })
        return len(text)

    def flush(self):
        pass


# Redirect stdout and stderr when bridge is imported
sys.stdout = WorkerStdout()
sys.stderr = WorkerStderr()
