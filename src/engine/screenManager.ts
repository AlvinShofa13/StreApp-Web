import type { ScreenTarget } from '../types/studio'

interface DetailedScreen {
  label?: string
  width: number
  height: number
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
  isPrimary?: boolean
}

interface ScreenDetailsApi {
  screens: DetailedScreen[]
  currentScreen: DetailedScreen
  addEventListener?: (event: string, cb: () => void) => void
}

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsApi>
}

type ElementWithScreenFullscreen = HTMLElement & {
  requestFullscreen(options?: FullscreenOptions & { screen?: unknown }): Promise<void>
}

/**
 * Pengelola Multi-Layar & Fullscreen Projector ala OBS:
 * - Mendeteksi daftar monitor lewat Window Management API (Chrome/Edge).
 * - Dapat menampilkan preview Fullscreen langsung pada layar pilihan.
 * - Dapat membuka Jendela Proyektor (Pop-out Preview) khusus di monitor pilihan
 *   sementara dashboard kontrol tetap terbuka di layar utama.
 */
export class ScreenProjectorManager {
  private projectorWindow: Window | null = null
  private projectorStream: MediaStream | null = null

  get supportsMultiScreenApi(): boolean {
    return typeof (window as WindowWithScreenDetails).getScreenDetails === 'function'
  }

  getFallbackScreens(): ScreenTarget[] {
    const s = window.screen
    return [
      {
        id: 'screen-current',
        label: `Layar Saat Ini (${s.width} x ${s.height})`,
        width: s.width,
        height: s.height,
        availLeft: 0,
        availTop: 0,
        availWidth: s.availWidth,
        availHeight: s.availHeight,
        isPrimary: true,
        isCurrent: true,
      },
    ]
  }

  async detectScreens(): Promise<{ screens: ScreenTarget[]; multiScreenGranted: boolean }> {
    const win = window as WindowWithScreenDetails
    if (typeof win.getScreenDetails !== 'function') {
      return { screens: this.getFallbackScreens(), multiScreenGranted: false }
    }
    try {
      const details = await win.getScreenDetails()
      const screens: ScreenTarget[] = details.screens.map((scr, idx) => {
        const baseName = scr.label?.trim() || `Layar ${idx + 1}`
        const primaryTag = scr.isPrimary ? ' (Utama)' : ''
        return {
          id: `screen-${idx}`,
          label: `${baseName}${primaryTag} • ${scr.width} x ${scr.height}`,
          width: scr.width,
          height: scr.height,
          availLeft: scr.availLeft,
          availTop: scr.availTop,
          availWidth: scr.availWidth,
          availHeight: scr.availHeight,
          isPrimary: Boolean(scr.isPrimary),
          isCurrent: scr === details.currentScreen,
          nativeScreen: scr,
        }
      })
      return {
        screens: screens.length > 0 ? screens : this.getFallbackScreens(),
        multiScreenGranted: true,
      }
    } catch {
      return { screens: this.getFallbackScreens(), multiScreenGranted: false }
    }
  }

  async enterFullscreenOnScreen(element: HTMLElement, target?: ScreenTarget): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    const el = element as ElementWithScreenFullscreen
    if (target?.nativeScreen) {
      try {
        await el.requestFullscreen({ screen: target.nativeScreen })
        return
      } catch {
        // Fallback ke layar saat ini bila browser menolak opsi screen
      }
    }
    await el.requestFullscreen()
  }

  openProjectorWindow(stream: MediaStream, target?: ScreenTarget): boolean {
    this.closeProjectorWindow()

    const left = target ? target.availLeft : 80
    const top = target ? target.availTop : 80
    const width = target ? Math.max(640, target.availWidth) : 1280
    const height = target ? Math.max(360, target.availHeight) : 720

    const features = `popup=yes,left=${left},top=${top},width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no`
    const popup = window.open('', 'StreAppPreviewProjector', features)
    if (!popup) return false

    this.projectorWindow = popup
    this.projectorStream = stream

    const doc = popup.document
    doc.open()
    doc.write(`<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>StreApp — Proyektor Pratinjau</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%; background: #0D1117; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    video {
      width: 100vw; height: 100vh; object-fit: contain; display: block; background: #000;
    }
    .bar {
      position: fixed; top: 14px; right: 14px; display: flex; gap: 8px;
      opacity: 0; transition: opacity 0.2s ease;
    }
    body:hover .bar { opacity: 1; }
    button {
      padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.22);
      background: rgba(15, 23, 34, 0.78); color: #fff; font-size: 12px; font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: rgba(61, 111, 165, 0.92); }
  </style>
</head>
<body>
  <video id="projVideo" autoplay muted playsinline></video>
  <div class="bar">
    <button id="fsBtn">Layar Penuh</button>
    <button id="closeBtn">Tutup</button>
  </div>
</body>
</html>`)
    doc.close()

    const videoEl = doc.getElementById('projVideo') as HTMLVideoElement | null
    if (videoEl) {
      videoEl.srcObject = stream
      void videoEl.play().catch(() => undefined)
    }

    const fsBtn = doc.getElementById('fsBtn')
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (doc.fullscreenElement) {
          void doc.exitFullscreen()
        } else {
          void doc.documentElement.requestFullscreen()
        }
      })
    }

    const closeBtn = doc.getElementById('closeBtn')
    if (closeBtn) {
      closeBtn.addEventListener('click', () => popup.close())
    }

    popup.addEventListener('beforeunload', () => {
      this.projectorWindow = null
      this.projectorStream = null
    })

    return true
  }

  get isProjectorOpen(): boolean {
    return Boolean(this.projectorWindow && !this.projectorWindow.closed)
  }

  closeProjectorWindow(): void {
    if (this.projectorWindow && !this.projectorWindow.closed) {
      this.projectorWindow.close()
    }
    this.projectorWindow = null
    this.projectorStream = null
  }
}
