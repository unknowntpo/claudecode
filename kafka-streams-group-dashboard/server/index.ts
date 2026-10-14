// Bun server: runs the simulated coordinators and pushes snapshots over a WebSocket.
// In production it also serves the built Vue app from ./dist.

import type { ClientMessage, Snapshot } from '../shared/types'
import { createGroups } from './topologies'

const TICK_MS = 250
const DIST = `${import.meta.dir}/../dist`

let groups = createGroups()
let paused = false

const snapshot = (): Snapshot => {
  const now = Date.now()
  return { paused, groups: groups.map((g) => g.view(now)) }
}

function handle(msg: ClientMessage) {
  if (msg.type === 'reset') {
    groups = createGroups()
    paused = false
    return
  }
  if (msg.type === 'togglePause') {
    paused = !paused
    return
  }
  const group = groups.find((g) => g.groupId === msg.groupId)
  if (!group) return
  switch (msg.type) {
    case 'addMember':
      group.addMember(Date.now(), msg.processId)
      break
    case 'leaveMember':
      group.leave(msg.memberId)
      break
    case 'crashMember':
      group.crash(msg.memberId)
      break
    case 'setStandbyReplicas':
      group.setStandbyReplicas(msg.value)
      break
  }
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
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
      ws.send(JSON.stringify(snapshot()))
    },
    message(_ws, raw) {
      try {
        handle(JSON.parse(String(raw)) as ClientMessage)
        broadcast()
      } catch (err) {
        console.error('bad message', err)
      }
    },
  },
})

let lastTick = Date.now()
function broadcast() {
  server.publish('state', JSON.stringify(snapshot()))
}

setInterval(() => {
  const now = Date.now()
  // While paused, shift member timers so nothing "times out" on resume.
  if (paused) {
    for (const g of groups)
      for (const m of g.members.values()) {
        m.lastHeartbeat += now - lastTick
        m.nextHeartbeat += now - lastTick
      }
  } else {
    for (const g of groups) g.tick(now)
  }
  lastTick = now
  broadcast()
}, TICK_MS)

console.log(`streams-group simulator listening on http://localhost:${server.port}`)
