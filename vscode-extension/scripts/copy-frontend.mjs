// Builds the React frontend and copies frontend/dist into media/dist so the
// webview can serve it. Run automatically by `npm run build`.
import { execSync } from 'child_process'
import { cpSync, existsSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const extRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const frontend = path.join(extRoot, '..', 'frontend')

if (!existsSync(path.join(frontend, 'package.json'))) {
  console.error(`Frontend not found at ${frontend}`)
  process.exit(1)
}
if (!existsSync(path.join(frontend, 'node_modules'))) {
  console.log('Installing frontend dependencies…')
  execSync('npm install', { cwd: frontend, stdio: 'inherit' })
}
console.log('Building frontend…')
execSync('npm run build', { cwd: frontend, stdio: 'inherit' })

const dest = path.join(extRoot, 'media', 'dist')
rmSync(dest, { recursive: true, force: true })
cpSync(path.join(frontend, 'dist'), dest, { recursive: true })
console.log(`Copied frontend build to ${dest}`)
