<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { writable } from 'svelte/store'
	import { setupGSCanvas, getPyodide } from '$lib/utils/utils'
	import { onMount } from 'svelte'
	import { send } from 'vite'

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
		[/scene\.waitfor[\ ]*\(/g, 'await scene.waitfor('],
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

	onMount(async () => {
		try {
			scene = await setupGSCanvas()
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
				}
			})

			function send(msg: string) {
				msg = JSON.stringify(msg)
				window.parent.postMessage(msg)
				window.parent.postMessage(JSON.stringify({ ready: true }), env.PUBLIC_TRUSTED_HOST)
			}

			return () => {
				mounted = false
			}
		} else {
			redirect_stderr('Pyodide not found')
		}
	})
	async function captureScreenshot(
		isAuto: boolean,
		scene: { __renderer: { screenshot: () => Promise<HTMLCanvasElement> } }
	) {
		const canvasElement = document.getElementById('glowscript')
		if (canvasElement instanceof HTMLCanvasElement) {
			var img = await scene.__renderer.screenshot()
			var targetSize = 128
			var aspect = img.width / img.height
			var w = aspect >= 1 ? targetSize : targetSize * aspect
			var h = aspect >= 1 ? targetSize / aspect : targetSize
			var cvs = document.createElement('canvas')
			cvs.width = w
			cvs.height = h
			var cx = cvs.getContext('2d')
			if (cx !== null) {
				cx.drawImage(img, 0, 0, w, h)
				var thumbnail = cvs.toDataURL()
				send({ captureScreenshot: thumbnail, autoscreenshot: isAuto })
			} else {
				console.error('Could not get the 2D context from the canvas')
			}
		} else {
			console.error('The element with id "glowscript" is not a canvas')
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
