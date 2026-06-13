// pyodide-worker.js
// Web Worker that runs Python code synchronously with SharedArrayBuffer synchronization

let pyodide = null;
let sharedBuffer = null;

// Initialize Pyodide
async function initPyodide() {
  try {
    let pyodideModule = await import('https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide.js');
    pyodide = await pyodideModule.loadPyodide();
    console.log('[Worker] Pyodide loaded');

    // Load vpython package
    await pyodide.loadPackagesFromImports('from vpython import *');
    console.log('[Worker] vpython imported');

    // Inject worker flag and bridge module
    pyodide.globals.set('__pyodide_worker', true);

    // Send ready signal to main thread
    self.postMessage({ type: 'ready' });
  } catch (err) {
    console.error('[Worker] Initialization failed:', err);
    self.postMessage({ type: 'error', error: String(err) });
  }
}

// Main message handler
self.addEventListener('message', async (event) => {
  const message = event.data;

  if (message.type === 'init') {
    sharedBuffer = new Int64Array(message.sharedBuffer);
    await initPyodide();
  } else if (message.type === 'run') {
    // Will implement in later phases
    console.log('[Worker] Received run command, code length:', message.code.length);
  } else {
    console.log('[Worker] Unknown message type:', message.type);
  }
});

// Initialize on worker start (wait for init message from main)
console.log('[Worker] Started');
