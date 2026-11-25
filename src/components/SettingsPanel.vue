<script setup lang="ts">
import { ref } from 'vue'
import { Download, Monitor, RefreshCw, Upload } from 'lucide-vue-next'
import {
  PRESETS,
  RESOLUTIONS,
  type PresetOption,
  type Project,
  type SceneTransition,
  type ScreenTarget,
} from '../types/studio'
import type { LoadEstimate } from '../engine/loadEstimator'

const props = defineProps<{
  project: Project
  recording: boolean
  previewLowPower: boolean
  loadEstimate: LoadEstimate
  screens: ScreenTarget[]
  selectedScreenId: string
  supportsMultiScreenApi: boolean
}>()

const emit = defineEmits<{
  (e: 'set-preset', id: PresetOption['id']): void
  (e: 'set-resolution', id: string): void
  (e: 'set-portrait', portrait: boolean): void
  (e: 'set-transition', t: SceneTransition): void
  (e: 'set-low-power', val: boolean): void
  (e: 'detect-screens'): void
  (e: 'select-screen', id: string): void
  (e: 'open-projector'): void
  (e: 'export-project'): void
  (e: 'import-project', file: File): void
}>()

const importInputRef = ref<HTMLInputElement | null>(null)

function onImportFile(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('import-project', file)
    input.value = ''
  }
}

function loadLabel(): string {
  if (props.loadEstimate.level === 'LIGHT') return 'Beban Perkiraan: Ringan'
  if (props.loadEstimate.level === 'MEDIUM') return 'Beban Perkiraan: Sedang'
  if (props.loadEstimate.level === 'HEAVY') return 'Beban Perkiraan: Berat'
  return 'Beban Perkiraan: Maksimum'
}

function loadAlertClass(): string {
  if (props.loadEstimate.level === 'LIGHT') return 'alert-success'
  if (props.loadEstimate.level === 'MEDIUM') return 'alert-info'
  if (props.loadEstimate.level === 'HEAVY') return 'alert-warning'
  return 'alert-error'
}
</script>

<template>
  <div class="col-gap">
    <!-- Estimasi Beban -->
    <div class="alert" :class="loadAlertClass()">
      <div>
        <strong>{{ loadLabel() }}</strong>
        <p v-if="loadEstimate.recommendSaver" class="hint-text" style="margin-top: 3px; color: inherit">
          Kombinasi sumber cukup berat. Disarankan 720p 30 fps agar frame tetap stabil.
        </p>
      </div>
    </div>

    <!-- Preset & Resolusi -->
    <div class="card">
      <div class="section-label">Preset Kualitas</div>
      <div class="chip-group">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          class="chip"
          :class="{ active: project.activePresetId === p.id }"
          type="button"
          :disabled="recording"
          @click="emit('set-preset', p.id)"
        >
          {{ p.label }}
        </button>
      </div>

      <p v-if="recording" class="hint-text" style="margin-top: 8px; color: var(--warning)">
        Hentikan rekaman terlebih dahulu untuk mengubah resolusi atau orientasi kanvas.
      </p>

      <div class="section-label">Resolusi &amp; Frame Rate</div>
      <div class="col-gap" style="gap: 6px">
        <label
          v-for="res in RESOLUTIONS"
          :key="res.id"
          class="radio-row"
          :class="{ active: project.resolutionId === res.id, disabled: recording }"
        >
          <input
            type="radio"
            name="res-opt"
            :disabled="recording"
            :checked="project.resolutionId === res.id"
            @change="emit('set-resolution', res.id)"
          />
          <span>{{ res.label }}</span>
        </label>
      </div>

      <div class="section-label">Orientasi Kanvas Output</div>
      <div class="chip-group">
        <button
          class="chip"
          :class="{ active: !project.canvasPortrait }"
          type="button"
          :disabled="recording"
          @click="emit('set-portrait', false)"
        >
          Lanskap (16:9)
        </button>
        <button
          class="chip"
          :class="{ active: project.canvasPortrait }"
          type="button"
          :disabled="recording"
          @click="emit('set-portrait', true)"
        >
          Potret (9:16)
        </button>
      </div>

      <div class="section-label">Transisi Antar Scene</div>
      <div class="chip-group">
        <button
          class="chip"
          :class="{ active: project.transition === 'CUT' }"
          type="button"
          @click="emit('set-transition', 'CUT')"
        >
          Potong Langsung (Cut)
        </button>
        <button
          class="chip"
          :class="{ active: project.transition === 'FADE' }"
          type="button"
          @click="emit('set-transition', 'FADE')"
        >
          Pudar 0,3 detik (Fade)
        </button>
      </div>

      <div class="divider"></div>
      <label class="row-between" style="cursor: pointer; font-size: 13px">
        <span>Mode Hemat Pratinjau (15 fps)</span>
        <input
          type="checkbox"
          :checked="previewLowPower"
          @change="emit('set-low-power', ($event.target as HTMLInputElement).checked)"
        />
      </label>
    </div>

    <!-- Pengaturan Layar Pratinjau (Multi-Monitor) -->
    <div class="card">
      <div class="card-title-row">
        <div class="row-gap">
          <Monitor :size="15" color="#3D6FA5" />
          <h3 class="card-title">Layar Pratinjau (Multi-Monitor)</h3>
        </div>
        <button
          v-if="supportsMultiScreenApi"
          class="btn btn-sm"
          type="button"
          @click="emit('detect-screens')"
        >
          <RefreshCw :size="13" />
          <span>Deteksi</span>
        </button>
      </div>

      <div class="col-gap" style="gap: 6px; margin-bottom: 10px">
        <label
          v-for="scr in screens"
          :key="scr.id"
          class="radio-row"
          :class="{ active: scr.id === selectedScreenId }"
        >
          <input
            type="radio"
            name="settings-screen"
            :checked="scr.id === selectedScreenId"
            @change="emit('select-screen', scr.id)"
          />
          <span>{{ scr.label }}</span>
        </label>
      </div>

      <button
        class="btn btn-accent-outline btn-sm"
        style="width: 100%"
        type="button"
        @click="emit('open-projector')"
      >
        Buka Jendela Proyektor di Layar Terpilih
      </button>
    </div>

    <!-- Ekspor / Impor Proyek JSON (Tanpa Database) -->
    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Proyek Lokal (JSON)</h3>
      </div>
      <p class="hint-text" style="margin-bottom: 10px">
        Seluruh scene dan preset tersimpan lokal di browser tanpa database. Anda dapat mencadangkan atau memindahkan konfigurasi sebagai berkas JSON.
      </p>
      <div class="row-gap">
        <button class="btn btn-sm" style="flex: 1" type="button" @click="emit('export-project')">
          <Download :size="14" />
          <span>Ekspor JSON</span>
        </button>
        <button
          class="btn btn-sm"
          style="flex: 1"
          type="button"
          @click="importInputRef?.click()"
        >
          <Upload :size="14" />
          <span>Impor JSON</span>
        </button>
      </div>
      <input
        ref="importInputRef"
        type="file"
        accept="application/json"
        style="display: none"
        @change="onImportFile"
      />
    </div>
  </div>
</template>

<style scoped>
.radio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
}

.radio-row.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.radio-row.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
