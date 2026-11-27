<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  BookmarkPlus,
  Layers,
  PanelRight,
  Radio,
  Sliders,
  SlidersHorizontal,
  X,
} from 'lucide-vue-next'
import { useStudio } from './composables/useStudio'
import InteractiveCanvas from './components/InteractiveCanvas.vue'
import SceneStrip from './components/SceneStrip.vue'
import SourcesPanel from './components/SourcesPanel.vue'
import AudioMixerPanel from './components/AudioMixerPanel.vue'
import StreamChatPanel from './components/StreamChatPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ReviewModal from './components/ReviewModal.vue'
import WifiCameraNodeView from './components/WifiCameraNodeView.vue'

type DockTab = 'SOURCES' | 'MIXER' | 'STREAM' | 'SETTINGS'

const studio = useStudio()
const activeTab = ref<DockTab>('SOURCES')
const showDock = ref(true)
const isWifiNodeMode = ref(
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('wifiNode') === '1',
)

function openWifiPairingInSettings(): void {
  activeTab.value = 'SETTINGS'
  showDock.value = true
  if (!studio.wifiOfferCode.value) {
    void studio.startWifiHost()
  }
}

const recDurationShort = computed(() => {
  const sec = Math.floor(studio.recordingMs.value / 1000)
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
})

const loadBadgeClass = computed(() => {
  const lv = studio.loadEstimate.value.level
  if (lv === 'LIGHT') return 'badge-success'
  if (lv === 'MEDIUM') return 'badge-accent'
  if (lv === 'HEAVY') return 'badge-warning'
  return 'badge-record'
})

const loadBadgeText = computed(() => {
  const lv = studio.loadEstimate.value.level
  if (lv === 'LIGHT') return 'Beban: Ringan'
  if (lv === 'MEDIUM') return 'Beban: Sedang'
  if (lv === 'HEAVY') return 'Beban: Berat'
  return 'Beban: Maksimum'
})
</script>

<template>
  <WifiCameraNodeView v-if="isWifiNodeMode" @exit="isWifiNodeMode = false" />
  <div v-else class="app-shell">
    <!-- Top Bar -->
    <header class="topbar">
      <div class="topbar-brand">
        <img src="/logo.png" alt="StreApp" class="topbar-logo" />
        <div>
          <div class="topbar-title">StreApp Web</div>
          <div class="topbar-subtitle">Studio Multi-Sumber Ringkas</div>
        </div>
      </div>

      <div class="topbar-actions">
        <span class="badge" :class="loadBadgeClass">{{ loadBadgeText }}</span>

        <button
          class="btn btn-sm"
          :class="{ 'btn-accent-outline': studio.showDebug.value }"
          type="button"
          @click="studio.showDebug.value = !studio.showDebug.value"
        >
          <Activity :size="14" />
          <span>FPS</span>
        </button>

        <button
          class="btn btn-sm"
          :class="{ 'btn-accent-outline': showDock }"
          type="button"
          @click="showDock = !showDock"
        >
          <PanelRight :size="14" />
          <span>Panel</span>
        </button>
      </div>
    </header>

    <!-- Main Workspace -->
    <main class="workspace" :class="{ 'dock-hidden': !showDock }">
      <!-- Kolom Kiri: Kanvas Pratinjau + Strip Scene + Kontrol Rekam -->
      <section class="stage-col">
        <div v-if="studio.errorMessage.value" class="alert alert-error row-between">
          <span>{{ studio.errorMessage.value }}</span>
          <button
            class="btn btn-icon btn-sm"
            type="button"
            @click="studio.errorMessage.value = null"
          >
            <X :size="14" />
          </button>
        </div>

        <InteractiveCanvas
          :canvas-element="studio.compositor.element"
          :sources="studio.activeScene.value?.sources ?? []"
          :selected-source-id="studio.selectedSourceId.value"
          :scene-name="studio.activeScene.value?.name ?? 'Scene'"
          :resolution-label="studio.activeResolution.value.shortLabel"
          :output-width="studio.outputWidth.value"
          :output-height="studio.outputHeight.value"
          :recording="studio.recording.value"
          :recording-ms="studio.recordingMs.value"
          :preview-enabled="studio.previewEnabled.value"
          :canvas-locked="studio.canvasLocked.value"
          :screens="studio.screens.value"
          :selected-screen-id="studio.selectedScreenId.value"
          :multi-screen-detected="studio.multiScreenDetected.value"
          :supports-multi-screen-api="studio.supportsMultiScreenApi"
          :projector-open="studio.projectorOpen.value"
          :is-fullscreen="studio.isFullscreen.value"
          :show-debug="studio.showDebug.value"
          :actual-fps="studio.stats.actualFps"
          :dropped-frames="studio.stats.droppedFrames"
          :memory-mb="studio.stats.memoryMb"
          @toggle-lock="studio.canvasLocked.value = !studio.canvasLocked.value"
          @toggle-preview="studio.setPreviewEnabled(!studio.previewEnabled.value)"
          @select-source="studio.selectedSourceId.value = $event"
          @update-transform="studio.updateSourceTransform"
          @detect-screens="studio.detectScreens"
          @select-screen="studio.selectedScreenId.value = $event"
          @toggle-fullscreen="studio.toggleFullscreenPreview"
          @open-projector="studio.openProjectorOnSelectedScreen"
          @close-projector="studio.closeProjector"
        />

        <SceneStrip
          :scenes="studio.project.value.scenes"
          :active-scene-id="studio.project.value.activeSceneId"
          @select="studio.setActiveScene"
          @add="studio.addScene()"
          @rename="studio.renameScene"
          @duplicate="studio.duplicateScene"
          @remove="studio.removeScene"
        />

        <!-- Bilah Kontrol Rekam (bentuk lingkaran -> kotak + label) -->
        <div class="transport-bar">
          <button
            class="btn record-main-btn"
            :class="studio.recording.value ? 'btn-record' : 'btn-primary'"
            type="button"
            @click="studio.toggleRecording"
          >
            <span class="record-shape" :class="{ square: studio.recording.value }"></span>
            <span>
              {{ studio.recording.value ? `Hentikan Rekam • ${recDurationShort}` : 'Mulai Rekam' }}
            </span>
          </button>

          <button
            v-if="studio.recording.value"
            class="btn btn-accent-outline"
            style="min-height: 50px"
            type="button"
            @click="studio.addMarker"
          >
            <BookmarkPlus :size="17" />
            <span>Penanda ({{ studio.markerCount.value }})</span>
          </button>
        </div>
      </section>

      <!-- Kolom Kanan: Dock OBS 4 Tab -->
      <aside v-if="showDock" class="dock-col">
        <nav class="dock-tabs" aria-label="Panel Studio">
          <button
            class="dock-tab"
            :class="{ active: activeTab === 'SOURCES' }"
            type="button"
            @click="activeTab = 'SOURCES'"
          >
            <Layers :size="17" />
            <span>Sumber</span>
          </button>
          <button
            class="dock-tab"
            :class="{ active: activeTab === 'MIXER' }"
            type="button"
            @click="activeTab = 'MIXER'"
          >
            <SlidersHorizontal :size="17" />
            <span>Mixer</span>
          </button>
          <button
            class="dock-tab"
            :class="{ active: activeTab === 'STREAM' }"
            type="button"
            @click="activeTab = 'STREAM'"
          >
            <Radio :size="17" />
            <span>Siaran &amp; Chat</span>
          </button>
          <button
            class="dock-tab"
            :class="{ active: activeTab === 'SETTINGS' }"
            type="button"
            @click="activeTab = 'SETTINGS'"
          >
            <Sliders :size="17" />
            <span>Pengaturan</span>
          </button>
        </nav>

        <SourcesPanel
          v-if="activeTab === 'SOURCES'"
          :sources="studio.activeScene.value?.sources ?? []"
          :selected-source-id="studio.selectedSourceId.value"
          :statuses="studio.sourceStatuses"
          :video-devices="studio.videoDevices.value"
          @select="studio.selectedSourceId.value = $event"
          @add-camera="studio.addCameraOrCaptureCard"
          @add-screen="studio.addScreenCapture"
          @add-text="studio.addTextOverlay"
          @add-image="studio.addImageOverlay"
          @add-video="studio.addVideoOverlay"
          @open-wifi-pairing="openWifiPairingInSettings"
          @add-test="studio.addTestPattern"
          @refresh-devices="studio.refreshDevices"
          @update-transform="studio.updateSourceTransform"
          @toggle-visible="studio.setSourceVisible"
          @set-shape="studio.setSourceShape"
          @toggle-mirror="studio.toggleSourceMirror"
          @fit-full="studio.resetSourceFullScreen"
          @center="studio.centerSource"
          @move-layer="studio.moveSourceLayer"
          @remove="studio.removeSource"
          @apply-template="studio.applyTemplate"
        />

        <AudioMixerPanel
          v-else-if="activeTab === 'MIXER'"
          :channels="studio.audioChannels.value"
          :audio-devices="studio.audioDevices.value"
          :headphones-confirmed="studio.headphonesConfirmed.value"
          @add-mic="studio.addMicSource"
          @add-external="studio.addExternalAudioSource"
          @refresh-devices="studio.refreshDevices"
          @set-headphones="studio.setHeadphonesConfirmed"
          @set-gain="(id, g) => studio.audioMixer.setGain(id, g)"
          @toggle-mute="(id, m) => studio.audioMixer.setMuted(id, m)"
          @set-monitor="(id, mode) => studio.audioMixer.setMonitor(id, mode)"
          @remove="(id) => studio.audioMixer.removeChannel(id)"
        />

        <StreamChatPanel
          v-else-if="activeTab === 'STREAM'"
          :messages="studio.chatMessages.value"
          :status="studio.chatStatus.value"
          :filter-bots="studio.chatFilterBots.value"
          :filter-commands="studio.chatFilterCommands.value"
          @connect-twitch="(ch) => studio.chatClient.connectTwitch(ch)"
          @connect-demo="studio.chatClient.connectDemo()"
          @disconnect="studio.chatClient.disconnect()"
          @toggle-bots="(v) => { studio.chatFilterBots.value = v; studio.chatClient.filterBots = v }"
          @toggle-commands="(v) => { studio.chatFilterCommands.value = v; studio.chatClient.filterCommands = v }"
        />

        <SettingsPanel
          v-else
          :project="studio.project.value"
          :recording="studio.recording.value"
          :preview-low-power="studio.previewLowPower.value"
          :load-estimate="studio.loadEstimate.value"
          :screens="studio.screens.value"
          :selected-screen-id="studio.selectedScreenId.value"
          :supports-multi-screen-api="studio.supportsMultiScreenApi"
          :wifi-host-status="studio.wifiHostStatus.value"
          :wifi-offer-code="studio.wifiOfferCode.value"
          :wifi-share-url="studio.wifiShareUrl.value"
          :wifi-error="studio.wifiError.value"
          @set-preset="studio.setPreset"
          @set-resolution="studio.setResolution"
          @set-portrait="studio.setCanvasPortrait"
          @set-transition="(t) => studio.setTransition(t)"
          @set-low-power="studio.setPreviewLowPower"
          @detect-screens="studio.detectScreens"
          @select-screen="studio.selectedScreenId.value = $event"
          @open-projector="studio.openProjectorOnSelectedScreen"
          @start-wifi-host="studio.startWifiHost"
          @accept-wifi-answer="studio.acceptWifiAnswer"
          @stop-wifi-host="studio.stopWifiHost"
          @open-wifi-node-mode="isWifiNodeMode = true"
          @export-project="studio.exportProjectJson"
          @import-project="studio.importProjectJson"
        />
      </aside>
    </main>

    <!-- Modal Pratinjau & Unduh Hasil Rekaman -->
    <ReviewModal
      v-if="studio.reviewRecording.value"
      :recording="studio.reviewRecording.value"
      @close="studio.closeReview"
    />
  </div>
</template>

<style scoped>
.transport-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.record-main-btn {
  flex: 1;
  min-height: 50px;
  font-size: 15px;
  font-weight: 700;
}

.record-shape {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #FFFFFF;
  transition: border-radius 0.15s ease;
}

.record-shape.square {
  border-radius: 3px;
}
</style>
