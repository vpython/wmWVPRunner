import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isVSCodeWebview, createMessaging } from './messaging'

describe('isVSCodeWebview', () => {
	it('returns false by default', () => {
		expect(isVSCodeWebview()).toBe(false)
	})

	it('returns true when acquireVsCodeApi exists on globalThis', () => {
		// @ts-ignore
		globalThis.acquireVsCodeApi = () => ({})
		expect(isVSCodeWebview()).toBe(true)
		// @ts-ignore
		delete globalThis.acquireVsCodeApi
	})
})

describe('iframe adapter', () => {
	const trustedHost = 'https://example.com'

	beforeEach(() => {
		// Ensure no acquireVsCodeApi so we get iframe adapter
		// @ts-ignore
		delete globalThis.acquireVsCodeApi
	})

	it('send() calls window.parent.postMessage with JSON string and trusted host', () => {
		const postMessageSpy = vi.spyOn(window.parent, 'postMessage')
		const messaging = createMessaging(trustedHost)
		messaging.send({ ready: true })
		expect(postMessageSpy).toHaveBeenCalledWith(
			JSON.stringify({ ready: true }),
			trustedHost
		)
		postMessageSpy.mockRestore()
	})

	it('onMessage() ignores wrong-origin messages', () => {
		const messaging = createMessaging(trustedHost)
		const callback = vi.fn()
		messaging.onMessage(callback)

		window.dispatchEvent(
			new MessageEvent('message', {
				origin: 'https://evil.com',
				data: JSON.stringify({ program: 'test' })
			})
		)

		expect(callback).not.toHaveBeenCalled()
	})

	it('onMessage() ignores empty messages', () => {
		const messaging = createMessaging(trustedHost)
		const callback = vi.fn()
		messaging.onMessage(callback)

		window.dispatchEvent(
			new MessageEvent('message', {
				origin: trustedHost,
				data: null
			})
		)

		expect(callback).not.toHaveBeenCalled()
	})

	it('onMessage() ignores non-string messages', () => {
		const messaging = createMessaging(trustedHost)
		const callback = vi.fn()
		messaging.onMessage(callback)

		window.dispatchEvent(
			new MessageEvent('message', {
				origin: trustedHost,
				data: { program: 'test' }
			})
		)

		expect(callback).not.toHaveBeenCalled()
	})

	it('onMessage() invokes callback for valid messages', () => {
		const messaging = createMessaging(trustedHost)
		const callback = vi.fn()
		messaging.onMessage(callback)

		window.dispatchEvent(
			new MessageEvent('message', {
				origin: trustedHost,
				data: JSON.stringify({ program: 'print("hello")' })
			})
		)

		expect(callback).toHaveBeenCalledWith({ program: 'print("hello")' })
	})
})

describe('vscode adapter', () => {
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		mockPostMessage.mockClear()
		// @ts-ignore
		globalThis.acquireVsCodeApi = () => ({
			postMessage: mockPostMessage
		})
	})

	afterEach(() => {
		// @ts-ignore
		delete globalThis.acquireVsCodeApi
	})

	it('send() calls vscode.postMessage with raw object', () => {
		const messaging = createMessaging('unused')
		messaging.send({ ready: true })
		expect(mockPostMessage).toHaveBeenCalledWith({ ready: true })
	})

	it('onMessage() handles object data', () => {
		const messaging = createMessaging('unused')
		const callback = vi.fn()
		messaging.onMessage(callback)

		window.dispatchEvent(
			new MessageEvent('message', {
				data: { program: 'test' }
			})
		)

		expect(callback).toHaveBeenCalledWith({ program: 'test' })
	})

	it('onMessage() handles JSON-string data', () => {
		const messaging = createMessaging('unused')
		const callback = vi.fn()
		messaging.onMessage(callback)

		window.dispatchEvent(
			new MessageEvent('message', {
				data: JSON.stringify({ program: 'test' })
			})
		)

		expect(callback).toHaveBeenCalledWith({ program: 'test' })
	})
})
