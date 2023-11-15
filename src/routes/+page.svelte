<script lang="ts">

	import { stdoutStore } from '$lib/stores/stdoutSrc'
	import { writable } from 'svelte/store'
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

    onMount(async () => {
        try {
		
            scene = await setupGSCanvas()
            pyodide = await getPyodide(redirect_stdout, redirect_stderr, pyodideURL);

            if (pyodide){
                window.scene = scene; // @ts-ignore
                window.__reportScriptError = (err) => {
                    try {
                        redirect_stderr('__reportScriptError:' + JSON.stringify(err));
                    } catch (err) {
                        redirect_stderr('__reportScriptError: Not sure! Cannot stringify');
                    }
                };

                stdoutStore.set('');
                mounted = true;

                const trustedOrigins = [window.location.origin]; // Define trusted origins
			
                window.addEventListener('message', async (event) => {
            // Security check: validate event.origin here if needed
            if (event.data.action === 'captureScreenshot') {
                captureScreenshot();
            }
		});
	};
	
window.addEventListener('message', (e) => {
	let obj = JSON.parse(e.data);
	if (obj.program) {
	let obj = JSON.parse(event.data);
	if (obj.program) {
		let program_lines = obj.program.split('\n');
		program_lines[0] = '#' + program_lines[0]; // Comment out version string
		program = program_lines.join('\n');
		runMe();
	}
}
})



    function captureScreenshot() {
        const canvasElement = document.getElementById('glowscript');
        if (canvasElement instanceof HTMLCanvasElement) {
            const imageDataUrl = canvasElement.toDataURL('image/png');
            screenshotUrl.set(imageDataUrl); // Update the Svelte store with the screenshot data URL
        } else {
            console.error('The element is not a canvas');
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
