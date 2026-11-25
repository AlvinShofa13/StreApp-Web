import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import {
  PRESETS,
  RESOLUTIONS,
  clampTransform,
  createDefaultProject,
  newId,
  type AudioChannelInfo,
  type ChatConnectionState,
  type ChatMessage,
  type LayerShape,
  type PresetOption,
  type Project,
  type RecordingResult,
  type Scene,
  type SceneSource,
  type SceneTemplate,
  type SceneTransition,
  type ScreenTarget,
  type SourceStatus,
  type Transform,
} from '../types/studio'
import { CanvasCompositor } from '../engine/compositor'
import { WebAudioMixer } from '../engine/audioMixer'
import { StudioRecorder } from '../engine/recorder'
import { estimateLoad } from '../engine/loadEstimator'
import { ScreenProjectorManager } from '../engine/screenManager'
import { ChatClient, appendCappedMessage } from '../engine/chatClient'

const STORAGE_KEY = 'streapp-web-project-v1'

function loadSavedProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultProject()
    const parsed = JSON.parse(raw) as Project
    if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      return createDefaultProject()
    }
    if (!parsed.scenes.some((s) => s.id === parsed.activeSceneId)) {
      parsed.activeSceneId = parsed.scenes[0].id
    }
    return parsed
  } catch {
    return createDefaultProject()
  }
}

export function useStudio() {
  const project = ref<Project>(loadSavedProject())
  const selectedSourceId = ref<string | null>(null)
  const canvasLocked = ref(false)
  const previewEnabled = ref(true)
  const previewLowPower = ref(false)
  const showDebug = ref(false)
  const errorMessage = ref<string | null>(null)

  const recording = ref(false)
  const recordingMs = ref(0)
  const markerCount = ref(0)
  const reviewRecording = ref<RecordingResult | null>(null)

  const sourceStatuses = reactive<Record<string, SourceStatus>>({})
  const audioChannels = ref<AudioChannelInfo[]>([])
  const headphonesConfirmed = ref(false)
  const videoDevices = ref<MediaDeviceInfo[]>([])
  const audioDevices = ref<MediaDeviceInfo[]>([])

  // Multi-Screen & Fullscreen Projector state
  const projectorManager = new ScreenProjectorManager()
  const screens = ref<ScreenTarget[]>(projectorManager.getFallbackScreens())
  const selectedScreenId = ref<string>(screens.value[0]?.id ?? 'screen-current')
  const multiScreenDetected = ref(false)
  const projectorOpen = ref(false)
  const isFullscreen = ref(false)

  // Chat state (private read-only)
  const chatMessages = ref<ChatMessage[]>([])
  const chatStatus = ref<ChatConnectionState>('DISCONNECTED')
  const chatFilterBots = ref(false)
  const chatFilterCommands = ref(true)

  const stats = reactive({
    actualFps: 0,
    droppedFrames: 0,
    memoryMb: null as number | null,
  })

  const activeScene = computed<Scene | undefined>(() =>
    project.value.scenes.find((s) => s.id === project.value.activeSceneId) ?? project.value.scenes[0],
  )

  const activeResolution = computed(
    () => RESOLUTIONS.find((r) => r.id === project.value.resolutionId) ?? RESOLUTIONS[1],
  )

  const outputWidth = computed(() =>
    project.value.canvasPortrait ? activeResolution.value.height : activeResolution.value.width,
  )

  const outputHeight = computed(() =>
    project.value.canvasPortrait ? activeResolution.value.width : activeResolution.value.height,
  )

  const loadEstimate = computed(() =>
    estimateLoad(
      activeScene.value?.sources ?? [],
      activeResolution.value.width,
      activeResolution.value.fps,
    ),
  )

  const compositor = new CanvasCompositor(outputWidth.value, outputHeight.value)
  const audioMixer = new WebAudioMixer()
  const recorder = new StudioRecorder()
  const chatClient = new ChatClient(
    (msg) => {
      chatMessages.value = appendCappedMessage(chatMessages.value, msg)
    },
    (st) => {
      chatStatus.value = st
    },
  )

  compositor.setLayersProvider(() => activeScene.value?.sources ?? [])
  compositor.setFps(activeResolution.value.fps)
  compositor.start()

  function saveProject(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project.value))
    } catch {
      // Abaikan bila quota penuh
    }
  }

  async function refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      videoDevices.value = list.filter((d) => d.kind === 'videoinput')
      audioDevices.value = list.filter((d) => d.kind === 'audioinput')
    } catch {
      // Abaikan bila izin belum diberikan
    }
  }

  async function detectScreens(): Promise<void> {
    const res = await projectorManager.detectScreens()
    screens.value = res.screens
    multiScreenDetected.value = res.multiScreenGranted
    if (!screens.value.some((s) => s.id === selectedScreenId.value)) {
      // Pilih layar sekunder secara otomatis jika tersedia agar praktis untuk projector
      const secondary = screens.value.find((s) => !s.isPrimary)
      selectedScreenId.value = (secondary ?? screens.value[0])?.id ?? 'screen-current'
    }
  }

  async function toggleFullscreenPreview(containerEl: HTMLElement | null): Promise<void> {
    if (!containerEl) return
    const target = screens.value.find((s) => s.id === selectedScreenId.value)
    try {
      await projectorManager.enterFullscreenOnScreen(containerEl, target)
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Gagal masuk mode layar penuh.'
    }
  }

  function openProjectorOnSelectedScreen(): void {
    const target = screens.value.find((s) => s.id === selectedScreenId.value)
    const stream = compositor.captureStream(activeResolution.value.fps)
    const ok = projectorManager.openProjectorWindow(stream, target)
    if (!ok) {
      errorMessage.value = 'Popup proyektor diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.'
    } else {
      projectorOpen.value = true
    }
  }

  function closeProjector(): void {
    projectorManager.closeProjectorWindow()
    projectorOpen.value = false
  }

  // ---------------- Scene Management ----------------

  function setActiveScene(sceneId: string): void {
    if (project.value.activeSceneId === sceneId) return
    if (project.value.transition === 'FADE') {
      compositor.triggerFade(project.value.transitionMs)
      window.setTimeout(() => {
        project.value.activeSceneId = sceneId
        selectedSourceId.value = null
        saveProject()
      }, Math.max(50, project.value.transitionMs / 2))
    } else {
      project.value.activeSceneId = sceneId
      selectedSourceId.value = null
      saveProject()
    }
  }

  function addScene(name?: string): void {
    const nextName = name?.trim() || `Scene ${project.value.scenes.length + 1}`
    const id = newId()
    project.value.scenes.push({ id, name: nextName, sources: [] })
    project.value.activeSceneId = id
    selectedSourceId.value = null
    saveProject()
  }

  function renameScene(sceneId: string, name: string): void {
    const clean = name.trim()
    if (!clean) return
    const scene = project.value.scenes.find((s) => s.id === sceneId)
    if (scene) {
      scene.name = clean
      saveProject()
    }
  }

  function duplicateScene(sceneId: string): void {
    const idx = project.value.scenes.findIndex((s) => s.id === sceneId)
    if (idx < 0) return
    const orig = project.value.scenes[idx]
    const copy: Scene = {
      id: newId(),
      name: `${orig.name} (Salinan)`,
      sources: orig.sources.map((s) => ({
        ...s,
        id: newId(),
        transform: { ...s.transform },
      })),
    }
    project.value.scenes.splice(idx + 1, 0, copy)
    saveProject()
  }

  function removeScene(sceneId: string): void {
    if (project.value.scenes.length <= 1) return
    const target = project.value.scenes.find((s) => s.id === sceneId)
    target?.sources.forEach((s) => compositor.removeRuntime(s.id))
    project.value.scenes = project.value.scenes.filter((s) => s.id !== sceneId)
    if (project.value.activeSceneId === sceneId) {
      project.value.activeSceneId = project.value.scenes[0].id
      selectedSourceId.value = null
    }
    saveProject()
  }

  // ---------------- Source Management ----------------

  async function addCameraOrCaptureCard(deviceId?: string, label?: string): Promise<void> {
    const scene = activeScene.value
    if (!scene) return
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      await refreshDevices()

      const trackLabel = stream.getVideoTracks()[0]?.label || label || 'Kamera / Capture Card'
      const id = newId()
      const isFirst = scene.sources.length === 0
      const source: SceneSource = {
        id,
        type: 'CAMERA',
        name: trackLabel,
        deviceId: stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId,
        visible: true,
        mirrored: false,
        transform: isFirst
          ? { x: 0, y: 0, width: 1, height: 1 }
          : { x: 0.66, y: 0.62, width: 0.3, height: 0.33 },
        shape: isFirst ? 'RECT' : 'ROUNDED',
      }

      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        sourceStatuses[id] = 'DISCONNECTED'
      })

      compositor.setRuntime(id, { sourceId: id, video, stream })
      sourceStatuses[id] = 'ACTIVE'
      scene.sources.push(source)
      selectedSourceId.value = id
      saveProject()
    } catch (e) {
      errorMessage.value = e instanceof Error ? `Gagal membuka kamera/capture card: ${e.message}` : 'Gagal membuka kamera.'
    }
  }

  async function addScreenCapture(): Promise<void> {
    const scene = activeScene.value
    if (!scene) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      errorMessage.value = 'Browser ini tidak mendukung tangkapan layar (getDisplayMedia).'
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: outputWidth.value },
          height: { ideal: outputHeight.value },
          frameRate: { ideal: activeResolution.value.fps },
        },
        audio: true,
      })

      const id = newId()
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        sourceStatuses[id] = 'DISCONNECTED'
      })

      // Jika tangkapan layar menyertakan audio tab/sistem, otomatis masuk ke mixer
      if (stream.getAudioTracks().length > 0) {
        audioMixer.addStream(`audio-${id}`, 'Audio Layar / Tab', 'SCREEN', stream, false)
      }

      const source: SceneSource = {
        id,
        type: 'SCREEN',
        name: 'Rekam Layar',
        visible: true,
        mirrored: false,
        transform: { x: 0, y: 0, width: 1, height: 1 },
        shape: 'RECT',
      }

      compositor.setRuntime(id, { sourceId: id, video, stream })
      sourceStatuses[id] = 'ACTIVE'
      scene.sources.push(source)
      selectedSourceId.value = id
      saveProject()
    } catch (e) {
      if ((e as DOMException)?.name !== 'NotAllowedError') {
        errorMessage.value = e instanceof Error ? `Gagal menangkap layar: ${e.message}` : 'Gagal menangkap layar.'
      }
    }
  }

  function addTextOverlay(text: string): void {
    const scene = activeScene.value
    if (!scene || !text.trim()) return
    const id = newId()
    scene.sources.push({
      id,
      type: 'TEXT',
      name: text.trim().slice(0, 28),
      visible: true,
      mirrored: false,
      transform: { x: 0.15, y: 0.8, width: 0.7, height: 0.14 },
      shape: 'RECT',
      content: text.trim(),
    })
    sourceStatuses[id] = 'ACTIVE'
    selectedSourceId.value = id
    saveProject()
  }

  function addImageOverlay(file: File): void {
    const scene = activeScene.value
    if (!scene) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl) return
      const id = newId()
      const img = new Image()
      img.src = dataUrl
      compositor.setRuntime(id, { sourceId: id, image: img })
      scene.sources.push({
        id,
        type: 'IMAGE',
        name: file.name.replace(/\.[^.]+$/, ''),
        visible: true,
        mirrored: false,
        transform: { x: 0.04, y: 0.04, width: 0.22, height: 0.22 },
        shape: 'RECT',
        content: dataUrl,
      })
      sourceStatuses[id] = 'ACTIVE'
      selectedSourceId.value = id
      saveProject()
    }
    reader.readAsDataURL(file)
  }

  function addTestPattern(): void {
    const scene = activeScene.value
    if (!scene) return
    const id = newId()
    scene.sources.push({
      id,
      type: 'TEST',
      name: 'Pola Uji (Diagnostik)',
      visible: true,
      mirrored: false,
      transform: { x: 0.05, y: 0.05, width: 0.3, height: 0.3 },
      shape: 'RECT',
    })
    sourceStatuses[id] = 'ACTIVE'
    selectedSourceId.value = id
    saveProject()
  }

  function updateSourceTransform(sourceId: string, transform: Transform): void {
    const src = activeScene.value?.sources.find((s) => s.id === sourceId)
    if (!src) return
    src.transform = clampTransform(transform)
    saveProject()
  }

  function setSourceVisible(sourceId: string, visible: boolean): void {
    const src = activeScene.value?.sources.find((s) => s.id === sourceId)
    if (!src) return
    src.visible = visible
    saveProject()
  }

  function setSourceShape(sourceId: string, shape: LayerShape): void {
    const src = activeScene.value?.sources.find((s) => s.id === sourceId)
    if (!src) return
    src.shape = shape
    saveProject()
  }

  function toggleSourceMirror(sourceId: string): void {
    const src = activeScene.value?.sources.find((s) => s.id === sourceId)
    if (!src) return
    src.mirrored = !src.mirrored
    saveProject()
  }

  function resetSourceFullScreen(sourceId: string): void {
    updateSourceTransform(sourceId, { x: 0, y: 0, width: 1, height: 1 })
  }

  function centerSource(sourceId: string): void {
    const src = activeScene.value?.sources.find((s) => s.id === sourceId)
    if (!src) return
    updateSourceTransform(sourceId, {
      ...src.transform,
      x: (1 - src.transform.width) / 2,
      y: (1 - src.transform.height) / 2,
    })
  }

  function moveSourceLayer(sourceId: string, up: boolean): void {
    const scene = activeScene.value
    if (!scene) return
    const idx = scene.sources.findIndex((s) => s.id === sourceId)
    if (idx < 0) return
    const target = up ? idx + 1 : idx - 1
    if (target < 0 || target >= scene.sources.length) return
    const [item] = scene.sources.splice(idx, 1)
    scene.sources.splice(target, 0, item)
    saveProject()
  }

  function removeSource(sourceId: string): void {
    const scene = activeScene.value
    if (!scene) return
    compositor.removeRuntime(sourceId)
    audioMixer.removeChannel(`audio-${sourceId}`)
    delete sourceStatuses[sourceId]
    scene.sources = scene.sources.filter((s) => s.id !== sourceId)
    if (selectedSourceId.value === sourceId) selectedSourceId.value = null
    saveProject()
  }

  function applyTemplate(template: SceneTemplate): void {
    const scene = activeScene.value
    if (!scene || scene.sources.length === 0) return
    const sources = scene.sources
    const camIdx = sources.findIndex((s) => s.type === 'CAMERA')
    const scrIdx = sources.findIndex((s) => s.type === 'SCREEN')

    const primary =
      template === 'CAMERA'
        ? camIdx >= 0 ? camIdx : 0
        : template === 'SCREEN_CAM'
          ? scrIdx >= 0 ? scrIdx : 0
          : 0

    let secondary = -1
    if (template === 'GAMEPLAY_CAM' || template === 'SCREEN_CAM' || template === 'DUAL_CAM') {
      secondary = camIdx >= 0 && camIdx !== primary
        ? camIdx
        : sources.findIndex((_, i) => i !== primary)
    }

    sources.forEach((s, i) => {
      if (i === primary && template === 'DUAL_CAM') {
        s.visible = true
        s.transform = { x: 0, y: 0, width: 0.5, height: 1 }
        s.shape = 'RECT'
      } else if (i === primary) {
        s.visible = true
        s.transform = { x: 0, y: 0, width: 1, height: 1 }
        s.shape = 'RECT'
      } else if (i === secondary && template === 'DUAL_CAM') {
        s.visible = true
        s.transform = { x: 0.5, y: 0, width: 0.5, height: 1 }
        s.shape = 'RECT'
      } else if (i === secondary) {
        s.visible = true
        s.transform = { x: 0.65, y: 0.62, width: 0.31, height: 0.33 }
        s.shape = 'ROUNDED'
      } else {
        s.visible = false
      }
    })
    saveProject()
  }

  // ---------------- Audio Mixer ----------------

  function setHeadphonesConfirmed(confirmed: boolean): void {
    headphonesConfirmed.value = confirmed
    audioMixer.setHeadphonesConfirmed(confirmed)
  }

  /** Mikrofon suara (voice mic): default monitor MATI agar tidak memicu bunyi nging/feedback. */
  async function addMicSource(deviceId?: string, label?: string): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
            },
        video: false,
      })
      await refreshDevices()
      const track = stream.getAudioTracks()[0]
      const trackLabel = track?.label || label || 'Mikrofon'
      const realId = track?.getSettings().deviceId || deviceId
      audioMixer.addStream(newId(), trackLabel, 'MIC', stream, true, realId, 'OFF')
    } catch (e) {
      errorMessage.value = e instanceof Error ? `Gagal membuka mikrofon: ${e.message}` : 'Gagal membuka mikrofon.'
    }
  }

  /**
   * Audio Capture Card USB / Perangkat Eksternal (Line-In / HDMI Audio):
   * Tanpa pemrosesan suara voice (echoCancellation/noiseSuppression mati agar audio game jernih)
   * dan default MONITOR_AND_RECORD supaya langsung terdengar tanpa bentrok dengan mikrofon.
   */
  async function addExternalAudioSource(deviceId?: string, label?: string): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
        video: false,
      })
      await refreshDevices()
      const track = stream.getAudioTracks()[0]
      const trackLabel = track?.label || label || 'Audio Capture Card / Eksternal'
      const realId = track?.getSettings().deviceId || deviceId
      audioMixer.addStream(newId(), trackLabel, 'USB', stream, true, realId, 'MONITOR_AND_RECORD')
    } catch (e) {
      errorMessage.value =
        e instanceof Error ? `Gagal membuka audio eksternal: ${e.message}` : 'Gagal membuka audio eksternal.'
    }
  }

  // ---------------- Settings ----------------

  function setPreset(presetId: PresetOption['id']): void {
    if (recording.value) return
    const p = PRESETS.find((x) => x.id === presetId)
    if (!p) return
    project.value.activePresetId = p.id
    setResolution(p.resolutionId)
  }

  function setResolution(resId: string): void {
    if (recording.value) return
    const r = RESOLUTIONS.find((x) => x.id === resId)
    if (!r) return
    project.value.resolutionId = r.id
    compositor.setFps(r.fps)
    compositor.resize(outputWidth.value, outputHeight.value)
    saveProject()
  }

  function setCanvasPortrait(portrait: boolean): void {
    if (recording.value) return
    project.value.canvasPortrait = portrait
    compositor.resize(outputWidth.value, outputHeight.value)
    saveProject()
  }

  function setTransition(transition: SceneTransition, ms = 300): void {
    project.value.transition = transition
    project.value.transitionMs = transition === 'CUT' ? 0 : ms
    saveProject()
  }

  function setPreviewEnabled(enabled: boolean): void {
    previewEnabled.value = enabled
    compositor.setPreviewOptions(enabled, previewLowPower.value)
  }

  function setPreviewLowPower(lowPower: boolean): void {
    previewLowPower.value = lowPower
    compositor.setPreviewOptions(previewEnabled.value, lowPower)
  }

  // ---------------- Recording ----------------

  async function toggleRecording(): Promise<void> {
    if (recording.value) {
      const result = await recorder.stop()
      recording.value = false
      recordingMs.value = 0
      markerCount.value = 0
      if (result) {
        if (reviewRecording.value) URL.revokeObjectURL(reviewRecording.value.url)
        reviewRecording.value = result
      }
      return
    }

    try {
      const videoStream = compositor.captureStream(activeResolution.value.fps)
      const audioStream = audioMixer.getMixedAudioStream()
      recorder.start(videoStream, audioStream, activeResolution.value.bitrateKbps)
      recording.value = true
      recordingMs.value = 0
      markerCount.value = 0
    } catch (e) {
      errorMessage.value = e instanceof Error ? `Gagal memulai rekaman: ${e.message}` : 'Gagal memulai rekaman.'
    }
  }

  function addMarker(): void {
    if (!recording.value) return
    markerCount.value = recorder.addMarker()
  }

  function closeReview(): void {
    if (reviewRecording.value) {
      URL.revokeObjectURL(reviewRecording.value.url)
      reviewRecording.value = null
    }
  }

  // ---------------- Export / Import Project ----------------

  function exportProjectJson(): void {
    const blob = new Blob([JSON.stringify(project.value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'streapp-project.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importProjectJson(file: File): void {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')) as Project
        if (!parsed.scenes || parsed.scenes.length === 0) {
          throw new Error('Berkas proyek tidak memiliki scene.')
        }
        project.value = parsed
        compositor.resize(outputWidth.value, outputHeight.value)
        compositor.setFps(activeResolution.value.fps)
        saveProject()
      } catch (e) {
        errorMessage.value = e instanceof Error ? `Gagal impor proyek: ${e.message}` : 'Format JSON tidak valid.'
      }
    }
    reader.readAsText(file)
  }

  // ---------------- Restore saved IMAGE overlays ----------------
  for (const sc of project.value.scenes) {
    for (const src of sc.sources) {
      if (src.type === 'IMAGE' && src.content) {
        const img = new Image()
        img.src = src.content
        compositor.setRuntime(src.id, { sourceId: src.id, image: img })
        sourceStatuses[src.id] = 'ACTIVE'
      } else if (src.type === 'TEXT' || src.type === 'TEST') {
        sourceStatuses[src.id] = 'ACTIVE'
      } else {
        sourceStatuses[src.id] = 'STANDBY'
      }
    }
  }

  // ---------------- Periodic meter & stats loop ----------------
  const onFsChange = () => {
    isFullscreen.value = Boolean(document.fullscreenElement)
  }
  document.addEventListener('fullscreenchange', onFsChange)

  const tickId = window.setInterval(() => {
    audioChannels.value = audioMixer.getChannelsSnapshot()
    if (recording.value) {
      recordingMs.value = recorder.durationMs
    }
    const cStats = compositor.getStats()
    stats.actualFps = cStats.actualFps
    stats.droppedFrames = cStats.droppedFrames
    projectorOpen.value = projectorManager.isProjectorOpen
    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    stats.memoryMb = perfMem ? Math.round(perfMem.usedJSHeapSize / (1024 * 1024)) : null
  }, 120)

  void refreshDevices()

  onBeforeUnmount(() => {
    window.clearInterval(tickId)
    document.removeEventListener('fullscreenchange', onFsChange)
    chatClient.disconnect()
    projectorManager.closeProjectorWindow()
    compositor.stop()
    audioMixer.dispose()
  })

  return {
    project,
    activeScene,
    activeResolution,
    outputWidth,
    outputHeight,
    loadEstimate,
    selectedSourceId,
    canvasLocked,
    previewEnabled,
    previewLowPower,
    showDebug,
    errorMessage,
    recording,
    recordingMs,
    markerCount,
    reviewRecording,
    sourceStatuses,
    audioChannels,
    headphonesConfirmed,
    videoDevices,
    audioDevices,
    screens,
    selectedScreenId,
    multiScreenDetected,
    supportsMultiScreenApi: projectorManager.supportsMultiScreenApi,
    projectorOpen,
    isFullscreen,
    chatMessages,
    chatStatus,
    chatFilterBots,
    chatFilterCommands,
    stats,
    compositor,
    audioMixer,
    chatClient,
    refreshDevices,
    detectScreens,
    toggleFullscreenPreview,
    openProjectorOnSelectedScreen,
    closeProjector,
    setActiveScene,
    addScene,
    renameScene,
    duplicateScene,
    removeScene,
    addCameraOrCaptureCard,
    addScreenCapture,
    addTextOverlay,
    addImageOverlay,
    addTestPattern,
    updateSourceTransform,
    setSourceVisible,
    setSourceShape,
    toggleSourceMirror,
    resetSourceFullScreen,
    centerSource,
    moveSourceLayer,
    removeSource,
    applyTemplate,
    setHeadphonesConfirmed,
    addMicSource,
    addExternalAudioSource,
    setPreset,
    setResolution,
    setCanvasPortrait,
    setTransition,
    setPreviewEnabled,
    setPreviewLowPower,
    toggleRecording,
    addMarker,
    closeReview,
    exportProjectJson,
    importProjectJson,
  }
}
