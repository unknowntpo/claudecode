// Starts the console server (port 3000) and the Vite dev server together.
const procs = [
  Bun.spawn(['bun', '--watch', 'server/index.ts'], { stdio: ['inherit', 'inherit', 'inherit'] }),
  // Vite runs on Node: under the Bun runtime its /ws proxy never completes the WebSocket upgrade
  Bun.spawn(['bunx', 'vite'], { stdio: ['inherit', 'inherit', 'inherit'] }),
]
const stop = () => {
  for (const p of procs) p.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
await Promise.race(procs.map((p) => p.exited))
stop()
export {}
