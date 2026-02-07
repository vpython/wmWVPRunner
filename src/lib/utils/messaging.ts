type MessageCallback = (data: { program?: string; version?: string; screenshot?: boolean }) => void

interface MessagingAdapter {
	send: (msg: any) => void
	onMessage: (callback: MessageCallback) => void
}

function createVSCodeAdapter(): MessagingAdapter {
	// @ts-ignore - acquireVsCodeApi is injected by VSCode webview
	const vscode = acquireVsCodeApi()

	return {
		send(msg: any) {
			vscode.postMessage(msg)
		},
		onMessage(callback: MessageCallback) {
			window.addEventListener('message', (e) => {
				const data = e.data
				if (!data) return
				// VSCode sends data directly as objects, not JSON strings
				if (typeof data === 'object') {
					callback(data)
				} else if (typeof data === 'string') {
					try {
						callback(JSON.parse(data))
					} catch {
						console.warn('Failed to parse message:', data)
					}
				}
			})
		}
	}
}

function createIframeAdapter(trustedHost: string): MessagingAdapter {
	return {
		send(msg: any) {
			window.parent.postMessage(JSON.stringify(msg), trustedHost)
		},
		onMessage(callback: MessageCallback) {
			window.addEventListener('message', (e) => {
				if (e.origin !== trustedHost.slice(0, e.origin.length)) {
					return
				}
				if (!e.data) {
					console.warn('Received empty message')
					return
				}
				if (typeof e.data !== 'string') {
					console.warn('Received message that is not a string:', e.data)
					return
				}
				console.log('In window message:' + JSON.parse(e.data))
				try {
					callback(JSON.parse(e.data))
				} catch {
					console.warn('Failed to parse message:', e.data)
				}
			})
		}
	}
}

export function isVSCodeWebview(): boolean {
	try {
		// @ts-ignore
		return typeof acquireVsCodeApi === 'function'
	} catch {
		return false
	}
}

export function createMessaging(trustedHost: string): MessagingAdapter {
	if (isVSCodeWebview()) {
		console.log('Messaging: VSCode webview mode')
		return createVSCodeAdapter()
	}
	console.log('Messaging: iframe mode, trusted host:', trustedHost)
	return createIframeAdapter(trustedHost)
}
