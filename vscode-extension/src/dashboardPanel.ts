import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

let panel: vscode.WebviewPanel | undefined

export function showDashboard(context: vscode.ExtensionContext, apiUrl: string): void {
  const distDir = vscode.Uri.file(path.join(context.extensionPath, 'media', 'dist'))

  if (panel) {
    panel.webview.html = buildHtml(panel.webview, distDir, apiUrl)
    panel.reveal()
    return
  }

  panel = vscode.window.createWebviewPanel(
    'signalDash',
    'Signal Dash',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distDir],
    },
  )
  panel.onDidDispose(() => (panel = undefined), null, context.subscriptions)
  panel.webview.html = buildHtml(panel.webview, distDir, apiUrl)
}

function buildHtml(webview: vscode.Webview, distDir: vscode.Uri, apiUrl: string): string {
  const indexPath = path.join(distDir.fsPath, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return `<html><body><h2>Signal Dash: frontend build missing</h2>
      <p>Run <code>npm run build</code> inside <code>vscode-extension/</code>
      to build the React app and copy it into the extension.</p></body></html>`
  }

  const baseUri = webview.asWebviewUri(distDir).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const csp = [
    "default-src 'none'",
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    // Recharts sets inline styles; index.html pulls Google Fonts stylesheets.
    `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `img-src ${webview.cspSource} data:`,
    `connect-src ${apiUrl} ${apiUrl.replace('localhost', '127.0.0.1')}`,
  ].join('; ')

  let html = fs.readFileSync(indexPath, 'utf8')
  // Vite emits absolute /assets/... URLs; point them at the webview resource root.
  html = html.replace(/(src|href)="\/(assets\/[^"]+)"/g, `$1="${baseUri}/$2"`)
  html = html.replace(
    '<head>',
    `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n` +
    `  <script nonce="${nonce}">window.__SIGNAL_DASH_API__ = ${JSON.stringify(apiUrl)}</script>`,
  )
  return html
}
