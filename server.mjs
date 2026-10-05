import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createServer as createViteServer } from 'vite'
import ariaChat from './api/aria/chat.js'
import ariaRealtime from './api/aria/realtime.js'

const projectRoot = process.cwd()
const distRoot = resolve(projectRoot, 'dist')
const isDevelopment = process.argv.includes('--dev')
const port = Number(process.env.PORT ?? 5173)

if (!process.env.OPENAI_API_KEY && existsSync(join(projectRoot, '.env'))) {
  const envFile = readFileSync(join(projectRoot, '.env'), 'utf8')
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

async function readBody(request, limit = 160_000) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new RangeError('Request body is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function jsonError(response, status, error) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify({ error }))
}

async function handleLocalApi(request, response, handler) {
  try {
    const content = await readBody(request)
    if (content) {
      try {
        request.body = JSON.parse(content)
      } catch {
        return jsonError(response, 400, 'Invalid JSON request.')
      }
    } else {
      request.body = {}
    }
    await handler(request, response)
  } catch (error) {
    if (error instanceof RangeError) return jsonError(response, 413, 'Request body is too large.')
    console.error('Local API request failed:', error instanceof Error ? error.name : 'UnknownError')
    jsonError(response, 500, 'The request could not be completed. Please try again.')
  }
}

async function serveProductionFile(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let filePath = normalize(join(distRoot, pathname))
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html')
    const contents = await readFile(filePath)
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' })
    response.end(contents)
  } catch {
    const index = await readFile(join(distRoot, 'index.html'))
    response.writeHead(200, { 'Content-Type': mimeTypes['.html'] })
    response.end(index)
  }
}

let vite
async function handleRequest(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/api/aria/chat') return handleLocalApi(request, response, ariaChat)
  if (pathname === '/api/aria/realtime') return handleLocalApi(request, response, ariaRealtime)
  if (pathname.startsWith('/api/')) return jsonError(response, 404, 'API endpoint not found.')
  if (isDevelopment) return vite.middlewares(request, response, () => response.writeHead(404).end('Not found'))
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end('Method not allowed')
    return
  }
  return serveProductionFile(request, response)
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(error => {
    console.error('ASPIRO request failed:', error instanceof Error ? error.name : 'UnknownError')
    if (!response.headersSent) jsonError(response, 500, 'The request could not be completed. Please try again.')
    else response.destroy()
  })
})

if (isDevelopment) {
  vite = await createViteServer({
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server } },
  })
}

server.listen(port, '127.0.0.1', () => {
  console.log(`ASPIRO ${isDevelopment ? 'development' : 'production'} server: http://127.0.0.1:${port}`)
  if (!process.env.OPENAI_API_KEY) console.log('ARIA OpenAI features are offline; the Quantum Lab remains available.')
})
