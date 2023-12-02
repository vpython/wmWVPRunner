const mpipCode = `import micropip
await micropip.install('/cyvector-0.1-cp311-cp311-emscripten_3_1_39_wasm32.whl')
`

export const getPyodide = async (stdOutRedir, stdErrRedir, url) => {
	const pkgResponse = fetch('vpython.zip').then((x) => x.arrayBuffer())
	let pyodide
	try {
		// eslint-disable-next-line no-undef
		pyodide = await loadPyodide({
			indexURL: url,
			stdout: stdOutRedir ? stdOutRedir : null,
			stderr: stdErrRedir ? stdErrRedir : null
		})
		//await pyodide.loadPackage('micropip'); // revert this for now
		//await pyodide.runPythonAsync(mpipCode);
	} catch (e) {
		console.log(e)
		throw e
	}

	if (pyodide) {
		const pkgdata = await pkgResponse
		console.log('Unpacking package')
		pyodide.unpackArchive(pkgdata, 'zip')
		console.log('Importing vpython package')
	}

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
