<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Eye,
  EyeOff,
  FlipHorizontal,
  Image as ImageIcon,
  Maximize,
  Monitor,
  Plus,
  Sliders,
  Target,
  Trash2,
  Type,
  X,
} from 'lucide-vue-next'
import type {
  LayerShape,
  SceneSource,
  SceneTemplate,
  SourceStatus,
  Transform,
} from '../types/studio'

const props = defineProps<{
  sources: SceneSource[]
  selectedSourceId: string | null
  statuses: Record<string, SourceStatus>
  videoDevices: MediaDeviceInfo[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'add-camera', deviceId?: string, label?: string): void
  (e: 'add-screen'): void
  (e: 'add-text', text: string): void
  (e: 'add-image', file: File): void
  (e: 'add-test'): void
  (e: 'refresh-devices'): void
  (e: 'update-transform', id: string, t: Transform): void
  (e: 'toggle-visible', id: string, visible: boolean): void
  (e: 'set-shape', id: string, shape: LayerShape): void
  (e: 'toggle-mirror', id: string): void
  (e: 'fit-full', id: string): void
  (e: 'center', id: string): void
  (e: 'move-layer', id: string, up: boolean): void
  (e: 'remove', id: string): void
  (e: 'apply-template', tpl: SceneTemplate): void
}>()

const showAddModal = ref(false)
const showTextModal = ref(false)
const textInput = ref('')
const keepRatio = ref(true)
const fileInputRef = ref<HTMLInputElement | null>(null)

const selectedSource = computed(() =>
  props.sources.find((s) => s.id === props.selectedSourceId) ?? null,
)

const orderedTopFirst = computed(() => [...props.sources].reverse())

function openAddModal(): void {
  emit('refresh-devices')
  showAddModal.value = true
}

function onWidthSlider(val: number): void {
  const src = selectedSource.value
  if (!src) return
  const t = src.transform
  const ratio = t.width > 0.01 ? t.height / t.width : 1
  const newH = keepRatio.value ? Math.min(1, Math.max(0.1, val * ratio)) : t.height
  emit('update-transform', src.id, { ...t, width: val, height: newH })
}

function onHeightSlider(val: number): void {
  const src = selectedSource.value
  if (!src) return
  emit('update-transform', src.id, { ...src.transform, height: val })
}

function onFileChange(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('add-image', file)
    input.value = ''
  }
}

function submitText(): void {
  if (textInput.value.trim()) {
    emit('add-text', textInput.value.trim())
    textInput.value = ''
    showTextModal.value = false
  }
}

function statusText(id: string): string {
  const st = props.statuses[id] ?? 'STANDBY'
  if (st === 'ACTIVE') return 'Aktif'
  if (st === 'DISCONNECTED') return 'Terputus'
  if (st === 'ERROR') return 'Galat'
  return 'Siaga'
}

function statusClass(id: string): string {
  const st = props.statuses[id] ?? 'STANDBY'
  if (st === 'ACTIVE') return 'st-active'
  if (st === 'DISCONNECTED') return 'st-warn'
  if (st === 'ERROR') return 'st-err'
  return 'st-idle'
}

const templates: Array<{ id: SceneTemplate; label: string }> = [
  { id: 'FULL', label: 'Layar Penuh' },
  { id: 'GAMEPLAY_CAM', label: 'Gameplay + Kamera' },
  { id: 'SCREEN_CAM', label: 'Layar + Kamera' },
  { id: 'CAMERA', label: 'Kamera Penuh' },
  { id: 'DUAL_CAM', label: 'Dua Kamera' },
]

const shapes: Array<{ id: LayerShape; label: string }> = [
  { id: 'RECT', label: 'Persegi' },
  { id: 'ROUNDED', label: 'Membulat' },
  { id: 'CIRCLE', label: 'Bulat' },
]
</script>

<template>
  <div class="col-gap">
    <!-- Kartu Atur Ukuran Sumber Terpilih -->
    <div v-if="selectedSource" class="card selected-card">
      <div class="row-between" style="margin-bottom: 10px">
        <strong style="font-size: 13px; color: var(--accent)">{{ selectedSource.name }}</strong>
        <label class="row-gap" style="font-size: 12px; color: var(--text-secondary); cursor: pointer">
          <input v-model="keepRatio" type="checkbox" />
          <span>Kunci Rasio</span>
        </label>
      </div>

      <div class="slider-row">
        <span class="slider-label">Lebar {{ Math.round(selectedSource.transform.width * 100) }}%</span>
        <input
          class="slider"
          type="range"
          min="0.1"
          max="1"
          step="0.01"
          :value="selectedSource.transform.width"
          @input="onWidthSlider(Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <div v-if="!keepRatio" class="slider-row">
        <span class="slider-label">Tinggi {{ Math.round(selectedSource.transform.height * 100) }}%</span>
        <input
          class="slider"
          type="range"
          min="0.1"
          max="1"
          step="0.01"
          :value="selectedSource.transform.height"
          @input="onHeightSlider(Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <div class="chip-group" style="margin-top: 8px">
        <button class="btn btn-sm" type="button" @click="emit('fit-full', selectedSource.id)">
          <Maximize :size="13" />
          <span>Isi Penuh</span>
        </button>
        <button class="btn btn-sm" type="button" @click="emit('center', selectedSource.id)">
          <Target :size="13" />
          <span>Tengah</span>
        </button>
        <button
          class="btn btn-sm"
          :class="{ 'btn-accent-outline': selectedSource.mirrored }"
          type="button"
          @click="emit('toggle-mirror', selectedSource.id)"
        >
          <FlipHorizontal :size="13" />
          <span>Cermin</span>
        </button>
      </div>

      <div class="chip-group" style="margin-top: 8px">
        <button
          v-for="sh in shapes"
          :key="sh.id"
          class="chip"
          :class="{ active: selectedSource.shape === sh.id }"
          type="button"
          @click="emit('set-shape', selectedSource.id, sh.id)"
        >
          {{ sh.label }}
        </button>
      </div>
    </div>

    <div v-else-if="sources.length > 0" class="alert alert-info">
      Ketuk sumber pada kanvas atau daftar di bawah untuk memindah atau mengatur besar-kecil ukurannya.
    </div>

    <!-- Daftar Layer Sumber -->
    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Sumber pada Scene</h3>
        <button class="btn btn-primary btn-sm" type="button" @click="openAddModal">
          <Plus :size="15" />
          <span>Tambah Sumber</span>
        </button>
      </div>

      <p v-if="sources.length === 0" class="hint-text">
        Belum ada sumber pada scene ini. Klik Tambah Sumber untuk menambahkan Capture Card USB, Rekam Layar, Kamera, Teks, atau Logo.
      </p>

      <div v-else class="layer-list">
        <div
          v-for="(src, idx) in orderedTopFirst"
          :key="src.id"
          class="layer-row"
          :class="{ selected: src.id === selectedSourceId }"
          @click="emit('select', src.id === selectedSourceId ? null : src.id)"
        >
          <div class="layer-meta">
            <Camera v-if="src.type === 'CAMERA'" :size="16" />
            <Monitor v-else-if="src.type === 'SCREEN'" :size="16" />
            <Type v-else-if="src.type === 'TEXT'" :size="16" />
            <ImageIcon v-else-if="src.type === 'IMAGE'" :size="16" />
            <Sliders v-else :size="16" />

            <div class="layer-text">
              <div class="layer-name" :class="{ muted: !src.visible }">{{ src.name }}</div>
              <div class="layer-sub" :class="statusClass(src.id)">
                {{ statusText(src.id) }} • {{ Math.round(src.transform.width * 100) }}% x {{ Math.round(src.transform.height * 100) }}%
              </div>
            </div>
          </div>

          <div class="layer-controls" @click.stop>
            <button
              class="btn btn-icon btn-sm"
              type="button"
              :disabled="idx === 0"
              title="Naikkan Layer"
              @click="emit('move-layer', src.id, true)"
            >
              <ArrowUp :size="14" />
            </button>
            <button
              class="btn btn-icon btn-sm"
              type="button"
              :disabled="idx === orderedTopFirst.length - 1"
              title="Turunkan Layer"
              @click="emit('move-layer', src.id, false)"
            >
              <ArrowDown :size="14" />
            </button>
            <button
              class="btn btn-icon btn-sm"
              type="button"
              :title="src.visible ? 'Sembunyikan' : 'Tampilkan'"
              @click="emit('toggle-visible', src.id, !src.visible)"
            >
              <Eye v-if="src.visible" :size="14" color="#3D6FA5" />
              <EyeOff v-else :size="14" color="#5B6670" />
            </button>
            <button
              class="btn btn-icon btn-sm"
              type="button"
              title="Hapus Sumber"
              @click="emit('remove', src.id)"
            >
              <Trash2 :size="14" color="#C0504D" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Template Cepat -->
    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Template Cepat</h3>
      </div>
      <div class="chip-group">
        <button
          v-for="tpl in templates"
          :key="tpl.id"
          class="chip"
          type="button"
          :disabled="sources.length === 0"
          @click="emit('apply-template', tpl.id)"
        >
          {{ tpl.label }}
        </button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFileChange"
    />

    <!-- Modal Tambah Sumber -->
    <div v-if="showAddModal" class="modal-backdrop" @click.self="showAddModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Tambah Sumber Video / Overlay</h3>
          <button class="btn btn-icon btn-sm" type="button" @click="showAddModal = false">
            <X :size="15" />
          </button>
        </div>

        <div class="col-gap">
          <button
            class="source-pick-btn"
            type="button"
            @click="emit('add-screen'); showAddModal = false"
          >
            <Monitor :size="18" color="#3D6FA5" />
            <div>
              <div class="pick-title">Rekam Layar / Jendela / Tab</div>
              <div class="pick-sub">Menangkap layar penuh, aplikasi tertentu, atau tab beserta audionya</div>
            </div>
          </button>

          <button
            class="source-pick-btn"
            type="button"
            @click="emit('add-camera'); showAddModal = false"
          >
            <Camera :size="18" color="#3D6FA5" />
            <div>
              <div class="pick-title">Capture Card USB / Webcam / HP via Kabel USB</div>
              <div class="pick-sub">Mendukung Capture Card UVC, Webcam, atau ponsel Android (mode USB Webcam / HDMI Capture)</div>
            </div>
          </button>

          <template v-if="videoDevices.length > 0">
            <div class="section-label">Perangkat Kamera / Capture Card Terdeteksi</div>
            <button
              v-for="(dev, i) in videoDevices"
              :key="dev.deviceId || i"
              class="source-pick-btn"
              type="button"
              @click="emit('add-camera', dev.deviceId, dev.label || `Perangkat Video ${i + 1}`); showAddModal = false"
            >
              <Camera :size="16" color="#4F8A6B" />
              <div>
                <div class="pick-title">{{ dev.label || `Kamera / Capture Card ${i + 1}` }}</div>
              </div>
            </button>
          </template>

          <div class="divider"></div>

          <button
            class="source-pick-btn"
            type="button"
            @click="showAddModal = false; showTextModal = true"
          >
            <Type :size="18" color="#3D6FA5" />
            <div>
              <div class="pick-title">Overlay Teks</div>
              <div class="pick-sub">Judul, label nama, atau catatan statis pada kanvas</div>
            </div>
          </button>

          <button
            class="source-pick-btn"
            type="button"
            @click="showAddModal = false; fileInputRef?.click()"
          >
            <ImageIcon :size="18" color="#3D6FA5" />
            <div>
              <div class="pick-title">Overlay Gambar / Logo</div>
              <div class="pick-sub">PNG/JPG dari perangkat Anda</div>
            </div>
          </button>

          <div class="divider"></div>

          <button
            class="source-pick-btn"
            type="button"
            @click="emit('add-test'); showAddModal = false"
          >
            <Sliders :size="18" color="#5B6670" />
            <div>
              <div class="pick-title">Pola Uji (Diagnostik)</div>
              <div class="pick-sub">Color bars opsional untuk menguji frame rate</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Overlay Teks -->
    <div v-if="showTextModal" class="modal-backdrop" @click.self="showTextModal = false">
      <div class="modal-card" style="max-width: 400px">
        <div class="modal-header">
          <h3 class="modal-title">Tambah Overlay Teks</h3>
        </div>
        <input
          v-model="textInput"
          class="input"
          type="text"
          placeholder="Masukkan teks overlay"
          @keyup.enter="submitText"
        />
        <div class="modal-footer">
          <button class="btn" type="button" @click="showTextModal = false">Batal</button>
          <button class="btn btn-primary" type="button" @click="submitText">Tambah</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.selected-card {
  border-color: rgba(61, 111, 165, 0.55);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.slider-label {
  width: 88px;
  font-size: 12px;
  color: var(--text);
  flex-shrink: 0;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.layer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  cursor: pointer;
}

.layer-row.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.layer-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.layer-text {
  min-width: 0;
}

.layer-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layer-name.muted {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.layer-sub {
  font-size: 11px;
}

.st-active { color: var(--success); }
.st-warn { color: var(--warning); }
.st-err { color: var(--record); }
.st-idle { color: var(--text-secondary); }

.layer-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.source-pick-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
}

.source-pick-btn:hover {
  background: var(--surface-subtle);
  border-color: var(--accent);
}

.pick-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.pick-sub {
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
