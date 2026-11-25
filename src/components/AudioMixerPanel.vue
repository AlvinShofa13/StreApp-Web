<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Mic, MicOff, Plus, Trash2 } from 'lucide-vue-next'
import type { AudioChannelInfo, MonitorMode } from '../types/studio'

const props = defineProps<{
  channels: AudioChannelInfo[]
  audioDevices: MediaDeviceInfo[]
}>()

const emit = defineEmits<{
  (e: 'add-mic', deviceId?: string, label?: string): void
  (e: 'set-gain', id: string, gain: number): void
  (e: 'toggle-mute', id: string, muted: boolean): void
  (e: 'set-monitor', id: string, mode: MonitorMode): void
  (e: 'remove', id: string): void
}>()

const anyMonitoring = computed(() =>
  props.channels.some((c) => c.monitor !== 'OFF'),
)

const monitorModes: Array<{ id: MonitorMode; label: string }> = [
  { id: 'OFF', label: 'Mati' },
  { id: 'MONITOR_ONLY', label: 'Hanya Monitor' },
  { id: 'MONITOR_AND_RECORD', label: 'Monitor & Rekam' },
]

function meterColor(ch: AudioChannelInfo): string {
  if (ch.muted) return '#E2E6EA'
  if (ch.level > 0.85) return '#C0504D'
  if (ch.level > 0.65) return '#C98A2B'
  return '#4F8A6B'
}
</script>

<template>
  <div class="col-gap">
    <div v-if="anyMonitoring" class="alert alert-warning">
      <AlertTriangle :size="17" style="flex-shrink: 0; color: var(--warning)" />
      <span>Gunakan headphone saat monitoring aktif untuk mencegah umpan balik suara (feedback) dari speaker.</span>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3 class="card-title">Mixer Audio</h3>
        <button class="btn btn-accent-outline btn-sm" type="button" @click="emit('add-mic')">
          <Plus :size="14" />
          <span>Tambah Mikrofon</span>
        </button>
      </div>

      <p v-if="channels.length === 0" class="hint-text">
        Belum ada saluran audio aktif. Klik Tambah Mikrofon, atau tambahkan sumber Rekam Layar dengan centang Bagikan Audio Tab/Sistem.
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
                <Mic v-else :size="15" color="#3D6FA5" />
              </button>
              <div>
                <div style="font-size: 13px; font-weight: 600">{{ ch.label }}</div>
                <div style="font-size: 11px; color: var(--text-secondary)">
                  Gain {{ Math.round(ch.gain * 100) }}%
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
              :class="{ active: ch.monitor === m.id }"
              type="button"
              @click="emit('set-monitor', ch.id, m.id)"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
      </div>

      <template v-if="audioDevices.length > 1">
        <div class="divider"></div>
        <div class="section-label">Tambah Perangkat Audio Spesifik (USB / Headset)</div>
        <div class="chip-group">
          <button
            v-for="(dev, idx) in audioDevices"
            :key="dev.deviceId || idx"
            class="chip"
            type="button"
            @click="emit('add-mic', dev.deviceId, dev.label || `Audio Input ${idx + 1}`)"
          >
            + {{ dev.label || `Audio Input ${idx + 1}` }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
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
