import type { MarkerEntry, RecordingResult } from '../types/studio'

/**
 * Perekam gabungan video kanvas + audio mixer melalui MediaRecorder API.
 * Memilih MP4 bila didukung browser, lalu fallback otomatis ke WebM.
 */
export class StudioRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startMs = 0
  private mimeType = 'video/webm'
  private markers: MarkerEntry[] = []

  get isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording'
  }

  get durationMs(): number {
    return this.isRecording ? performance.now() - this.startMs : 0
  }

  get markerCount(): number {
    return this.markers.length
  }

  start(videoStream: MediaStream, audioStream: MediaStream | null, bitrateKbps: number): void {
    if (this.isRecording) return

    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()]
    if (audioStream) {
      tracks.push(...audioStream.getAudioTracks())
    }
    const combined = new MediaStream(tracks)

    this.mimeType = this.pickMimeType()
    this.chunks = []
    this.markers = []

    const options: MediaRecorderOptions = {
      videoBitsPerSecond: bitrateKbps * 1000,
      audioBitsPerSecond: 128_000,
    }
    if (this.mimeType) {
      options.mimeType = this.mimeType
    }

    const rec = new MediaRecorder(combined, options)
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data)
      }
    }
    rec.start(2000) // tulis chunk berkala tiap 2 detik
    this.recorder = rec
    this.startMs = performance.now()
  }

  addMarker(label = 'marker'): number {
    if (!this.isRecording) return this.markers.length
    this.markers.push({
      ms: Math.round(performance.now() - this.startMs),
      label,
    })
    return this.markers.length
  }

  stop(): Promise<RecordingResult | null> {
    const rec = this.recorder
    if (!rec || rec.state === 'inactive') {
      this.recorder = null
      return Promise.resolve(null)
    }

    const elapsed = Math.round(performance.now() - this.startMs)
    const savedMarkers = [...this.markers]

    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = this.mimeType || 'video/webm'
        const blob = new Blob(this.chunks, { type })
        const url = URL.createObjectURL(blob)
        const ext = type.includes('mp4') ? 'mp4' : 'webm'
        const now = new Date()
        const stamp = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
          '_',
          String(now.getHours()).padStart(2, '0'),
          String(now.getMinutes()).padStart(2, '0'),
          String(now.getSeconds()).padStart(2, '0'),
        ].join('')
        this.recorder = null
        this.chunks = []
        resolve({
          blob,
          url,
          filename: `StreApp_${stamp}.${ext}`,
          mimeType: type,
          sizeBytes: blob.size,
          durationMs: elapsed,
          markers: savedMarkers,
        })
      }
      rec.stop()
    })
  }

  private pickMimeType(): string {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return mime
      }
    }
    return ''
  }
}
