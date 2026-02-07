<script lang="ts">
	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { onMount } from 'svelte'
	import { setupGSCanvas, getPyodide } from '$lib/utils/utils'
	import { createMessaging, isVSCodeWebview } from '$lib/utils/messaging'
	import { parseGlowScriptVersion } from '$lib/utils/parseVersion'
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
	let pyodideURL = 'https://cdn.jsdelivr.net/pyodide/v0.23.3/full/'

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

	let messaging: ReturnType<typeof createMessaging>

	onMount(async () => {
		console.log('=== wmWVPRunner v2.1.0 - Using Pyodide v0.23.3 ===')
		console.log('Mode:', isVSCodeWebview() ? 'VSCode webview' : 'iframe')
		mounted = true
		messaging = createMessaging(PUBLIC_TRUSTED_HOST)

		messaging.onMessage((obj) => {
			if (obj.program) {
				let program_lines = obj.program.split('\n')
				// Parse version from first line (e.g. "GlowScript 3.2 VPython")
				let version = obj.version
				if (!version) {
					version = parseGlowScriptVersion(program_lines[0])
				}
				// Comment out version string... keep line numbers the same
				program_lines[0] = '#' + program_lines[0]
				program = program_lines.join('\n')

				addScript(`https://www.glowscript.org/package/glow.${version}.min.js`, async () => {
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

		console.log('Sending ready message')
		messaging.send({ ready: true })

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
			messaging.send({ screenshot: thumbnail, autoscreenshot: isAuto })
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

				// Import standard libraries and vpython
				let t = performance.now()

				console.log(`[${t.toFixed(2)}ms] Importing math...`)
				await pyodide.runPythonAsync(mathImportCode)
				let tPrev = t
				t = performance.now()
				console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) math imported`)

				console.log(`[${t.toFixed(2)}ms] Importing random...`)
				await pyodide.runPythonAsync(randomImportCode)
				tPrev = t
				t = performance.now()
				console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) random imported`)

				console.log(`[${t.toFixed(2)}ms] Importing vpython...`)
				await pyodide.runPythonAsync(vpythonImportCode)
				tPrev = t
				t = performance.now()
				console.log(`[${t.toFixed(2)}ms] (+${(t-tPrev).toFixed(2)}ms) vpython imported`)

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
