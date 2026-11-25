import type { SceneSource } from '../types/studio'

export interface VideoLayerRuntime {
  sourceId: string
  video?: HTMLVideoElement
  image?: HTMLImageElement
  stream?: MediaStream
}

export interface CompositorStats {
  actualFps: number
  droppedFrames: number
  canvasWidth: number
  canvasHeight: number
}

/**
 * Kompositor Kanvas 2D multi-layer real-time untuk browser:
 * - Menggabungkan video kamera/capture card, screen capture, overlay teks & gambar, dan pola uji opsional.
 * - Mendukung bentuk Persegi, Sudut Membulat, Bulat, balik cermin, serta transisi Fade 0,3 dtk.
 * - Menyediakan satu stream keluaran (captureStream) untuk rekaman & proyektor multi-layar.
 */
export class CanvasCompositor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private running = false
  private timerId: number | null = null
  private targetFps = 30
  private previewEnabled = true
  private previewLowPower = false

  private layersProvider: () => SceneSource[] = () => []
  private runtimes = new Map<string, VideoLayerRuntime>()

  private fadeStartMs = 0
  private fadeDurationMs = 0

  private frameCount = 0
  private lastStatsMs = performance.now()
  private actualFps = 0
  private droppedFrames = 0
  private expectedFrameMs = 33.33
  private lastRenderMs = 0

  constructor(width = 1280, height = 720) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D context tidak tersedia di browser ini.')
    this.ctx = ctx
  }

  get element(): HTMLCanvasElement {
    return this.canvas
  }

  get width(): number {
    return this.canvas.width
  }

  get height(): number {
    return this.canvas.height
  }

  setLayersProvider(provider: () => SceneSource[]): void {
    this.layersProvider = provider
  }

  setRuntime(sourceId: string, runtime: VideoLayerRuntime): void {
    this.runtimes.set(sourceId, runtime)
  }

  removeRuntime(sourceId: string): void {
    const existing = this.runtimes.get(sourceId)
    if (existing?.stream) {
      existing.stream.getTracks().forEach((t) => t.stop())
    }
    if (existing?.video) {
      existing.video.srcObject = null
    }
    this.runtimes.delete(sourceId)
  }

  getRuntime(sourceId: string): VideoLayerRuntime | undefined {
    return this.runtimes.get(sourceId)
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.canvas.width = width
    this.canvas.height = height
  }

  setFps(fps: number): void {
    this.targetFps = Math.min(60, Math.max(15, fps))
    this.expectedFrameMs = 1000 / this.targetFps
  }

  setPreviewOptions(enabled: boolean, lowPower: boolean): void {
    this.previewEnabled = enabled
    this.previewLowPower = lowPower
  }

  triggerFade(durationMs: number): void {
    this.fadeStartMs = performance.now()
    this.fadeDurationMs = Math.max(0, durationMs)
  }

  captureStream(fps?: number): MediaStream {
    return this.canvas.captureStream(fps ?? this.targetFps)
  }

  getStats(): CompositorStats {
    return {
      actualFps: this.actualFps,
      droppedFrames: this.droppedFrames,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastStatsMs = performance.now()
    this.lastRenderMs = performance.now()
    this.frameCount = 0
    this.droppedFrames = 0
    this.scheduleNext()
  }

  stop(): void {
    this.running = false
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId)
      this.timerId = null
    }
    for (const id of Array.from(this.runtimes.keys())) {
      this.removeRuntime(id)
    }
  }

  private scheduleNext(): void {
    if (!this.running) return
    const effectiveFps = this.previewLowPower ? Math.min(this.targetFps, 15) : this.targetFps
    const intervalMs = 1000 / effectiveFps
    const now = performance.now()
    const elapsed = now - this.lastRenderMs

    if (elapsed > intervalMs * 2.2) {
      this.droppedFrames += Math.floor(elapsed / intervalMs) - 1
    }

    this.renderFrame(now)
    this.lastRenderMs = now
    this.frameCount++

    if (now - this.lastStatsMs >= 1000) {
      this.actualFps = Math.round((this.frameCount * 1000) / (now - this.lastStatsMs))
      this.frameCount = 0
      this.lastStatsMs = now
    }

    const spent = performance.now() - now
    const delay = Math.max(4, Math.round(intervalMs - spent))
    this.timerId = window.setTimeout(() => this.scheduleNext(), delay)
  }

  private renderFrame(nowMs: number): void {
    const ctx = this.ctx
    const cw = this.canvas.width
    const ch = this.canvas.height

    ctx.fillStyle = '#18212B'
    ctx.fillRect(0, 0, cw, ch)

    if (!this.previewEnabled) {
      // Tetap render frame nyata saat merekam; canvas tidak dikosongkan jika ada sumber aktif.
    }

    const sources = this.layersProvider()
    for (const src of sources) {
      if (!src.visible) continue
      const x = src.transform.x * cw
      const y = src.transform.y * ch
      const w = src.transform.width * cw
      const h = src.transform.height * ch
      if (w < 2 || h < 2) continue

      ctx.save()
      this.applyShapeClip(ctx, src.shape, x, y, w, h)

      if (src.type === 'CAMERA' || src.type === 'SCREEN') {
        const rt = this.runtimes.get(src.id)
        const vid = rt?.video
        if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
          this.drawMediaCover(ctx, vid, vid.videoWidth, vid.videoHeight, x, y, w, h, src.mirrored)
        } else {
          this.drawPlaceholder(ctx, src.name, x, y, w, h)
        }
      } else if (src.type === 'IMAGE') {
        const rt = this.runtimes.get(src.id)
        const img = rt?.image
        if (img && img.complete && img.naturalWidth > 0) {
          this.drawMediaCover(ctx, img, img.naturalWidth, img.naturalHeight, x, y, w, h, src.mirrored)
        }
      } else if (src.type === 'TEXT') {
        this.drawTextOverlay(ctx, src.content || src.name, x, y, w, h)
      } else if (src.type === 'TEST') {
        this.drawColorBars(ctx, nowMs / 1000, x, y, w, h)
      }

      ctx.restore()
    }

    // Transisi Fade ke hitam lalu kembali
    if (this.fadeDurationMs > 0) {
      const elapsed = nowMs - this.fadeStartMs
      if (elapsed >= this.fadeDurationMs) {
        this.fadeDurationMs = 0
      } else {
        const half = this.fadeDurationMs / 2
        const alpha = elapsed < half ? elapsed / half : 1 - (elapsed - half) / half
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, alpha))})`
        ctx.fillRect(0, 0, cw, ch)
      }
    }
  }

  private applyShapeClip(
    ctx: CanvasRenderingContext2D,
    shape: SceneSource['shape'],
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.beginPath()
    if (shape === 'CIRCLE') {
      const rx = w / 2
      const ry = h / 2
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2)
    } else if (shape === 'ROUNDED') {
      const r = Math.min(w, h) * 0.1
      ctx.roundRect(x, y, w, h, r)
    } else {
      ctx.rect(x, y, w, h)
    }
    ctx.clip()
  }

  private drawMediaCover(
    ctx: CanvasRenderingContext2D,
    media: CanvasImageSource,
    srcW: number,
    srcH: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    mirrored: boolean,
  ): void {
    const srcAspect = srcW / srcH
    const dstAspect = dw / dh
    let sx = 0
    let sy = 0
    let sw = srcW
    let sh = srcH

    if (srcAspect > dstAspect) {
      sw = srcH * dstAspect
      sx = (srcW - sw) / 2
    } else if (srcAspect < dstAspect) {
      sh = srcW / dstAspect
      sy = (srcH - sh) / 2
    }

    if (mirrored) {
      ctx.translate(dx + dw, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(media, sx, sy, sw, sh, 0, 0, dw, dh)
    } else {
      ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh)
    }
  }

  private drawPlaceholder(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.fillStyle = '#25313E'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#CBD5E1'
    const fontSize = Math.max(14, Math.min(24, Math.round(h * 0.08)))
    ctx.font = `600 ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
  }

  private drawTextOverlay(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const fontSize = Math.max(18, Math.min(72, Math.round(h * 0.55)))
    ctx.font = `700 ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.75)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 2
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(text, x + w / 2, y + h / 2, w * 0.94)
  }

  private drawColorBars(
    ctx: CanvasRenderingContext2D,
    timeSec: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const colors = ['#BFBFBF', '#BFBF00', '#00BFBF', '#00BF00', '#BF00BF', '#BF0000', '#0000BF']
    const barW = w / colors.length
    colors.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect(x + i * barW, y, barW + 1, h)
    })
    const pos = ((timeSec * 0.5) % 1) * w
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x + pos - w * 0.03, y + h * 0.85, w * 0.06, h * 0.15)
  }
}
