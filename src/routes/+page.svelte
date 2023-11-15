<script lang="ts">

	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { get, writable } from 'svelte/store'
	import { setupGSCanvas, getPyodide } from '$lib/utils/utils'
	import { onMount } from 'svelte'

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
    ];

    function redirect_stdout(theText: string) {
        if (mounted) {
            stdoutStore.update((val: string) => (val += theText + '\n'));
        }
    }

    function redirect_stderr(theText: string) {
        if (mounted) {
            stdoutStore.update((val: string) => (val += 'stderr:' + theText + '\n'));
        }
    }

    onMount(() => {
        const trustedOrigins = [window.location.origin]; // Define trusted origins

        window.addEventListener('message', (event) => {
            if (!trustedOrigins.includes(event.origin)) {
                console.error('Received message from untrusted origin:', event.origin);
                return;
            }

            const messageData = JSON.parse(event.data);

            if (messageData.action === 'captureScreenshot') {
                captureScreenshot();
            }

            const messageData = JSON.parse(event.data);

            if (messageData.action === 'captureScreenshot') {
                captureScreenshot();
            } else if (messageData.program) {
                program = commentOutVersionString(messageData.program);
                runMe();
            }
        });
    });



	function captureScreenshot() {
    const canvasElement = document.getElementById('glowscript');
    if (canvasElement instanceof HTMLCanvasElement) {
        const imageDataUrl = canvasElement.toDataURL('image/png');

        // Example: POST request to save the screenshot
        fetch('/api/save-screenshot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ screenshot: imageDataUrl }),
        });
    } else {
        console.error('Canvas element not found');
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
