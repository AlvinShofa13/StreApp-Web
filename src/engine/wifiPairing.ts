/**
 * Pairing Kamera Nirkabel via Wi-Fi (WebRTC Peer-to-Peer, tanpa backend/database).
 * Host (Studio Web) membuat Kode Offer -> Pengirim (HP/Browser di Wi-Fi sama) membuat Kode Answer
 * -> Video & audio opsional langsung mengalir P2P berlatensi rendah ke kanvas studio.
 */

export type WifiPairingStatus = 'IDLE' | 'PREPARING' | 'WAITING_ANSWER' | 'CONNECTING' | 'CONNECTED' | 'ERROR'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

interface SignalPayload {
  t: 'offer' | 'answer'
  s: string
  n?: string
}

function encodeSignal(payload: SignalPayload): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeSignal(code: string): SignalPayload {
  const trimmed = code.trim()
  // Izinkan menempelkan URL penuh (?wifiNode=1#offer=...) ataupun kode mentah
  const rawToken = trimmed.includes('#offer=')
    ? trimmed.split('#offer=')[1].split('&')[0]
    : trimmed.includes('#answer=')
      ? trimmed.split('#answer=')[1].split('&')[0]
      : trimmed
  const padded = rawToken.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((rawToken.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const json = new TextDecoder().decode(bytes)
  const parsed = JSON.parse(json) as Partial<SignalPayload>
  if ((parsed.t !== 'offer' && parsed.t !== 'answer') || typeof parsed.s !== 'string' || !parsed.s) {
    throw new Error('Format kode pairing Wi-Fi tidak valid.')
  }
  return { t: parsed.t, s: parsed.s, n: parsed.n }
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onState)
      resolve()
    }
    const onState = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    const timer = window.setTimeout(done, timeoutMs)
    pc.addEventListener('icegatheringstatechange', onState)
  })
}

export class WifiHostSession {
  private pc: RTCPeerConnection | null = null
  private remoteStream: MediaStream | null = null

  onStatus?: (status: WifiPairingStatus, message?: string) => void
  onStream?: (stream: MediaStream, label: string) => void

  async createOffer(): Promise<{ offerCode: string; shareUrl: string }> {
    this.close()
    this.onStatus?.('PREPARING')

    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.pc = pc

    // Minta menerima track video dan audio dari HP pengirim
    pc.addTransceiver('video', { direction: 'recvonly' })
    pc.addTransceiver('audio', { direction: 'recvonly' })

    const incomingStream = new MediaStream()
    this.remoteStream = incomingStream

    pc.ontrack = (ev) => {
      const targetStream = ev.streams[0] ?? incomingStream
      if (!ev.streams[0]) {
        incomingStream.addTrack(ev.track)
      }
      this.remoteStream = targetStream
      this.onStream?.(targetStream, 'Kamera Wi-Fi')
      this.onStatus?.('CONNECTED')
    }

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'connected') {
        this.onStatus?.('CONNECTED')
      } else if (st === 'failed' || st === 'disconnected') {
        this.onStatus?.('ERROR', 'Koneksi kamera Wi-Fi terputus. Buat sesi baru untuk menyambung ulang.')
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc, 4000)

    const localSdp = pc.localDescription?.sdp
    if (!localSdp) {
      this.onStatus?.('ERROR', 'Gagal membuat SDP Offer WebRTC.')
      throw new Error('Gagal membuat SDP Offer WebRTC.')
    }

    const offerCode = encodeSignal({ t: 'offer', s: localSdp })
    const base = `${window.location.origin}${window.location.pathname}`
    const shareUrl = `${base}?wifiNode=1#offer=${offerCode}`
    this.onStatus?.('WAITING_ANSWER')
    return { offerCode, shareUrl }
  }

  async acceptAnswer(answerCode: string): Promise<void> {
    if (!this.pc) throw new Error('Belum ada sesi Host Wi-Fi aktif.')
    const parsed = decodeSignal(answerCode)
    if (parsed.t !== 'answer') {
      throw new Error('Kode yang ditempel bukan Kode Answer dari HP Pengirim.')
    }
    this.onStatus?.('CONNECTING')
    await this.pc.setRemoteDescription({ type: 'answer', sdp: parsed.s })
  }

  close(): void {
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop())
      this.remoteStream = null
    }
    if (this.pc) {
      try {
        this.pc.close()
      } catch {
        // Abaikan
      }
      this.pc = null
    }
    this.onStatus?.('IDLE')
  }
}

export class WifiNodeSession {
  private pc: RTCPeerConnection | null = null

  onStatus?: (status: WifiPairingStatus, message?: string) => void

  async createAnswerFromOffer(offerCode: string, localStream: MediaStream): Promise<string> {
    this.close()
    this.onStatus?.('PREPARING')

    const parsed = decodeSignal(offerCode)
    if (parsed.t !== 'offer') {
      throw new Error('Kode yang dimasukkan bukan Kode Offer dari Host.')
    }

    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.pc = pc

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream)
    })

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'connected') {
        this.onStatus?.('CONNECTED')
      } else if (st === 'failed' || st === 'disconnected') {
        this.onStatus?.('ERROR', 'Koneksi ke Host Wi-Fi terputus.')
      }
    }

    await pc.setRemoteDescription({ type: 'offer', sdp: parsed.s })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc, 4000)

    const localSdp = pc.localDescription?.sdp
    if (!localSdp) {
      this.onStatus?.('ERROR', 'Gagal membuat Kode Answer WebRTC.')
      throw new Error('Gagal membuat Kode Answer WebRTC.')
    }

    this.onStatus?.('WAITING_ANSWER')
    return encodeSignal({ t: 'answer', s: localSdp })
  }

  close(): void {
    if (this.pc) {
      try {
        this.pc.close()
      } catch {
        // Abaikan
      }
      this.pc = null
    }
    this.onStatus?.('IDLE')
  }
}
