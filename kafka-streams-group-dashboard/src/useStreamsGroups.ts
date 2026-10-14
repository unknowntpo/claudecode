import { ref } from 'vue'
import type { ClientMessage, Snapshot } from '../shared/types'

/** Live snapshot of all simulated streams groups, pushed by the Bun server. */
export function useStreamsGroups() {
  const snapshot = ref<Snapshot | null>(null)
  const connected = ref(false)
  let ws: WebSocket

  const connect = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
    ws.onopen = () => (connected.value = true)
    ws.onmessage = (e) => (snapshot.value = JSON.parse(e.data))
    ws.onclose = () => {
      connected.value = false
      setTimeout(connect, 1000)
    }
  }
  connect()

  const send = (msg: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))

  return { snapshot, connected, send }
}
