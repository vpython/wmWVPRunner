import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

export class VPythonWebviewProvider {
	private panel: vscode.WebviewPanel | undefined
	private context: vscode.ExtensionContext
	private pendingProgram: string | undefined

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	createOrReveal() {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside)
			return
		}

		const buildDir = path.join(this.context.extensionPath, 'webview')

		this.panel = vscode.window.createWebviewPanel(
			'wmvprunner',
			'VPython Runner',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.file(buildDir)]
			}
		)

		this.panel.webview.html = this.getWebviewHtml(this.panel.webview, buildDir)

		this.panel.webview.onDidReceiveMessage(
			(message) => {
				if (message.ready) {
					console.log('Webview ready')
					if (this.pendingProgram) {
						this.doSendProgram(this.pendingProgram)
						this.pendingProgram = undefined
					}
				} else if (message.screenshot) {
					console.log('Received screenshot from webview')
				}
			},
			undefined,
			this.context.subscriptions
		)

		this.panel.onDidDispose(
			() => {
				this.panel = undefined
			},
			undefined,
			this.context.subscriptions
		)
	}

	sendProgram(content: string) {
		if (this.panel) {
			// Queue program if webview isn't ready yet; it will be sent on 'ready'
			this.pendingProgram = content
			this.doSendProgram(content)
		}
	}

	private doSendProgram(content: string) {
		this.panel?.webview.postMessage({ program: content })
	}

	private getWebviewHtml(webview: vscode.Webview, buildDir: string): string {
		// Find the built index.html and rewrite asset paths to webview URIs
		const indexPath = path.join(buildDir, 'index.html')
		if (!fs.existsSync(indexPath)) {
			return `<html><body>
				<h2>VPython Runner - Build Not Found</h2>
				<p>Run <code>npm run build:extension</code> from the project root first.</p>
				<p>Expected build output at: <code>${buildDir}</code></p>
			</body></html>`
		}

		let html = fs.readFileSync(indexPath, 'utf-8')

		const baseUri = webview.asWebviewUri(vscode.Uri.file(buildDir))

		// Inject asset base URL and CSP before closing </head>
		const nonce = getNonce()
		const injectedScript = `<script nonce="${nonce}">window.__assetBaseUrl = "${baseUri}";</script>`

		// Set Content Security Policy
		const csp = [
			`default-src 'none'`,
			`script-src 'nonce-${nonce}' ${webview.cspSource} https://cdn.jsdelivr.net https://www.glowscript.org 'unsafe-eval'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`img-src ${webview.cspSource} data: https:`,
			`font-src ${webview.cspSource} https:`,
			`connect-src ${webview.cspSource} https://cdn.jsdelivr.net https://www.glowscript.org`,
			`worker-src blob:`
		].join('; ')
		const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`

		html = html.replace('</head>', `${cspMeta}\n${injectedScript}\n</head>`)

		// Rewrite relative asset paths to use webview URIs
		// Handle paths like "/_app/..." or "./_app/..."
		html = html.replace(/(href|src)="\.?\/?(_app\/[^"]+)"/g, `$1="${baseUri}/$2"`)

		// Handle vpython.zip path
		html = html.replace(
			/(["'])vpython\.zip\1/g,
			`$1${baseUri}/vpython.zip$1`
		)

		return html
	}
}

function getNonce(): string {
	let text = ''
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}
