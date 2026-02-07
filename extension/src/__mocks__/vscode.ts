import { vi } from 'vitest'

export const window = {
	createWebviewPanel: vi.fn()
}

export const ViewColumn = {
	Beside: 2
}

export const Uri = {
	file: (p: string) => ({ fsPath: p, path: p })
}
