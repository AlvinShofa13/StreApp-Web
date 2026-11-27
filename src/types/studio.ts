export type SourceType = 'CAMERA' | 'SCREEN' | 'REMOTE_WIFI' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'TEST'
export type LayerShape = 'RECT' | 'ROUNDED' | 'CIRCLE'
export type SceneTransition = 'CUT' | 'FADE'
export type MonitorMode = 'OFF' | 'MONITOR_ONLY' | 'MONITOR_AND_RECORD'
export type SourceStatus = 'ACTIVE' | 'STANDBY' | 'DISCONNECTED' | 'ERROR'
export type SceneTemplate = 'FULL' | 'CAMERA' | 'GAMEPLAY_CAM' | 'SCREEN_CAM' | 'DUAL_CAM'
export type LoadLevel = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'MAXIMUM'

export interface Transform {
  x: number
  y: number
  width: number
  height: number
}

export interface SceneSource {
  id: string
  type: SourceType
  name: string
  deviceId?: string
  visible: boolean
  mirrored: boolean
  transform: Transform
  shape: LayerShape
  content?: string
}

export interface Scene {
  id: string
  name: string
  sources: SceneSource[]
}

export interface ResolutionOption {
  id: string
  label: string
  shortLabel: string
  width: number
  height: number
  fps: number
  bitrateKbps: number
}

export interface PresetOption {
  id: 'hemat' | 'seimbang' | 'tinggi'
  label: string
  resolutionId: string
}

export interface Project {
  version: number
  scenes: Scene[]
  activeSceneId: string
  activePresetId: PresetOption['id']
  resolutionId: string
  canvasPortrait: boolean
  transition: SceneTransition
  transitionMs: number
}

export interface AudioChannelInfo {
  id: string
  label: string
  kind: 'MIC' | 'USB' | 'SCREEN'
  deviceId?: string
  gain: number
  muted: boolean
  monitor: MonitorMode
  level: number
}

export interface MarkerEntry {
  ms: number
  label: string
}

export interface RecordingResult {
  blob: Blob
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  durationMs: number
  markers: MarkerEntry[]
}

export interface ChatMessage {
  id: string
  author: string
  text: string
  role: 'VIEWER' | 'MOD' | 'HOST' | 'BOT'
  timestampMs: number
}

export type ChatConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'

export interface ScreenTarget {
  id: string
  label: string
  width: number
  height: number
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
  isPrimary: boolean
  isCurrent: boolean
  nativeScreen?: unknown
}

export const RESOLUTIONS: ResolutionOption[] = [
  { id: '480p30', label: '480p (854 x 480 • 30 fps) Ringan', shortLabel: '480p 30fps', width: 854, height: 480, fps: 30, bitrateKbps: 2000 },
  { id: '720p30', label: '720p (1280 x 720 • 30 fps) Standar', shortLabel: '720p 30fps', width: 1280, height: 720, fps: 30, bitrateKbps: 4000 },
  { id: '720p60', label: '720p (1280 x 720 • 60 fps) Halus', shortLabel: '720p 60fps', width: 1280, height: 720, fps: 60, bitrateKbps: 6000 },
  { id: '1080p30', label: '1080p (1920 x 1080 • 30 fps) Tinggi', shortLabel: '1080p 30fps', width: 1920, height: 1080, fps: 30, bitrateKbps: 6000 },
  { id: '1080p60', label: '1080p (1920 x 1080 • 60 fps) Maks', shortLabel: '1080p 60fps', width: 1920, height: 1080, fps: 60, bitrateKbps: 10000 },
]

export const PRESETS: PresetOption[] = [
  { id: 'hemat', label: 'Hemat (720p 30 fps)', resolutionId: '720p30' },
  { id: 'seimbang', label: 'Seimbang (1080p 30 fps)', resolutionId: '1080p30' },
  { id: 'tinggi', label: 'Tinggi (1080p 60 fps)', resolutionId: '1080p60' },
]

export function clampTransform(t: Transform): Transform {
  const width = Math.min(1, Math.max(0.1, t.width))
  const height = Math.min(1, Math.max(0.1, t.height))
  const x = Math.min(1 - width, Math.max(0, t.x))
  const y = Math.min(1 - height, Math.max(0, t.y))
  return { x, y, width, height }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createDefaultProject(): Project {
  const sceneId = newId()
  return {
    version: 1,
    scenes: [
      {
        id: sceneId,
        name: 'Gameplay Utama',
        sources: [],
      },
    ],
    activeSceneId: sceneId,
    activePresetId: 'hemat',
    resolutionId: '720p30',
    canvasPortrait: false,
    transition: 'FADE',
    transitionMs: 300,
  }
}
