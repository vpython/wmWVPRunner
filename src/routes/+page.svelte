<script lang="ts">
	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { get, writable } from 'svelte/store'
	import { setupGSCanvas, getPyodide } from '$lib/utils/utils'
	import { onMount } from 'svelte'
	import { env } from '$env/dynamic/public'

	let pyodide: any = null
	let program: string
	let stdout: HTMLTextAreaElement
	let scene: any
	let mounted: boolean = false
	let pyodideURL = 'https://cdn.jsdelivr.net/pyodide/v0.23.3/full/'
	const screenshotUrl = writable('') //'https://cdn.jsdelivr.net/pyodide/v0.21.0a3/full/',

	let defaultImportCode = `from math import *
from numpy import arange
from random import random
from vpython import *
`
	const substitutions: (RegExp | string)[][] = [
		[/[^\.\w\n]rate[\ ]*\(/g, ' await rate('],
		[/\nrate[\ ]*\(/g, '\nawait rate('],
		[/\nscene\.waitfor[\ ]*\(/g, 'await scene.waitfor('],
		[/[^\.\w\n]get_library[\ ]*\(/g, ' await get_library('],
		[/\nget_library[\ ]*\(/g, '\nawait get_library(']
	]

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

	onMount(() => {
		const trustedOrigins = [window.location.origin] // Define trusted origins

		window.addEventListener('message', (event) => {
			let obj = JSON.parse(event.data)
			if (obj.program) {
				let program_lines = obj.program.split('\n') // comment out version string... keep line numbers the same
				program_lines[0] = '#' + program_lines[0]
				program = program_lines.join('\n')
				runMe()
			} else if (!trustedOrigins.includes(event.origin)) {
				console.error('Received message from untrusted origin:', event.origin)
				return
			}

			const messageData = JSON.parse(event.data)
			if (messageData.action === 'captureScreenshot') {
                console.log('Sending ready message to ' + env.PUBLIC_TRUSTED_HOST)
			window.parent.postMessage(JSON.stringify({ ready: true }), env.PUBLIC_TRUSTED_HOST)
				captureScreenshot(scene)
				runMe()
			}
		})
	})
	async function captureScreenshot(scene: {
		__renderer: { screenshot: () => Promise<HTMLCanvasElement> }
	}) {
		try {
			// Ensure the canvas element is correctly identified
			const canvasElement = document.getElementById('glowscript')
			if (!(canvasElement instanceof HTMLCanvasElement)) {
				console.error('The element with id "glowscript" is not a canvas')
				return
			}

			// Capture the screenshot using the provided method
			const img = await scene.__renderer.screenshot()
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
			send({ screenshot: thumbnail, autoscreenshot: isAuto })
			// Store the captured screenshot in local storage
			localStorage.setItem('captureScreenshot', JSON.stringify({ thumbnail, isAuto: false }))
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
