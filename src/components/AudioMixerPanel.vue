<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, Headphones, Mic, MicOff, Plus, Trash2, Usb } from 'lucide-vue-next'
import type { AudioChannelInfo, MonitorMode } from '../types/studio'

const props = defineProps<{
  channels: AudioChannelInfo[]
  audioDevices: MediaDeviceInfo[]
  headphonesConfirmed: boolean
}>()

const emit = defineEmits<{
  (e: 'add-mic', deviceId?: string, label?: string): void
  (e: 'add-external', deviceId?: string, label?: string): void
  (e: 'refresh-devices'): void
  (e: 'set-headphones', confirmed: boolean): void
  (e: 'set-gain', id: string, gain: number): void
  (e: 'toggle-mute', id: string, muted: boolean): void
  (e: 'set-monitor', id: string, mode: MonitorMode): void
  (e: 'remove', id: string): void
}>()

const showExternalPicker = ref(false)

const micMonitoringBlocked = computed(
  () => !props.headphonesConfirmed && props.channels.some((c) => c.kind === 'MIC' && c.monitor !== 'OFF'),
)

const monitorModes: Array<{ id: MonitorMode; label: string }> = [
  { id: 'OFF', label: 'Mati' },
  { id: 'MONITOR_ONLY', label: 'Hanya Monitor' },
  { id: 'MONITOR_AND_RECORD', label: 'Monitor & Rekam' },
]

function kindLabel(kind: AudioChannelInfo['kind']): string {
  if (kind === 'USB') return 'USB / Eksternal'
  if (kind === 'SCREEN') return 'Audio Layar'
  return 'Mikrofon'
}

function meterColor(ch: AudioChannelInfo): string {
  if (ch.muted) return '#E2E6EA'
  if (ch.level > 0.85) return '#C0504D'
  if (ch.level > 0.65) return '#C98A2B'
  return '#4F8A6B'
}

function openExternalPicker(): void {
  emit('refresh-devices')
  showExternalPicker.value = !showExternalPicker.value
}
</script>

<template>
  <div class="col-gap">
    <!-- Konfirmasi Headphone untuk Proteksi Anti-Feedback Mic -->
    <div class="card" style="padding: 10px 12px">
      <label class="row-between" style="cursor: pointer; font-size: 12px">
        <span class="row-gap">
          <Headphones :size="15" color="#3D6FA5" />
          <span>Saya memakai headphone (izinkan monitor mikrofon)</span>
        </span>
        <input
          type="checkbox"
          :checked="headphonesConfirmed"
          @change="emit('set-headphones', ($event.target as HTMLInputElement).checked)"
        />
      </label>
    </div>

    <div v-if="micMonitoringBlocked" class="alert alert-warning">
      <AlertTriangle :size="17" style="flex-shrink: 0; color: var(--warning)" />
      <span>
        Monitoring mikrofon diblokir otomatis saat tanpa headphone untuk mencegah bunyi dengung (feedback). Audio Capture Card / Eksternal dan Audio Layar tetap dapat didengar langsung.
      </span>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Mixer Audio</h3>
      </div>

      <!-- Tombol Terpisah: Mikrofon vs Audio Capture Card / Eksternal -->
      <div class="chip-group" style="margin-bottom: 12px">
        <button class="btn btn-accent-outline btn-sm" type="button" @click="emit('add-mic')">
          <Mic :size="14" />
          <span>+ Mikrofon</span>
        </button>
        <button class="btn btn-primary btn-sm" type="button" @click="openExternalPicker">
          <Usb :size="14" />
          <span>+ Audio Capture Card / Eksternal</span>
        </button>
      </div>

      <!-- Pemilih Perangkat Audio Eksternal / Capture Card -->
      <div v-if="showExternalPicker" class="ext-picker-box">
        <div class="section-label" style="margin-top: 0">Pilih Sumber Audio Capture Card / Eksternal</div>
        <p class="hint-text" style="margin-bottom: 8px">
          Audio eksternal akan ditambahkan terpisah dari mikrofon dengan mode <strong>Monitor &amp; Rekam</strong> aktif otomatis agar suara game/HDMI langsung terdengar jernih tanpa dengung.
        </p>
        <div v-if="audioDevices.length > 0" class="chip-group">
          <button
            v-for="(dev, idx) in audioDevices"
            :key="dev.deviceId || idx"
            class="chip"
            type="button"
            @click="emit('add-external', dev.deviceId, dev.label || `Audio Eksternal ${idx + 1}`); showExternalPicker = false"
          >
            <Plus :size="12" />
            <span>{{ dev.label || `Audio Eksternal ${idx + 1}` }}</span>
          </button>
        </div>
        <button
          v-else
          class="btn btn-sm btn-accent-outline"
          type="button"
          @click="emit('add-external'); showExternalPicker = false"
        >
          Minta Izin &amp; Deteksi Perangkat Audio
        </button>
      </div>

      <p v-if="channels.length === 0" class="hint-text">
        Belum ada saluran audio aktif. Tambahkan <strong>Mikrofon</strong> untuk suara Anda dan/atau <strong>Audio Capture Card / Eksternal</strong> secara terpisah.
      </p>

      <div v-else class="col-gap">
        <div v-for="ch in channels" :key="ch.id" class="channel-box">
          <div class="row-between">
            <div class="row-gap">
              <button
                class="btn btn-icon btn-sm"
                type="button"
                :title="ch.muted ? 'Aktifkan Suara' : 'Bisukan'"
                @click="emit('toggle-mute', ch.id, !ch.muted)"
              >
                <MicOff v-if="ch.muted" :size="15" color="#C0504D" />
                <Usb v-else-if="ch.kind === 'USB'" :size="15" color="#4F8A6B" />
                <Mic v-else :size="15" color="#3D6FA5" />
              </button>
              <div>
                <div style="font-size: 13px; font-weight: 600">{{ ch.label }}</div>
                <div style="font-size: 11px; color: var(--text-secondary)">
                  {{ kindLabel(ch.kind) }} • Gain {{ Math.round(ch.gain * 100) }}%
                </div>
              </div>
            </div>
            <button
              class="btn btn-icon btn-sm"
              type="button"
              title="Hapus Saluran"
              @click="emit('remove', ch.id)"
            >
              <Trash2 :size="14" color="#C0504D" />
            </button>
          </div>

          <div class="meter-track">
            <div
              class="meter-fill"
              :style="{
                width: `${ch.muted ? 0 : Math.round(ch.level * 100)}%`,
                background: meterColor(ch),
              }"
            ></div>
          </div>

          <input
            class="slider"
            type="range"
            min="0"
            max="2"
            step="0.05"
            :disabled="ch.muted"
            :value="ch.gain"
            @input="emit('set-gain', ch.id, Number(($event.target as HTMLInputElement).value))"
          />

          <div class="chip-group">
            <button
              v-for="m in monitorModes"
              :key="m.id"
              class="chip"
              :class="{ active: ch.monitor === m.id && (m.id === 'OFF' || ch.kind !== 'MIC' || headphonesConfirmed) }"
              :disabled="ch.kind === 'MIC' && !headphonesConfirmed && m.id !== 'OFF'"
              type="button"
              @click="emit('set-monitor', ch.id, m.id)"
            >
              {{ m.label }}
            </button>
          </div>

          <p
            v-if="ch.kind === 'MIC' && !headphonesConfirmed"
            class="hint-text"
            style="font-size: 11px"
          >
            Centang "Saya memakai headphone" di atas untuk mengaktifkan monitor mikrofon (mencegah bunyi nging). Rekaman mikrofon tetap aktif.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ext-picker-box {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  margin-bottom: 12px;
}

.channel-box {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meter-track {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  transition: width 0.08s linear;
}
</style>
