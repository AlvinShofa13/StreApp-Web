<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowLeft, Camera, Check, Copy, RefreshCw, Wifi } from 'lucide-vue-next'
import { WifiNodeSession, type WifiPairingStatus } from '../engine/wifiPairing'

const emit = defineEmits<{
  (e: 'exit'): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const facingMode = ref<'environment' | 'user'>('environment')
const portraitMode = ref(true)
const sendAudio = ref(false)
const offerInput = ref('')
const answerCode = ref('')
const status = ref<WifiPairingStatus>('IDLE')
const statusMsg = ref('')
const copied = ref(false)

let localStream: MediaStream | null = null
const nodeSession = new WifiNodeSession()
nodeSession.onStatus = (st, msg) => {
  status.value = st
  if (msg) statusMsg.value = msg
}

async function startLocalCamera(): Promise<void> {
  stopLocalCamera()
  statusMsg.value = ''
  try {
    const videoConstraint: MediaTrackConstraints = {
      facingMode: { ideal: facingMode.value },
      width: { ideal: portraitMode.value ? 720 : 1280 },
      height: { ideal: portraitMode.value ? 1280 : 720 },
      frameRate: { ideal: 30 },
    }
    localStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraint,
      audio: sendAudio.value,
    })
    if (videoRef.value) {
      videoRef.value.srcObject = localStream
      await videoRef.value.play()
    }
  } catch (e) {
    statusMsg.value = e instanceof Error ? `Gagal membuka kamera: ${e.message}` : 'Gagal membuka kamera.'
  }
}

function stopLocalCamera(): void {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop())
    localStream = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

async function switchCamera(): Promise<void> {
  facingMode.value = facingMode.value === 'environment' ? 'user' : 'environment'
  await startLocalCamera()
}

async function setOrientation(portrait: boolean): Promise<void> {
  if (portraitMode.value === portrait) return
  portraitMode.value = portrait
  await startLocalCamera()
}

async function generateAnswer(): Promise<void> {
  if (!offerInput.value.trim()) {
    statusMsg.value = 'Tempel Kode Offer dari Host terlebih dahulu.'
    return
  }
  if (!localStream) {
    await startLocalCamera()
  }
  if (!localStream) return
  statusMsg.value = ''
  try {
    answerCode.value = await nodeSession.createAnswerFromOffer(offerInput.value, localStream)
  } catch (e) {
    status.value = 'ERROR'
    statusMsg.value = e instanceof Error ? e.message : 'Gagal membuat Kode Answer.'
  }
}

async function copyAnswer(): Promise<void> {
  if (!answerCode.value) return
  try {
    await navigator.clipboard.writeText(answerCode.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 2000)
  } catch {
    statusMsg.value = 'Salin kode dari kotak di bawah secara manual.'
  }
}

function disconnect(): void {
  nodeSession.close()
  answerCode.value = ''
  statusMsg.value = ''
}

onMounted(() => {
  // Jika dibuka lewat tautan ?wifiNode=1#offer=..., otomatis isi Kode Offer
  if (window.location.hash.includes('offer=')) {
    offerInput.value = window.location.href
  }
  void startLocalCamera()
})

onBeforeUnmount(() => {
  nodeSession.close()
  stopLocalCamera()
})
</script>

<template>
  <div class="node-shell">
    <header class="topbar">
      <div class="row-gap">
        <button class="btn btn-sm" type="button" @click="emit('exit')">
          <ArrowLeft :size="15" />
          <span>Kembali ke Studio</span>
        </button>
        <div class="topbar-title" style="font-size: 15px">Mode Kamera Wi-Fi (Pengirim)</div>
      </div>
      <span
        class="badge"
        :class="status === 'CONNECTED' ? 'badge-success' : status === 'ERROR' ? 'badge-record' : 'badge-accent'"
      >
        <Wifi :size="12" />
        <span>
          {{
            status === 'CONNECTED'
              ? 'Tersambung'
              : status === 'WAITING_ANSWER'
                ? 'Kirim Kode Answer'
                : status === 'PREPARING'
                  ? 'Menyiapkan…'
                  : 'Siaga'
          }}
        </span>
      </span>
    </header>

    <main class="node-body">
      <div v-if="statusMsg" class="alert alert-warning">{{ statusMsg }}</div>

      <div class="card">
        <div class="preview-frame" :class="{ portrait: portraitMode }">
          <video ref="videoRef" muted playsinline autoplay class="node-video"></video>
        </div>

        <div class="chip-group" style="margin-top: 12px">
          <button class="btn btn-sm" type="button" @click="switchCamera">
            <RefreshCw :size="14" />
            <span>{{ facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan' }}</span>
          </button>
          <button
            class="chip"
            :class="{ active: portraitMode }"
            type="button"
            @click="setOrientation(true)"
          >
            Potret (9:16)
          </button>
          <button
            class="chip"
            :class="{ active: !portraitMode }"
            type="button"
            @click="setOrientation(false)"
          >
            Lanskap (16:9)
          </button>
          <label class="row-gap" style="font-size: 12px; color: var(--text-secondary); margin-left: auto">
            <input v-model="sendAudio" type="checkbox" @change="startLocalCamera()" />
            <span>Kirim Audio Mic</span>
          </label>
        </div>
      </div>

      <div class="card col-gap">
        <div class="row-gap">
          <Camera :size="16" color="#3D6FA5" />
          <h3 class="card-title">Sambungkan ke Host Studio Web (Wi-Fi)</h3>
        </div>
        <p class="hint-text">
          1. Di perangkat Host (Laptop/PC), buka tab Pengaturan -> <strong>Buat Sesi Wi-Fi (Host)</strong> lalu salin Kode Offer.<br />
          2. Tempel Kode Offer di bawah, lalu ketuk <strong>Buat Kode Answer</strong> dan kirimkan hasilnya ke Host.
        </p>

        <textarea
          v-model="offerInput"
          class="input code-box"
          rows="3"
          placeholder="Tempel Kode Offer atau tautan dari Host di sini…"
        ></textarea>

        <div class="row-gap">
          <button class="btn btn-primary" style="flex: 1" type="button" @click="generateAnswer">
            Buat Kode Answer
          </button>
          <button v-if="status !== 'IDLE'" class="btn btn-sm" type="button" @click="disconnect">
            Putus
          </button>
        </div>

        <template v-if="answerCode">
          <div class="section-label">Kode Answer (Salin &amp; Tempel di Host)</div>
          <textarea
            :value="answerCode"
            class="input code-box"
            rows="3"
            readonly
          ></textarea>
          <button class="btn btn-accent-outline" type="button" @click="copyAnswer">
            <Check v-if="copied" :size="15" />
            <Copy v-else :size="15" />
            <span>{{ copied ? 'Kode Answer Tersalin' : 'Salin Kode Answer' }}</span>
          </button>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.node-shell {
  min-height: 100vh;
  background: var(--bg);
}

.node-body {
  max-width: 680px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preview-frame {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #141c24;
  border-radius: 12px;
  overflow: hidden;
  margin: 0 auto;
}

.preview-frame.portrait {
  max-width: 260px;
  aspect-ratio: 9 / 16;
}

.node-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.code-box {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  resize: vertical;
}
</style>
