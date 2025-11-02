const mpipCode = `import micropip
await micropip.install('/cyvector-0.1-cp311-cp311-emscripten_3_1_39_wasm32.whl')
`

export const getPyodide = async (stdOutRedir, stdErrRedir, url) => {
	const t0 = performance.now()
	console.log(`=== utils.js v1.0.7 - increased unpack delay ===`)
	console.log(`[${t0.toFixed(2)}ms] Starting getPyodide`)

	const pkgResponse = fetch('vpython.zip').then((x) => x.arrayBuffer())
	let pyodide
	try {
		// eslint-disable-next-line no-undef
		const t1 = performance.now()
		console.log(`[${t1.toFixed(2)}ms] (+${(t1-t0).toFixed(2)}ms) Loading Pyodide`)

		pyodide = await loadPyodide({
			indexURL: url,
			stdout: stdOutRedir ? stdOutRedir : null,
			stderr: stdErrRedir ? stdErrRedir : null
		})

		const t2 = performance.now()
		console.log(`[${t2.toFixed(2)}ms] (+${(t2-t1).toFixed(2)}ms) Pyodide loaded`)
		//await pyodide.loadPackage('micropip'); // revert this for now
		//await pyodide.runPythonAsync(mpipCode);
	} catch (e) {
		console.log(e)
		throw e
	}

	if (pyodide) {
		const t3 = performance.now()
		const pkgdata = await pkgResponse
		const t4 = performance.now()
		console.log(`[${t4.toFixed(2)}ms] (+${(t4-t3).toFixed(2)}ms) vpython.zip fetched`)

		console.log(`[${t4.toFixed(2)}ms] Unpacking package`)
		pyodide.unpackArchive(pkgdata, 'zip')
		const t5 = performance.now()
		console.log(`[${t5.toFixed(2)}ms] (+${(t5-t4).toFixed(2)}ms) Package unpacked`)

		// Add a delay to prevent Chrome stack overflow during module import
		// This gives Chrome's V8 engine time to settle after unpacking
		console.log(`[${t5.toFixed(2)}ms] Waiting 500ms before returning...`)
		await new Promise(resolve => setTimeout(resolve, 500))
		const t6 = performance.now()
		console.log(`[${t6.toFixed(2)}ms] (+${(t6-t5).toFixed(2)}ms) Delay complete`)
	}

	const tEnd = performance.now()
	console.log(`[${tEnd.toFixed(2)}ms] (+${(tEnd-t0).toFixed(2)}ms total) getPyodide complete`)
	return pyodide
}

export const setupGSCanvas = async () => {
	let display, scene, gs_cont
	gs_cont = document.getElementById('glowscript')
	if (gs_cont) {
		delete gs_cont.id
	}

	window.__context = {
		glowscript_container: gs_cont
	}
	display = window.canvas
	scene = display()
	return { scene, display }
}
