import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    // reachable through `tailscale serve` (https://<machine>.<tailnet>.ts.net), tailnet only
    // IPv4 loopback: `tailscale serve` proxies to 127.0.0.1, and Node's default "localhost" binds ::1 only
    host: '127.0.0.1',
    allowedHosts: ['.ts.net'],
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
})
