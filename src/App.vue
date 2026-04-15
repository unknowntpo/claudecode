<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const position = ref(null)
const error = ref(null)
const status = ref('idle')
const lastUpdated = ref(null)

let watchId = null

function startWatching() {
  if (!('geolocation' in navigator)) {
    error.value = '此瀏覽器不支援 Geolocation API'
    status.value = 'error'
    return
  }

  status.value = 'locating'
  error.value = null

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      position.value = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed
      }
      lastUpdated.value = new Date(pos.timestamp)
      status.value = 'tracking'
    },
    (err) => {
      error.value = `${err.code}: ${err.message}`
      status.value = 'error'
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  )
}

function stopWatching() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
    status.value = 'idle'
  }
}

onMounted(() => {
  startWatching()
})

onUnmounted(() => {
  stopWatching()
})

const statusLabel = {
  idle: '尚未啟動',
  locating: '定位中…',
  tracking: '追蹤中',
  error: '發生錯誤'
}
</script>

<template>
  <main class="container">
    <header>
      <h1>TDX Location Demo</h1>
      <p class="subtitle">根據目前位置推送 TDX 相關事件（Demo 階段）</p>
    </header>

    <section class="card">
      <div class="status-row">
        <span :class="['status-dot', status]"></span>
        <span class="status-text">{{ statusLabel[status] }}</span>
      </div>

      <div v-if="position" class="coords">
        <div class="coord-item">
          <span class="label">緯度 (Latitude)</span>
          <span class="value">{{ position.latitude.toFixed(6) }}</span>
        </div>
        <div class="coord-item">
          <span class="label">經度 (Longitude)</span>
          <span class="value">{{ position.longitude.toFixed(6) }}</span>
        </div>
        <div class="coord-item">
          <span class="label">精度 (Accuracy)</span>
          <span class="value">±{{ position.accuracy.toFixed(1) }} m</span>
        </div>
        <div v-if="position.speed !== null" class="coord-item">
          <span class="label">速度 (Speed)</span>
          <span class="value">{{ position.speed?.toFixed(2) ?? '—' }} m/s</span>
        </div>
      </div>

      <div v-else-if="status === 'locating'" class="placeholder">
        正在取得位置資訊，請允許瀏覽器的定位權限…
      </div>

      <div v-if="error" class="error">
        {{ error }}
      </div>

      <div v-if="lastUpdated" class="updated">
        最後更新：{{ lastUpdated.toLocaleTimeString('zh-TW') }}
      </div>

      <div class="actions">
        <button v-if="status !== 'tracking'" @click="startWatching">開始追蹤</button>
        <button v-else class="secondary" @click="stopWatching">停止追蹤</button>
      </div>
    </section>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC',
    'Microsoft JhengHei', sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #e2e8f0;
  min-height: 100vh;
}

.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem 1.25rem;
}

header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.subtitle {
  margin: 0 0 1.5rem;
  color: #94a3b8;
  font-size: 0.95rem;
}

.card {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 1.5rem;
  backdrop-filter: blur(8px);
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #64748b;
}

.status-dot.locating {
  background: #f59e0b;
  animation: pulse 1.2s infinite;
}

.status-dot.tracking {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2);
}

.status-dot.error {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-text {
  font-size: 0.9rem;
  color: #cbd5e1;
}

.coords {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.coord-item {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.6);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid #1e293b;
}

.label {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 0.25rem;
}

.value {
  font-size: 1.1rem;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: #f1f5f9;
}

.placeholder {
  color: #94a3b8;
  font-size: 0.95rem;
  padding: 1rem 0;
}

.error {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.9rem;
}

.updated {
  margin-top: 1rem;
  font-size: 0.8rem;
  color: #64748b;
}

.actions {
  margin-top: 1.25rem;
}

button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s;
}

button:hover {
  background: #2563eb;
}

button.secondary {
  background: #475569;
}

button.secondary:hover {
  background: #334155;
}
</style>
