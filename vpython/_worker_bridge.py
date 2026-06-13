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
