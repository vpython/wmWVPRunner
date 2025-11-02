<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { onMount } from 'svelte'
	import { setupGSCanvas, getPyodide } from '$lib/utils/utils'
	import { PUBLIC_TRUSTED_HOST } from '$env/static/public'
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
	let pyodideURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/' //'https://cdn.jsdelivr.net/pyodide/v0.21.0a3/full/',

	// Split imports into individual statements to reduce stack depth in Chrome
	let mathImportCode = `from math import *`
	let numpyImportCode = `from numpy import arange`
	let randomImportCode = `from random import random`

	// Pre-import vpython submodules individually to break up the import chain
	// Import in reverse dependency order (deepest dependencies first)
	let vpythonPreImports = [
		`import colorsys`,  // Standard library used by color
		`import vpython.vector`,  // Base vector class
		`import vpython.vec_js`,  // Depends on vector and js.vec
		`import vpython.color`,  // Depends on vec_js
		`import vpython.shapespaths_orig`,  // Depends on vec_js and vector
		`import vpython.core_funcs`  // Depends on vec_js and shapes
	]

	// Final imports
	let vpythonImportCode = `import vpython`
	let vpythonStarImportCode = `from vpython import *`

	function addScript(src: string, callback: () => void) {
		var s = document.createElement('script')
		s.setAttribute('src', src)
		s.onload = callback
		document.body.appendChild(s)
	}

	onMount(async () => {
		console.log('=== wmWVPRunner v1.1.0 - restored working version ===')
		console.log('Works in: Firefox, Safari, Chrome with DevTools open')
		console.log('Known issue: Chrome with DevTools closed (Pyodide bug)')
		console.log('Public host =', PUBLIC_TRUSTED_HOST)
		mounted = true
		window.addEventListener('message', (e) => {
			//console.log('In window message:', e)
			if (e.origin !== PUBLIC_TRUSTED_HOST.slice(0, e.origin.length)) {
				//console.warn('Received message from untrusted origin:', e.origin)
				return
			}
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
				addScript(`https://www.glowscript.org/package/glow.${obj.version}.min.js`, async () => {
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
		window.parent.postMessage(JSON.stringify({ ready: true }), PUBLIC_TRUSTED_HOST)

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

	const substitutions: (RegExp | string)[][] = [
		[/[^\.\w\n]rate[\ ]*\(/g, ' await rate('],
		[/\nrate[\ ]*\(/g, '\nawait rate('],
		[/scene\.waitfor[\ ]*\(/g, 'await scene.waitfor('],
		[/[^\.\w\n]get_library[\ ]*\(/g, ' await get_library('],
		[/\nget_library[\ ]*\(/g, '\nawait get_library(']
	]
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
				PUBLIC_TRUSTED_HOST
			)
		} catch (error) {
			console.error('Error capturing screenshot:', error)
		}
	}
	async function runMe() {
		try {
			if (pyodide) {
				const t0 = performance.now()
				console.log(`[${t0.toFixed(2)}ms] runMe() started`)

				let asyncProgram = program
				for (let i = 0; i < substitutions.length; i++) {
					asyncProgram = asyncProgram.replace(substitutions[i][0], <string>substitutions[i][1])
				}

				// Import modules ONE AT A TIME to avoid Chrome V8 stack overflow
				let t = performance.now()

				console.log(`[${t.toFixed(2)}ms] Importing math...`)
				await pyodide.runPythonAsync(mathImportCode)
				let tPrev = t
				t = performance.now()
				console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) math imported`)

				// Add delay before numpy to prevent Chrome V8 stack overflow
				console.log(`[${t.toFixed(2)}ms] Waiting 200ms before numpy...`)
				await new Promise(resolve => setTimeout(resolve, 200))
				tPrev = t
				t = performance.now()
				console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) Delay complete`)

				console.log(`[${t.toFixed(2)}ms] SKIPPING numpy pre-import - will load on-demand`)
				// Skip numpy import here - it will be imported by user program if needed
				// This avoids the Chrome V8 stack overflow during initial setup

				console.log(`[${t.toFixed(2)}ms] Importing random...`)
				await pyodide.runPythonAsync(randomImportCode)
				tPrev = t
				t = performance.now()
				console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) random imported`)

				// Import vpython - NOTE: This works in Firefox/Safari and Chrome with DevTools open
				// Known issue: Crashes in Chrome with DevTools closed due to Pyodide+Chrome V8 bug
				console.log(`[${t.toFixed(2)}ms] Importing vpython...`)
				try {
					await pyodide.runPythonAsync(vpythonStarImportCode)
					tPrev = t
					t = performance.now()
					console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) vpython imported successfully`)
				} catch (e) {
					tPrev = t
					t = performance.now()
					console.log(`[${t.toFixed(2)}ms] ERROR: vpython import failed:`, e.message)
					console.log(`[${t.toFixed(2)}ms] If using Chrome, try opening DevTools (F12) or use Firefox/Safari`)
					throw e
				}

				var result = null

				let foundTextConstructor = asyncProgram.match(/[^\.\w]text[\ ]*\(/)
				if (foundTextConstructor) {
					//@ts-ignore
					window.fontloading()
					//@ts-ignore
					await window.waitforfonts()
				}
				await pyodide.loadPackagesFromImports(asyncProgram)
				var result = await pyodide.runPythonAsync(asyncProgram)
				if (result) {
					stdoutStore.update((value: string) => (value += result))
				}
			}
		} catch (err) {
			console.log('Error:' + err)
			stdoutStore.update((value: string) => (value += 'Error:' + err + '\n'))
		}
	}
</script>

<div id="glowscript" class="glowscript" />
<div><textarea bind:this={stdout} rows="10" cols="80" hidden /></div>
