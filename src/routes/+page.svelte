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
	let pyodideURL = 'https://cdn.jsdelivr.net/pyodide/v0.23.3/full/' //'https://cdn.jsdelivr.net/pyodide/v0.21.0a3/full/',

	let defaultImportCode = `from math import *
from numpy import arange
from random import random
from vpython import *
`

	onMount(async () => {
		console.log('Public host =', PUBLIC_TRUSTED_HOST)
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
			mounted = true
			window.addEventListener('message', (e) => {
				console.log('In window message:' + JSON.parse(e.data))
				let obj = JSON.parse(e.data)
				if (obj.program) {
					let program_lines = obj.program.split('\n') // comment out version string... keep line numbers the same
					program_lines[0] = '#' + program_lines[0]
					program = program_lines.join('\n')
					runMe()
				} else if (obj.screenshot) {
					captureScreenshot()
				}
			})

			console.log('Sending ready message to ' + PUBLIC_TRUSTED_HOST)
			window.parent.postMessage(JSON.stringify({ ready: true }), PUBLIC_TRUSTED_HOST)
			console.log('Sending ready message to ' + PUBLIC_TRUSTED_HOST)
			window.parent.postMessage(JSON.stringify({ ready: true }), PUBLIC_TRUSTED_HOST)

			return () => {
				mounted = false
			}
		} else {
			redirect_stderr('Pyodide not found')
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
			window.parent.postMessage({ screenshot: thumbnail, autoscreenshot: isAuto })
		} catch (error) {
			console.error('Error capturing screenshot:', error)
		}
	}
	async function runMe() {
		try {
			if (pyodide) {
				let asyncProgram = program
				for (let i = 0; i < substitutions.length; i++) {
					asyncProgram = asyncProgram.replace(substitutions[i][0], <string>substitutions[i][1])
				}

				await pyodide.loadPackagesFromImports(defaultImportCode)
				var result = await pyodide.runPythonAsync(defaultImportCode)

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
