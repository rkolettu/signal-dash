import * as vscode from 'vscode'
import { BackendManager } from './backendManager'
import { showDashboard } from './dashboardPanel'

let backend: BackendManager | undefined

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Signal Dash')
  backend = new BackendManager(context.extensionPath, output)
  context.subscriptions.push(output, backend)

  context.subscriptions.push(
    vscode.commands.registerCommand('signal-dash.openDashboard', async () => {
      try {
        const { url } = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Signal Dash: starting backend…' },
          () => backend!.ensure(),
        )
        showDashboard(context, url)
      } catch (e) {
        vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e))
      }
    }),
  )
}

export function deactivate(): void {
  backend?.dispose()
}
