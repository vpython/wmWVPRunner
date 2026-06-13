<script lang="ts">
	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { onMount } from 'svelte'
	import { setupGSCanvas, getPyodide, initializeWorker } from '$lib/utils/utils'
	import { PUBLIC_TRUSTED_HOST, PUBLIC_PACKAGE_BASE_URL } from '$env/static/public'
	const trustedHosts = PUBLIC_TRUSTED_HOST.split(',').map((s) => s.trim())
	let activeParentOrigin = '*'
	function redirect_stdout(theText: string) {
		if (mounted) {
			stdoutStore.update((val: string) => (val += theText + '\n'))
		}
	}

	function redirect_stderr(theText: string) {
		if (mounted) {
			stdoutStore.update((val: string) => (val += 'stderr:' + theText + '\n'))
		}
	}

	let pyodide: any = null
	let program: string
	let stdout: HTMLTextAreaElement
	let scene: any
	let display: any
	let mounted: boolean = false
	let pyodideURL = 'https://cdn.jsdelivr.net/pyodide/v0.29.4/full/'
	let currentWorker: Worker | null = null
	let lastFrameTime: number = 0
	let worker: Worker | null = null
	let sharedBuffer: BigInt64Array | null = null

	// Standard library imports
	let mathImportCode = `from math import *`
	let randomImportCode = `from random import random`

	// Import vpython
	let vpythonImportCode = `from vpython import *`

	function addScript(src: string, callback: () => void) {
		var s = document.createElement('script')
		s.setAttribute('src', src)
		s.onload = callback
		document.body.appendChild(s)
	}

	function addScripts(urls: string[], callback: () => void) {
		if (urls.length === 0) { callback(); return }
		addScript(urls[0], () => addScripts(urls.slice(1), callback))
	}

	const unpackagedLibs = [
		'lib/jquery/2.1/jquery.mousewheel.js',
		'lib/flot/jquery.flot.js',
		'lib/flot/jquery.flot.crosshair_GS.js',
		'lib/plotly.js',
		'lib/opentype/poly2tri.js',
		'lib/opentype/opentype.js',
		'lib/glMatrix.js',
		'lib/webgl-utils.js',
		'lib/glow/property.js',
		'lib/glow/vectors.js',
		'lib/glow/mesh.js',
		'lib/glow/canvas.js',
		'lib/glow/orbital_camera.js',
		'lib/glow/autoscale.js',
		'lib/glow/api_misc.js',
		'lib/glow/WebGLRenderer.js',
		'lib/glow/graph.js',
		'lib/glow/color.js',
		'lib/glow/shapespaths.js',
		'lib/glow/primitives.js',
		'lib/glow/extrude.js',
		'lib/glow/shaders.gen.js',
	].map((f) => `${PUBLIC_PACKAGE_BASE_URL}/${f}`)

	onMount(async () => {
		console.log('=== wmWVPRunner v2.0.2 - Using Pyodide v0.29.4 ===')
		console.log('Public host =', PUBLIC_TRUSTED_HOST)
		mounted = true
		window.addEventListener('message', (e) => {
			//console.log('In window message:', e)
			if (!trustedHosts.includes(e.origin)) {
				//console.warn('Received message from untrusted origin:', e.origin)
				return
			}
			activeParentOrigin = e.origin
			if (!e.data) {
				console.warn('Received empty message')
				return
			}
			if (typeof e.data !== 'string') {
				console.warn('Received message that is not a string:', e.data)
				return
			}
			console.log('In window message:' + JSON.parse(e.data))
			let obj = JSON.parse(e.data)
			if (obj.program) {
				let program_lines = obj.program.split('\n') // comment out version string... keep line numbers the same
				program_lines[0] = '#' + program_lines[0]
				program = program_lines.join('\n')
				const loadLibs = obj.unpackaged
					? (cb: () => void) => addScripts(unpackagedLibs, cb)
					: (cb: () => void) => addScript(`${PUBLIC_PACKAGE_BASE_URL}/package/glow.${obj.version}.min.js`, cb)
				loadLibs(async () => {
					try {
						;({ scene, display } = await setupGSCanvas())
						pyodide = await getPyodide(redirect_stdout, redirect_stderr, pyodideURL)
					} catch (e) {
						redirect_stderr(JSON.stringify(e))
					}

					if (pyodide) {
						//@ts-ignore
						window.scene = scene
						//@ts-ignore
						window.__reportScriptError = (err) => {
							try {
								redirect_stderr('__reportScriptError:' + JSON.stringify(err))
							} catch (err) {
								redirect_stderr('__reportScriptError: Not sure! Cannot stringify')
							}
							debugger
						}
						stdoutStore.set('')

						runMe()
					}
				})
			} else if (obj.screenshot) {
				captureScreenshot()
			}
		})

		console.log('Sending ready message to ' + PUBLIC_TRUSTED_HOST)
		window.parent.postMessage(JSON.stringify({ ready: true }), '*')

		return () => {
			mounted = false
		}
	})

	stdoutStore.subscribe((text: string) => {
		if (stdout) {
			if (text.length > 0 && stdout.hasAttribute('hidden')) {
				stdout.removeAttribute('hidden')
			}
			stdout.value = text
			stdout.scrollTop = stdout.scrollHeight
		}
	})

	async function captureScreenshot() {
		try {
			let stage: any
			if (!display.activated) {
				return
			}
			for (var c = 0; c < display.activated.length; c++) {
				var ca = display.activated[c]
				if (ca !== null) {
					stage = ca
					break
				}
			}
			if (!stage) return

			// Capture the screenshot using the provided method
			const img = await stage.__renderer.screenshot()
			if (!img) {
				console.error('Failed to capture the screenshot from the scene')
				return
			}

			// Define the target size for the screenshot
			const targetSize = 128
			const aspectRatio = img.width / img.height
			const width = aspectRatio >= 1 ? targetSize : targetSize * aspectRatio
			const height = aspectRatio >= 1 ? targetSize / aspectRatio : targetSize

			// Create a new canvas to adjust the screenshot size
			const screenshotCanvas = document.createElement('canvas')
			screenshotCanvas.width = width
			screenshotCanvas.height = height

			const context = screenshotCanvas.getContext('2d')
			if (!context) {
				console.error('Could not get the 2D context from the canvas')
				return
			}

			// Draw the image on the new canvas
			context.drawImage(img, 0, 0, width, height)
			const thumbnail = screenshotCanvas.toDataURL()
			let isAuto = false
			window.parent.postMessage(
				JSON.stringify({ screenshot: thumbnail, autoscreenshot: isAuto }),
				activeParentOrigin
			)
		} catch (error) {
			console.error('Error capturing screenshot:', error)
		}
	}
	async function runMe() {
		try {
			if (!pyodide) {
				console.error('Pyodide not initialized')
				return
			}

			const t0 = performance.now()
			console.log(`[${t0.toFixed(2)}ms] runMe() started`)

			// Create shared buffer for synchronization (4 Int64 values = 32 bytes)
			const sharedBuffer = new SharedArrayBuffer(32)
			const buffer = new BigInt64Array(sharedBuffer)
			buffer[0] = 0n // Signal: waiting

			// Import libraries first on main thread
			let t = performance.now()
			console.log(`[${t.toFixed(2)}ms] Importing libraries on main thread...`)

			await pyodide.runPythonAsync(mathImportCode)
			await pyodide.runPythonAsync(randomImportCode)
			await pyodide.runPythonAsync(vpythonImportCode)

			const tAfterLibs = performance.now()
			console.log(`[${tAfterLibs.toFixed(2)}ms] (+${(tAfterLibs - t).toFixed(2)}ms) Libraries imported`)

			// Check for text constructor
			let foundTextConstructor = program.match(/[^\.\w]text[\ ]*\(/)
			if (foundTextConstructor) {
				try {
					//@ts-ignore
					window.fontloading()
					//@ts-ignore
					await window.waitforfonts()
				} catch (err) {
					console.warn('Font loading warning:', err)
					// Continue anyway - fonts may not be needed
				}
			}

			// Initialize worker
			let tPrev = tAfterLibs
			let t = performance.now()
			console.log(`[${t.toFixed(2)}ms] Initializing worker...`)

			// Clean up previous worker if it exists
			if (currentWorker) {
				currentWorker.terminate()
				currentWorker = null
			}

			let worker
			try {
				worker = await initializeWorker(program, sharedBuffer)
				currentWorker = worker
				// Store references for message handler
				sharedBuffer = buffer as any
				lastFrameTime = performance.now()
			} catch (err) {
				stdoutStore.update((val) => (val += 'Worker init error: ' + err + '\n'))
				return
			}

			t = performance.now()
			console.log(`[${t.toFixed(2)}ms] (+${(t - tPrev).toFixed(2)}ms) Worker initialized`)

			// Set up message handler for worker output
			worker.addEventListener('message', (event) => {
				const msg = event.data
				if (msg.type === 'stdout') {
					redirect_stdout(msg.text)
				} else if (msg.type === 'stderr') {
					redirect_stderr(msg.text)
				} else if (msg.type === 'done') {
					console.log(`[${performance.now().toFixed(2)}ms] Program done`)
				} else if (msg.type === 'error') {
					redirect_stderr('Program error: ' + msg.error)
				} else if (msg.type === 'rate') {
					// Handle rate() call from worker
					const fps = msg.fps
					const frameInterval = 1000 / fps // milliseconds per frame

					// Render current frame
					const now = performance.now()

					// Calculate how long to wait
					let waitMs = frameInterval
					if (lastFrameTime > 0) {
						const elapsed = now - lastFrameTime
						waitMs = Math.max(0, frameInterval - elapsed)
					}

					// Schedule wake-up
					setTimeout(() => {
						sharedBuffer![0] = 1n // Set signal to proceed (BigInt)
						Atomics.notify(sharedBuffer!, 0) // Wake worker
						lastFrameTime = performance.now()
					}, waitMs)
				} else if (msg.type === 'call_gfx') {
					// Handle graphics call from worker
					const funcName = msg.func
					const args = msg.args || []
					const kwargs = msg.kwargs || {}

					console.log(`[Main] Graphics call: ${funcName}`, args, kwargs)

					// This will be implemented in Phase 3 task 2
					// For now, just set signal and notify
					sharedBuffer![1] = 0n  // Invalid object ID (BigInt)
					sharedBuffer![0] = 1n
					Atomics.notify(sharedBuffer!, 0)
				}
			})
		} catch (err) {
			console.error('Error: ' + err)
			stdoutStore.update((val) => (val += 'Error: ' + err + '\n'))
		}
	}
</script>

<div id="glowscript" class="glowscript" />
<div><textarea bind:this={stdout} rows="10" cols="80" hidden /></div>
