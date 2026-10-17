// Bun server: pushes streams-group snapshots over a WebSocket.
// MODE=real (default) reads a live Kafka broker, MODE=sim runs the in-process simulator.
// In production it also serves the built Vue app from ./dist.

import type { ClientMessage } from '../shared/types'
import type { Backend } from './backend'
import { RealBackend } from './real/backend'
import { SimBackend } from './sim'

const TICK_MS = 250
const DIST = `${import.meta.dir}/../dist`

const backend: Backend = process.env.MODE === 'sim' ? new SimBackend() : new RealBackend()

const server = Bun.serve({
  // SERVER_PORT, not PORT: preview tools set PORT for the Vite dev server, which proxies /ws to 3000
  port: Number(process.env.SERVER_PORT ?? 3000),
  async fetch(req, server) {
    const { pathname } = new URL(req.url)
    if (pathname === '/ws') {
      return server.upgrade(req) ? undefined : new Response('WebSocket upgrade failed', { status: 400 })
    }
    const file = Bun.file(`${DIST}${pathname === '/' ? '/index.html' : pathname}`)
    if (await file.exists()) return new Response(file)
    return new Response('Not found – run `bun run build` first, or use `bun run dev`.', { status: 404 })
  },
  websocket: {
    open(ws) {
      ws.subscribe('state')
      ws.send(JSON.stringify(backend.snapshot()))
    },
    async message(_ws, raw) {
      try {
        await backend.handle(JSON.parse(String(raw)) as ClientMessage)
        broadcast()
      } catch (err) {
        console.error('bad message', err)
      }
    },
  },
})

function broadcast() {
  server.publish('state', JSON.stringify(backend.snapshot()))
}

setInterval(async () => {
  await backend.tick()
  broadcast()
}, TICK_MS)

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    backend.close()
    process.exit(0)
  })

console.log(`streams-group dashboard (${process.env.MODE === 'sim' ? 'sim' : 'real'} mode) on http://localhost:${server.port}`)
