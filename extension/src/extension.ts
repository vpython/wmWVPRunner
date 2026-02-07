import * as vscode from 'vscode'
import { VPythonWebviewProvider } from './webviewProvider'

let webviewProvider: VPythonWebviewProvider | undefined

export function activate(context: vscode.ExtensionContext) {
	console.log('wmVPRunner extension activated')

	webviewProvider = new VPythonWebviewProvider(context)

	const runCommand = vscode.commands.registerCommand('wmvprunner.runVPython', () => {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			vscode.window.showWarningMessage('No active editor. Open a .py file first.')
			return
		}

		const fileContent = editor.document.getText()
		if (!fileContent.trim()) {
			vscode.window.showWarningMessage('The active file is empty.')
			return
		}

		webviewProvider!.createOrReveal()
		webviewProvider!.sendProgram(fileContent)
	})

	context.subscriptions.push(runCommand)
}

export function deactivate() {
	webviewProvider = undefined
}
