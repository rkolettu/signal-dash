import * as vscode from 'vscode'
import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface Backend {
  url: string
  /** true if this extension spawned the process (vs reusing an external one) */
  spawned: boolean
}

export class BackendManager implements vscode.Disposable {
  private child: cp.ChildProcess | undefined
  private expectingExit = false

  constructor(
    private readonly extensionPath: string,
    private readonly output: vscode.OutputChannel,
  ) {}

  private get config() {
    const c = vscode.workspace.getConfiguration('signalDash')
    return {
      python: c.get<string>('pythonPath', 'python3'),
      port: c.get<number>('port', 8000),
      backendPath: c.get<string>('backendPath', ''),
    }
  }

  /** Prefer <backend>/.venv over the configured interpreter unless the user
   *  set pythonPath explicitly (i.e. it differs from the default). */
  private resolvePython(backendDir: string): string {
    const { python } = this.config
    if (python !== 'python3') return python
    const venv = process.platform === 'win32'
      ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
      : path.join(backendDir, '.venv', 'bin', 'python')
    return fs.existsSync(venv) ? venv : python
  }

  resolveBackendDir(): string | undefined {
    const { backendPath } = this.config
    if (backendPath) return backendPath
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const candidate = path.join(f.uri.fsPath, 'backend')
      if (fs.existsSync(path.join(candidate, 'app.py'))) return candidate
      if (fs.existsSync(path.join(f.uri.fsPath, 'app.py'))) return f.uri.fsPath
    }
    const sibling = path.join(this.extensionPath, '..', 'backend')
    if (fs.existsSync(path.join(sibling, 'app.py'))) return sibling
    return undefined
  }

  async ensure(): Promise<Backend> {
    const { port } = this.config
    const url = `http://localhost:${port}`
    if (this.child && !this.child.killed) return { url, spawned: true }
    if (await this.isHealthy(url)) {
      this.output.appendLine(`Reusing backend already running at ${url}`)
      return { url, spawned: false }
    }
    await this.start(url)
    return { url, spawned: true }
  }

  private async isHealthy(url: string): Promise<boolean> {
    try {
      const res = await fetch(`${url}/api/officials`, {
        signal: AbortSignal.timeout(1500),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private run(cmd: string, args: string[], cwd: string): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
      const p = cp.spawn(cmd, args, { cwd })
      let out = ''
      p.stdout?.on('data', (d) => (out += d))
      p.stderr?.on('data', (d) => (out += d))
      p.on('error', (e) => resolve({ code: -1, out: String(e) }))
      p.on('close', (code) => resolve({ code: code ?? -1, out }))
    })
  }

  private async start(url: string): Promise<void> {
    const { port } = this.config
    const dir = this.resolveBackendDir()
    if (!dir) {
      throw new Error(
        'Could not find the Signal Dash backend (a folder containing app.py). ' +
        'Open the signal-dash repo as your workspace, or set "signalDash.backendPath".',
      )
    }
    const python = this.resolvePython(dir)
    this.output.appendLine(`Backend directory: ${dir}`)
    this.output.appendLine(`Python interpreter: ${python}`)

    const deps = await this.run(python, ['-c', 'import fastapi, uvicorn'], dir)
    if (deps.code !== 0) {
      const pick = await vscode.window.showErrorMessage(
        `Signal Dash: "${python}" is missing or lacks backend dependencies. ` +
        `Run: ${python} -m pip install -r ${path.join(dir, 'requirements.txt')}`,
        'Open Settings',
      )
      if (pick === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'signalDash')
      }
      throw new Error(`Python check failed: ${deps.out.trim().split('\n').pop()}`)
    }

    if (!fs.existsSync(path.join(dir, 'signal.db'))) {
      this.output.appendLine('signal.db not found — seeding demo data…')
      const seed = await this.run(python, ['seed_demo.py'], dir)
      this.output.appendLine(seed.out.trim())
      if (seed.code !== 0) throw new Error('seed_demo.py failed — see Signal Dash output channel.')
    }

    this.output.appendLine(`Starting uvicorn on port ${port}…`)
    this.expectingExit = false
    this.child = cp.spawn(python, ['-m', 'uvicorn', 'app:app', '--port', String(port)], { cwd: dir })
    this.child.stdout?.on('data', (d) => this.output.append(d.toString()))
    this.child.stderr?.on('data', (d) => this.output.append(d.toString()))
    this.child.on('exit', (code) => {
      this.child = undefined
      if (this.expectingExit) return
      vscode.window
        .showErrorMessage(`Signal Dash backend exited unexpectedly (code ${code}).`, 'Restart')
        .then((pick) => {
          if (pick === 'Restart') vscode.commands.executeCommand('signal-dash.openDashboard')
        })
    })

    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      if (await this.isHealthy(url)) return
      await new Promise((r) => setTimeout(r, 400))
    }
    this.dispose()
    throw new Error(
      `Backend did not become healthy on port ${port} within 15s. ` +
      'If another app owns that port, change "signalDash.port". See the Signal Dash output channel for logs.',
    )
  }

  dispose(): void {
    if (this.child && !this.child.killed) {
      this.expectingExit = true
      this.child.kill()
    }
    this.child = undefined
  }
}
