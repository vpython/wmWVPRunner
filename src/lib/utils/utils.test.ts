import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPyodide = {
	version: '0.23.3',
	unpackArchive: vi.fn()
}

// Mock loadPyodide globally
// @ts-ignore
globalThis.loadPyodide = vi.fn().mockResolvedValue(mockPyodide)

// Mock fetch
const mockArrayBuffer = new ArrayBuffer(8)
globalThis.fetch = vi.fn().mockResolvedValue({
	arrayBuffer: () => Promise.resolve(mockArrayBuffer)
}) as any

describe('getPyodide', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// @ts-ignore
		delete window.__assetBaseUrl
	})

	it('fetches vpython.zip with relative path when __assetBaseUrl is unset', async () => {
		const { getPyodide } = await import('./utils.js')
		await getPyodide(null, null, 'https://cdn.jsdelivr.net/pyodide/v0.23.3/full/')

		expect(fetch).toHaveBeenCalledWith('vpython.zip')
	})

	it('fetches vpython.zip with base URL when __assetBaseUrl is set', async () => {
		// @ts-ignore
		window.__assetBaseUrl = 'https://webview-assets/ext123'

		// Need to re-import to pick up the changed window value at call time
		// The fetch happens inside getPyodide, reading window.__assetBaseUrl each call
		const { getPyodide } = await import('./utils.js')
		await getPyodide(null, null, 'https://cdn.jsdelivr.net/pyodide/v0.23.3/full/')

		expect(fetch).toHaveBeenCalledWith('https://webview-assets/ext123/vpython.zip')
	})
})
