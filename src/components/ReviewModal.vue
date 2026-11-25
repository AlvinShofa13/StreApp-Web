<script setup lang="ts">
import { Bookmark, Download, X } from 'lucide-vue-next'
import type { RecordingResult } from '../types/studio'

const props = defineProps<{
  recording: RecordingResult
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

function downloadVideo(): void {
  const a = document.createElement('a')
  a.href = props.recording.url
  a.download = props.recording.filename
  a.click()
}

function downloadMarkers(): void {
  const blob = new Blob([JSON.stringify(props.recording.markers, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = props.recording.filename.replace(/\.[^.]+$/, '.markers.json')
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card" style="max-width: 600px">
      <div class="modal-header">
        <h3 class="modal-title">Pratinjau &amp; Unduh Rekaman</h3>
        <button class="btn btn-icon btn-sm" type="button" @click="emit('close')">
          <X :size="15" />
        </button>
      </div>

      <video
        class="review-video"
        :src="recording.url"
        controls
        autoplay
        playsinline
      ></video>

      <div class="review-meta">
        <div><strong>{{ recording.filename }}</strong></div>
        <div class="hint-text">
          Durasi {{ formatDuration(recording.durationMs) }} • Ukuran {{ formatSize(recording.sizeBytes) }} • {{ recording.mimeType }}
        </div>
      </div>

      <div class="modal-footer">
        <button
          v-if="recording.markers.length > 0"
          class="btn"
          type="button"
          @click="downloadMarkers"
        >
          <Bookmark :size="15" />
          <span>Unduh Penanda ({{ recording.markers.length }})</span>
        </button>
        <button class="btn btn-primary" type="button" @click="downloadVideo">
          <Download :size="15" />
          <span>Unduh Video</span>
        </button>
        <button class="btn" type="button" @click="emit('close')">Tutup</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-video {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  background: #000000;
  display: block;
}

.review-meta {
  margin-top: 12px;
  font-size: 13px;
}
</style>
