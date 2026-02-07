import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'

import { VPythonWebviewProvider } from './webviewProvider'
import * as vscode from 'vscode'

function createMockContext(extensionPath: string): vscode.ExtensionContext {
	return {
		extensionPath,
		subscriptions: []
	} as any
}

describe('VPythonWebviewProvider', () => {
	let tmpDir: string

	beforeEach(() => {
		vi.clearAllMocks()
		tmpDir = path.join(__dirname, '..', '__test_tmp_' + Date.now())
	})

	afterEach(async () => {
		// Clean up temp dirs
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true })
		}
	})

	it('shows error HTML when build dir is missing', () => {
		const context = createMockContext('/nonexistent/path')
		let capturedHtml = ''

		const mockWebview = {
			asWebviewUri: (uri: any) => uri.path,
			cspSource: 'https://webview-csp',
			onDidReceiveMessage: vi.fn()
		}

		const mockPanel = {
			webview: mockWebview,
			reveal: vi.fn(),
			onDidDispose: vi.fn(),
			dispose: vi.fn()
		}

		// Capture the html that gets set
		Object.defineProperty(mockPanel.webview, 'html', {
			set(value: string) {
				capturedHtml = value
			},
			get() {
				return capturedHtml
			}
		})

		vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(mockPanel as any)

		const provider = new VPythonWebviewProvider(context)
		provider.createOrReveal()

		expect(capturedHtml).toContain('Build Not Found')
		expect(capturedHtml).toContain('npm run build:extension')
	})

	it('rewrites asset paths and injects __assetBaseUrl when build dir has index.html', () => {
		// Create a temp build dir with an index.html
		const webviewDir = path.join(tmpDir, 'webview')
		fs.mkdirSync(webviewDir, { recursive: true })
		fs.writeFileSync(
			path.join(webviewDir, 'index.html'),
			'<html><head></head><body><script src="/_app/immutable/entry.js"></script></body></html>'
		)

		const context = createMockContext(tmpDir)
		let capturedHtml = ''

		const mockWebview = {
			asWebviewUri: (uri: any) => `https://webview-uri${uri.path || uri.fsPath}`,
			cspSource: 'https://webview-csp',
			onDidReceiveMessage: vi.fn()
		}

		const mockPanel = {
			webview: mockWebview,
			reveal: vi.fn(),
			onDidDispose: vi.fn(),
			dispose: vi.fn()
		}

		Object.defineProperty(mockPanel.webview, 'html', {
			set(value: string) {
				capturedHtml = value
			},
			get() {
				return capturedHtml
			}
		})

		vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(mockPanel as any)

		const provider = new VPythonWebviewProvider(context)
		provider.createOrReveal()

		expect(capturedHtml).toContain('__assetBaseUrl')
		expect(capturedHtml).toContain('Content-Security-Policy')
		// Asset paths should be rewritten
		expect(capturedHtml).toContain('https://webview-uri')
		expect(capturedHtml).not.toContain('src="/_app/')
	})

	it('sendProgram() queues content and sends on ready message', () => {
		const webviewDir = path.join(tmpDir, 'webview')
		fs.mkdirSync(webviewDir, { recursive: true })
		fs.writeFileSync(
			path.join(webviewDir, 'index.html'),
			'<html><head></head><body></body></html>'
		)

		const context = createMockContext(tmpDir)
		let messageHandler: ((msg: any) => void) | undefined

		const mockPostMessage = vi.fn()
		const mockWebview = {
			asWebviewUri: (uri: any) => `https://webview-uri${uri.path || uri.fsPath}`,
			cspSource: 'https://webview-csp',
			html: '',
			onDidReceiveMessage: vi.fn((handler: any) => {
				messageHandler = handler
			}),
			postMessage: mockPostMessage
		}

		const mockPanel = {
			webview: mockWebview,
			reveal: vi.fn(),
			onDidDispose: vi.fn(),
			dispose: vi.fn()
		}

		vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(mockPanel as any)

		const provider = new VPythonWebviewProvider(context)
		provider.createOrReveal()

		// Send program before webview is ready
		const programContent = 'GlowScript 3.2 VPython\nbox()'
		provider.sendProgram(programContent)

		// Should have posted immediately
		expect(mockPostMessage).toHaveBeenCalledWith({ program: programContent })
		mockPostMessage.mockClear()

		// Simulate webview sending 'ready' message
		expect(messageHandler).toBeDefined()
		messageHandler!({ ready: true })

		// Should send the pending program again on ready
		expect(mockPostMessage).toHaveBeenCalledWith({ program: programContent })
	})
})
