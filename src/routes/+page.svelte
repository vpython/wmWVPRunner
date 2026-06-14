<script lang="ts">
	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { onMount } from 'svelte'
	import { setupGSCanvas, getPyodide } from '$lib/utils/utils'
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
			if (!trustedHosts.includes(e.origin)) {
				return
			}
			activeParentOrigin = e.origin
			if (!e.data) {
				console.warn('Received empty message')
				return
			}
			if (typeof e.data !== 'string') {
				console.warn('Received message that is not a string:', typeof e.data)
				return
			}
			let obj = JSON.parse(e.data)
			if (obj.program) {
				let program_lines = obj.program.split('\n') // comment out version string... keep line numbers the same
				program_lines[0] = '#' + program_lines[0]
				program = program_lines.join('\n')
				const loadBase = obj.unpackaged
					? (cb: () => void) => addScripts(unpackagedLibs, cb)
					: (cb: () => void) => addScript(`${PUBLIC_PACKAGE_BASE_URL}/package/glow.${obj.version}.min.js`, cb)
				// Load MathJax (v2.7.0, Hub API) only when the program uses it,
				// mirroring classic GlowScript's runner. It MUST load before the
				// glow library, which configures MathJax (delimiters,
				// skipStartupTypeset) when it sees the global defined. vpython
				// exposes the MathJax global to Python once it's loaded here.
				const needsMathJax = obj.program.indexOf('MathJax') >= 0
				const loadLibs = (cb: () => void) => {
					if (needsMathJax) {
						addScript('https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.0/MathJax.js?config=TeX-MML-AM_CHTML', () => loadBase(cb))
					} else {
						loadBase(cb)
					}
				}
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

		// Tell the parent we're listening; it will send the program code.
		// The parent frame is cross-origin, so its location must NOT be read
		// here (that throws a SecurityError). Post with targetOrigin '*'; the
		// parent validates the message origin on its side.
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

			// Import standard libraries and vpython on the main thread, where
			// GlowScript (WebGL/DOM) lives.
			let t = performance.now()
			await pyodide.runPythonAsync(mathImportCode)
			await pyodide.runPythonAsync(randomImportCode)
			await pyodide.runPythonAsync(vpythonImportCode)
			const tAfterLibs = performance.now()
			console.log(`[${tAfterLibs.toFixed(2)}ms] (+${(tAfterLibs - t).toFixed(2)}ms) Libraries imported`)

			// Fix Issue #1: rewrite the program so rate()/get_library()/
			// scene.waitfor() work inside user-defined functions. The AST
			// transformer promotes the necessary functions to `async def` and
			// inserts `await`, preserving line numbers for error reporting.
			pyodide.globals.set('__user_source__', program)
			const asyncProgram: string = pyodide.runPython(
				'from vpython._async_transform import transform_source\n' +
				'transform_source(__user_source__)'
			)

			// Preload fonts if the program creates text() objects.
			let foundTextConstructor = asyncProgram.match(/[^\.\w]text[\ ]*\(/)
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

			await pyodide.loadPackagesFromImports(asyncProgram)
			const result = await pyodide.runPythonAsync(asyncProgram)
			if (result) {
				stdoutStore.update((value: string) => (value += result))
			}
			console.log(`[${performance.now().toFixed(2)}ms] Program done`)
		} catch (err) {
			console.error('Error: ' + err)
			stdoutStore.update((val) => (val += 'Error: ' + err + '\n'))
		}
	}
</script>

<div id="glowscript" class="glowscript" />
<div><textarea bind:this={stdout} rows="10" cols="80" hidden /></div>
