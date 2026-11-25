<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorUp,
  RefreshCw,
  X,
} from 'lucide-vue-next'
import type { SceneSource, ScreenTarget, Transform } from '../types/studio'

const props = defineProps<{
  canvasElement: HTMLCanvasElement
  sources: SceneSource[]
  selectedSourceId: string | null
  sceneName: string
  resolutionLabel: string
  outputWidth: number
  outputHeight: number
  recording: boolean
  recordingMs: number
  previewEnabled: boolean
  canvasLocked: boolean
  screens: ScreenTarget[]
  selectedScreenId: string
  multiScreenDetected: boolean
  supportsMultiScreenApi: boolean
  projectorOpen: boolean
  isFullscreen: boolean
  showDebug: boolean
  actualFps: number
  droppedFrames: number
  memoryMb: number | null
}>()

const emit = defineEmits<{
  (e: 'toggle-lock'): void
  (e: 'toggle-preview'): void
  (e: 'select-source', id: string | null): void
  (e: 'update-transform', id: string, transform: Transform): void
  (e: 'detect-screens'): void
  (e: 'select-screen', id: string): void
  (e: 'toggle-fullscreen', el: HTMLElement | null): void
  (e: 'open-projector'): void
  (e: 'close-projector'): void
}>()

const stageRef = ref<HTMLElement | null>(null)
const canvasHostRef = ref<HTMLElement | null>(null)
const showScreenMenu = ref(false)

type DragMode = 'NONE' | 'MOVE' | 'TL' | 'TR' | 'BL' | 'BR'
const SNAP_THRESHOLD = 0.025
const MIN_SIZE = 0.1

const dragState = ref<{
  mode: DragMode
  sourceId: string | null
  startX: number
  startY: number
  initial: Transform | null
}>({
  mode: 'NONE',
  sourceId: null,
  startX: 0,
  startY: 0,
  initial: null,
})

const snapCenterX = ref(false)
const snapCenterY = ref(false)

const isPortrait = computed(() => props.outputHeight > props.outputWidth)

const selectedSource = computed(() =>
  props.sources.find((s) => s.id === props.selectedSourceId && s.visible) ?? null,
)

const durationFormatted = computed(() => {
  const sec = Math.floor(props.recordingMs / 1000)
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
})

function mountCanvas(): void {
  const host = canvasHostRef.value
  if (!host) return
  props.canvasElement.className = 'preview-canvas-el'
  if (props.canvasElement.parentElement !== host) {
    host.innerHTML = ''
    host.appendChild(props.canvasElement)
  }
}

onMounted(() => {
  mountCanvas()
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

watch(() => props.previewEnabled, (enabled) => {
  if (enabled) {
    requestAnimationFrame(() => mountCanvas())
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

function onOverlayPointerDown(ev: PointerEvent): void {
  if (props.canvasLocked || !props.previewEnabled || props.isFullscreen) return
  const box = canvasHostRef.value?.getBoundingClientRect()
  if (!box || box.width <= 0 || box.height <= 0) return

  const nx = (ev.clientX - box.left) / box.width
  const ny = (ev.clientY - box.top) / box.height

  // Cek apakah mengenai handle sudut sumber yang sedang dipilih
  const active = selectedSource.value
  if (active) {
    const t = active.transform
    const rx = 20 / box.width
    const ry = 20 / box.height
    const corners: Array<{ mode: DragMode; cx: number; cy: number }> = [
      { mode: 'BR', cx: t.x + t.width, cy: t.y + t.height },
      { mode: 'TL', cx: t.x, cy: t.y },
      { mode: 'TR', cx: t.x + t.width, cy: t.y },
      { mode: 'BL', cx: t.x, cy: t.y + t.height },
    ]
    for (const c of corners) {
      if (Math.abs(nx - c.cx) <= rx && Math.abs(ny - c.cy) <= ry) {
        dragState.value = {
          mode: c.mode,
          sourceId: active.id,
          startX: ev.clientX,
          startY: ev.clientY,
          initial: { ...t },
        }
        return
      }
    }
  }

  // Pilih sumber teratas di titik klik
  const hit = [...props.sources].reverse().find(
    (s) =>
      s.visible &&
      nx >= s.transform.x &&
      nx <= s.transform.x + s.transform.width &&
      ny >= s.transform.y &&
      ny <= s.transform.y + s.transform.height,
  )

  if (!hit) {
    emit('select-source', null)
    return
  }

  emit('select-source', hit.id)
  dragState.value = {
    mode: 'MOVE',
    sourceId: hit.id,
    startX: ev.clientX,
    startY: ev.clientY,
    initial: { ...hit.transform },
  }
}

function onPointerMove(ev: PointerEvent): void {
  const st = dragState.value
  if (st.mode === 'NONE' || !st.sourceId || !st.initial) return
  const box = canvasHostRef.value?.getBoundingClientRect()
  if (!box || box.width <= 0 || box.height <= 0) return

  const dx = (ev.clientX - st.startX) / box.width
  const dy = (ev.clientY - st.startY) / box.height
  const init = st.initial
  let next: Transform = { ...init }

  if (st.mode === 'MOVE') {
    let nx = Math.min(1 - init.width, Math.max(0, init.x + dx))
    let ny = Math.min(1 - init.height, Math.max(0, init.y + dy))
    const cx = (1 - init.width) / 2
    const cy = (1 - init.height) / 2

    snapCenterX.value = Math.abs(nx - cx) < SNAP_THRESHOLD
    snapCenterY.value = Math.abs(ny - cy) < SNAP_THRESHOLD
    if (snapCenterX.value) nx = cx
    else if (nx < SNAP_THRESHOLD) nx = 0
    else if (Math.abs(nx - (1 - init.width)) < SNAP_THRESHOLD) nx = 1 - init.width

    if (snapCenterY.value) ny = cy
    else if (ny < SNAP_THRESHOLD) ny = 0
    else if (Math.abs(ny - (1 - init.height)) < SNAP_THRESHOLD) ny = 1 - init.height

    next = { ...init, x: nx, y: ny }
  } else if (st.mode === 'BR') {
    next.width = Math.min(1 - init.x, Math.max(MIN_SIZE, init.width + dx))
    next.height = Math.min(1 - init.y, Math.max(MIN_SIZE, init.height + dy))
  } else if (st.mode === 'TL') {
    const right = init.x + init.width
    const bottom = init.y + init.height
    const nx = Math.min(right - MIN_SIZE, Math.max(0, init.x + dx))
    const ny = Math.min(bottom - MIN_SIZE, Math.max(0, init.y + dy))
    next = { x: nx, y: ny, width: right - nx, height: bottom - ny }
  } else if (st.mode === 'TR') {
    const bottom = init.y + init.height
    const nw = Math.min(1 - init.x, Math.max(MIN_SIZE, init.width + dx))
    const ny = Math.min(bottom - MIN_SIZE, Math.max(0, init.y + dy))
    next = { x: init.x, y: ny, width: nw, height: bottom - ny }
  } else if (st.mode === 'BL') {
    const right = init.x + init.width
    const nx = Math.min(right - MIN_SIZE, Math.max(0, init.x + dx))
    const nh = Math.min(1 - init.y, Math.max(MIN_SIZE, init.height + dy))
    next = { x: nx, y: init.y, width: right - nx, height: nh }
  }

  emit('update-transform', st.sourceId, next)
}

function onPointerUp(): void {
  if (dragState.value.mode !== 'NONE') {
    dragState.value = { mode: 'NONE', sourceId: null, startX: 0, startY: 0, initial: null }
    snapCenterX.value = false
    snapCenterY.value = false
  }
}

async function openScreenPicker(): Promise<void> {
  showScreenMenu.value = !showScreenMenu.value
  if (showScreenMenu.value && props.supportsMultiScreenApi && !props.multiScreenDetected) {
    emit('detect-screens')
  }
}
</script>

<template>
  <div ref="stageRef" class="preview-card" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- Bilah Kontrol Atas Pratinjau -->
    <div class="preview-top-bar">
      <div class="row-gap">
        <span v-if="recording" class="live-rec-pill">
          <span class="rec-dot"></span>
          Merekam {{ durationFormatted }}
        </span>
        <span v-else-if="selectedSource && !canvasLocked && !isFullscreen" class="info-pill">
          {{ selectedSource.name }} • {{ Math.round(selectedSource.transform.width * 100) }}% x {{ Math.round(selectedSource.transform.height * 100) }}%
        </span>
        <span v-if="projectorOpen" class="info-pill projector-pill">
          Proyektor Aktif
        </span>
      </div>

      <div class="row-gap">
        <button
          v-if="!isFullscreen"
          class="overlay-btn"
          type="button"
          :title="canvasLocked ? 'Buka Kunci Kanvas' : 'Kunci Kanvas'"
          @click="emit('toggle-lock')"
        >
          <Lock v-if="canvasLocked" :size="14" />
          <LockOpen v-else :size="14" />
          <span>{{ canvasLocked ? 'Terkunci' : 'Atur Ukuran' }}</span>
        </button>

        <button
          v-if="!isFullscreen"
          class="overlay-btn"
          type="button"
          :title="previewEnabled ? 'Matikan Pratinjau' : 'Nyalakan Pratinjau'"
          @click="emit('toggle-preview')"
        >
          <Eye v-if="previewEnabled" :size="14" />
          <EyeOff v-else :size="14" />
        </button>

        <!-- Pemilih Multi-Layar / Proyektor -->
        <button
          v-if="!isFullscreen"
          class="overlay-btn"
          :class="{ active: showScreenMenu || projectorOpen }"
          type="button"
          title="Pilih Layar Pratinjau (Multi-Monitor)"
          @click="openScreenPicker"
        >
          <MonitorUp :size="14" />
          <span>Pilih Layar</span>
        </button>

        <!-- Fullscreen Langsung -->
        <button
          class="overlay-btn"
          type="button"
          :title="isFullscreen ? 'Keluar Layar Penuh' : 'Pratinjau Layar Penuh'"
          @click="emit('toggle-fullscreen', stageRef)"
        >
          <Minimize2 v-if="isFullscreen" :size="14" />
          <Maximize2 v-else :size="14" />
          <span>{{ isFullscreen ? 'Keluar' : 'Layar Penuh' }}</span>
        </button>
      </div>
    </div>

    <!-- Panel Pemilih Layar Multi-Monitor -->
    <div v-if="showScreenMenu && !isFullscreen" class="screen-picker-popover">
      <div class="row-between" style="margin-bottom: 8px">
        <div class="row-gap">
          <Monitor :size="15" color="#3D6FA5" />
          <strong style="font-size: 13px">Pilih Layar Pratinjau</strong>
        </div>
        <button class="btn btn-icon btn-sm" type="button" @click="showScreenMenu = false">
          <X :size="14" />
        </button>
      </div>

      <p class="hint-text" style="margin-bottom: 8px">
        Pilih monitor tujuan untuk menampilkan pratinjau penuh atau membuka jendela proyektor terpisah ala OBS.
      </p>

      <div class="col-gap" style="gap: 6px; margin-bottom: 10px">
        <label
          v-for="scr in screens"
          :key="scr.id"
          class="screen-option"
          :class="{ selected: scr.id === selectedScreenId }"
        >
          <input
            type="radio"
            name="preview-screen"
            :checked="scr.id === selectedScreenId"
            @change="emit('select-screen', scr.id)"
          />
          <span>{{ scr.label }}</span>
        </label>
      </div>

      <div class="row-gap" style="flex-wrap: wrap">
        <button
          v-if="supportsMultiScreenApi"
          class="btn btn-sm"
          type="button"
          @click="emit('detect-screens')"
        >
          <RefreshCw :size="13" />
          <span>Deteksi Layar</span>
        </button>

        <button
          class="btn btn-sm btn-accent-outline"
          type="button"
          @click="emit('toggle-fullscreen', stageRef); showScreenMenu = false"
        >
          <Maximize2 :size="13" />
          <span>Layar Penuh di Sini</span>
        </button>

        <button
          v-if="!projectorOpen"
          class="btn btn-sm btn-primary"
          type="button"
          @click="emit('open-projector'); showScreenMenu = false"
        >
          <MonitorUp :size="13" />
          <span>Buka Proyektor di Layar Ini</span>
        </button>

        <button
          v-else
          class="btn btn-sm btn-danger-outline"
          type="button"
          @click="emit('close-projector')"
        >
          <span>Tutup Proyektor</span>
        </button>
      </div>

      <p v-if="!supportsMultiScreenApi" class="hint-text" style="margin-top: 8px">
        Browser ini belum mendukung deteksi daftar monitor otomatis (Window Management API). Gunakan tombol Buka Proyektor lalu geser jendela ke monitor kedua dan klik Layar Penuh.
      </p>
    </div>

    <!-- Area Kanvas & Overlay Seleksi OBS -->
    <div class="preview-viewport" :class="{ portrait: isPortrait && !isFullscreen }">
      <div
        v-show="previewEnabled"
        ref="canvasHostRef"
        class="canvas-frame"
        :style="{ aspectRatio: `${outputWidth} / ${outputHeight}` }"
      >
        <!-- Canvas dimasukkan lewat DOM ref -->
      </div>

      <!-- Overlay Bounding Box Interaktif (hanya saat tidak fullscreen & tidak terkunci) -->
      <div
        v-if="previewEnabled && !canvasLocked && !isFullscreen"
        class="gesture-layer"
        :style="{ aspectRatio: `${outputWidth} / ${outputHeight}` }"
        @pointerdown="onOverlayPointerDown"
      >
        <div v-if="snapCenterX" class="snap-line-v"></div>
        <div v-if="snapCenterY" class="snap-line-h"></div>

        <div
          v-if="selectedSource"
          class="selection-box"
          :style="{
            left: `${selectedSource.transform.x * 100}%`,
            top: `${selectedSource.transform.y * 100}%`,
            width: `${selectedSource.transform.width * 100}%`,
            height: `${selectedSource.transform.height * 100}%`,
          }"
        >
          <span class="handle tl"></span>
          <span class="handle tr"></span>
          <span class="handle bl"></span>
          <span class="handle br"></span>
        </div>

        <div v-if="sources.length === 0" class="empty-canvas-hint">
          Tambahkan sumber video (Capture Card, Layar, atau Kamera) dari panel Sumber
        </div>
      </div>

      <!-- Mode Pratinjau Dimatikan (Hemat Daya) -->
      <div v-if="!previewEnabled" class="preview-disabled-box">
        <EyeOff :size="30" color="#CBD5E1" />
        <p>Pratinjau dimatikan untuk menghemat daya. Rekaman tetap berjalan penuh.</p>
        <button class="btn btn-sm" type="button" @click="emit('toggle-preview')">
          Nyalakan Pratinjau
        </button>
      </div>

      <!-- Debug Overlay (FPS / Drop / Memori) -->
      <div v-if="showDebug" class="debug-chip-box">
        <div>FPS: {{ actualFps }}</div>
        <div>Drop: {{ droppedFrames }}</div>
        <div>Kanvas: {{ outputWidth }}x{{ outputHeight }}</div>
        <div v-if="memoryMb !== null">JS Mem: {{ memoryMb }} MB</div>
      </div>
    </div>

    <!-- Bilah Info Bawah -->
    <div v-if="!isFullscreen" class="preview-bottom-bar">
      <span>{{ sceneName }}</span>
      <span>{{ resolutionLabel }} • {{ outputWidth }}x{{ outputHeight }}</span>
    </div>
  </div>
</template>

<style scoped>
.preview-card {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #141C24;
  border: 1px solid var(--border);
  box-shadow: 0 4px 16px rgba(15, 23, 34, 0.08);
  display: flex;
  flex-direction: column;
}

.preview-card.is-fullscreen {
  border-radius: 0;
  border: none;
  width: 100vw;
  height: 100vh;
  background: #0B0F14;
}

.preview-top-bar {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}

.preview-top-bar > * {
  pointer-events: auto;
}

.overlay-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(15, 23, 34, 0.68);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.overlay-btn:hover,
.overlay-btn.active {
  background: rgba(61, 111, 165, 0.9);
  border-color: rgba(255, 255, 255, 0.35);
}

.info-pill {
  padding: 5px 9px;
  border-radius: 8px;
  background: rgba(15, 23, 34, 0.72);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 600;
}

.projector-pill {
  background: rgba(79, 138, 107, 0.9);
}

.live-rec-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--record);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
}

.rec-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #FFFFFF;
}

.screen-picker-popover {
  position: absolute;
  top: 48px;
  right: 10px;
  z-index: 25;
  width: min(360px, calc(100% - 20px));
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 34, 0.22);
}

.screen-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}

.screen-option.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.preview-viewport {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #141C24;
  overflow: hidden;
}

.preview-card.is-fullscreen .preview-viewport {
  flex: 1;
  height: 100%;
  background: #000000;
}

.preview-viewport.portrait {
  height: 420px;
}

.canvas-frame {
  position: relative;
  width: 100%;
  max-height: 100%;
}

.preview-viewport.portrait .canvas-frame {
  width: auto;
  height: 100%;
}

.preview-card.is-fullscreen .canvas-frame {
  width: auto;
  height: auto;
  max-width: 100vw;
  max-height: 100vh;
}

:deep(.preview-canvas-el) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.gesture-layer {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 100%;
  max-height: 100%;
  cursor: move;
  touch-action: none;
  z-index: 5;
}

.preview-viewport.portrait .gesture-layer {
  width: auto;
  height: 100%;
}

.selection-box {
  position: absolute;
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55);
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #FFFFFF;
  border: 2px solid var(--accent);
}

.handle.tl { left: -6px; top: -6px; }
.handle.tr { right: -6px; top: -6px; }
.handle.bl { left: -6px; bottom: -6px; }
.handle.br { right: -6px; bottom: -6px; }

.snap-line-v {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1.5px;
  background: var(--accent);
  pointer-events: none;
}

.snap-line-h {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1.5px;
  background: var(--accent);
  pointer-events: none;
}

.empty-canvas-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  pointer-events: none;
}

.preview-disabled-box {
  min-height: 260px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #E2E8F0;
  font-size: 13px;
  text-align: center;
}

.debug-chip-box {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 16;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 34, 0.78);
  color: #E2E8F0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  pointer-events: none;
}

.preview-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  background: rgba(15, 23, 34, 0.92);
  color: rgba(255, 255, 255, 0.88);
  font-size: 11px;
  font-weight: 600;
}
</style>
