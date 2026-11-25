<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Info, MessageSquare, Radio } from 'lucide-vue-next'
import type { ChatConnectionState, ChatMessage } from '../types/studio'

const props = defineProps<{
  messages: ChatMessage[]
  status: ChatConnectionState
  filterBots: boolean
  filterCommands: boolean
}>()

const emit = defineEmits<{
  (e: 'connect-twitch', channel: string): void
  (e: 'connect-demo'): void
  (e: 'disconnect'): void
  (e: 'toggle-bots', val: boolean): void
  (e: 'toggle-commands', val: boolean): void
}>()

const twitchChannel = ref('')
const chatBoxRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

watch(
  () => props.messages.length,
  async () => {
    if (!autoScroll.value) return
    await nextTick()
    const el = chatBoxRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

function onChatScroll(): void {
  const el = chatBoxRef.value
  if (!el) return
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

function jumpToLatest(): void {
  const el = chatBoxRef.value
  if (!el) return
  autoScroll.value = true
  el.scrollTop = el.scrollHeight
}

function statusLabel(): string {
  if (props.status === 'CONNECTED') return 'Tersambung'
  if (props.status === 'CONNECTING') return 'Menyambungkan...'
  if (props.status === 'ERROR') return 'Galat'
  return 'Terputus'
}
</script>

<template>
  <div class="col-gap">
    <!-- Penjelasan Jujur Batasan RTMP Web -->
    <div class="card">
      <div class="card-title-row">
        <div class="row-gap">
          <Radio :size="15" color="#3D6FA5" />
          <h3 class="card-title">Siaran Langsung (Web)</h3>
        </div>
      </div>
      <div class="alert alert-info">
        <Info :size="16" style="flex-shrink: 0" />
        <span>
          Browser web tidak mengizinkan koneksi RTMP/RTMPS mentah tanpa server relay eksternal. Versi web statis (Vercel) ini berfokus pada <strong>rekaman lokal multi-sumber</strong>, <strong>proyektor multi-layar</strong>, dan <strong>Chat Langsung Privat</strong>. Untuk siaran RTMP langsung tanpa relay, gunakan aplikasi Android <strong>StreApp</strong>.
        </span>
      </div>
    </div>

    <!-- Panel Chat Privat Baca-Saja -->
    <div class="card">
      <div class="card-title-row">
        <div class="row-gap">
          <MessageSquare :size="15" color="#3D6FA5" />
          <h3 class="card-title">Chat Langsung (Hanya Anda)</h3>
        </div>
        <span
          class="badge"
          :class="{
            'badge-success': status === 'CONNECTED',
            'badge-warning': status === 'CONNECTING',
            'badge-record': status === 'ERROR',
          }"
        >
          {{ statusLabel() }}
        </span>
      </div>

      <p class="hint-text" style="margin-bottom: 10px">
        Hanya terlihat di layar Anda. Tidak masuk kanvas, tidak terekam, dan dibatasi 200 pesan terbaru di memori.
      </p>

      <div class="row-gap" style="margin-bottom: 8px">
        <input
          v-model="twitchChannel"
          class="input"
          type="text"
          placeholder="Nama kanal Twitch (tanpa #)"
          @keyup.enter="emit('connect-twitch', twitchChannel)"
        />
        <button
          v-if="status === 'DISCONNECTED' || status === 'ERROR'"
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="!twitchChannel.trim()"
          @click="emit('connect-twitch', twitchChannel)"
        >
          Sambung
        </button>
        <button
          v-else
          class="btn btn-danger-outline btn-sm"
          type="button"
          @click="emit('disconnect')"
        >
          Putus
        </button>
      </div>

      <div class="chip-group" style="margin-bottom: 10px">
        <button
          v-if="status === 'DISCONNECTED' || status === 'ERROR'"
          class="chip"
          type="button"
          @click="emit('connect-demo')"
        >
          Uji Chat Tiruan
        </button>
        <button
          class="chip"
          :class="{ active: filterBots }"
          type="button"
          @click="emit('toggle-bots', !filterBots)"
        >
          Saring Bot
        </button>
        <button
          class="chip"
          :class="{ active: filterCommands }"
          type="button"
          @click="emit('toggle-commands', !filterCommands)"
        >
          Saring Perintah (!)
        </button>
      </div>

      <div ref="chatBoxRef" class="chat-feed" @scroll="onChatScroll">
        <p v-if="messages.length === 0" class="hint-text">Belum ada pesan chat.</p>
        <div v-for="msg in messages" :key="msg.id" class="chat-line">
          <span v-if="msg.role === 'MOD' || msg.role === 'HOST'" class="role-tag">
            {{ msg.role }}
          </span>
          <strong class="chat-author">{{ msg.author }}:</strong>
          <span class="chat-text">{{ msg.text }}</span>
        </div>
      </div>

      <button
        v-if="!autoScroll && messages.length > 0"
        class="btn btn-sm btn-accent-outline"
        style="margin-top: 8px; width: 100%"
        type="button"
        @click="jumpToLatest"
      >
        Kembali ke Pesan Terbaru
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-feed {
  height: 210px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-line {
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.role-tag {
  display: inline-block;
  margin-right: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
}

.chat-author {
  margin-right: 5px;
  color: var(--text);
}

.chat-text {
  color: var(--text-secondary);
}
</style>
