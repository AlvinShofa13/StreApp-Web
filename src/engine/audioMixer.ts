import type { AudioChannelInfo, MonitorMode } from '../types/studio'

interface AudioChannelNode {
  id: string
  label: string
  kind: AudioChannelInfo['kind']
  stream: MediaStream
  ownsStream: boolean
  sourceNode: MediaStreamAudioSourceNode
  masterGain: GainNode
  recordGain: GainNode
  monitorGain: GainNode
  analyser: AnalyserNode
  meterBuf: Uint8Array<ArrayBuffer>
  gain: number
  muted: boolean
  monitor: MonitorMode
}

/**
 * Mixer audio berbasis Web Audio API:
 * Mencampur beberapa input (mikrofon, capture card audio, audio tab/layar)
 * ke satu keluaran rekaman + monitoring headphone terpisah.
 */
export class WebAudioMixer {
  private ctx: AudioContext | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private channels = new Map<string, AudioChannelNode>()

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx({ sampleRate: 48000 })
      this.destination = this.ctx.createMediaStreamDestination()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  addStream(
    id: string,
    label: string,
    kind: AudioChannelInfo['kind'],
    stream: MediaStream,
    ownsStream = true,
  ): boolean {
    if (stream.getAudioTracks().length === 0) return false
    if (this.channels.has(id)) return true

    const ctx = this.ensureContext()
    const dest = this.destination!

    const audioOnly = new MediaStream(stream.getAudioTracks())
    const sourceNode = ctx.createMediaStreamSource(audioOnly)
    const masterGain = ctx.createGain()
    const recordGain = ctx.createGain()
    const monitorGain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256

    masterGain.gain.value = 1
    recordGain.gain.value = 1
    monitorGain.gain.value = 0 // default MonitorMode.OFF

    sourceNode.connect(masterGain)
    masterGain.connect(analyser)
    masterGain.connect(recordGain)
    masterGain.connect(monitorGain)
    recordGain.connect(dest)
    monitorGain.connect(ctx.destination)

    this.channels.set(id, {
      id,
      label,
      kind,
      stream,
      ownsStream,
      sourceNode,
      masterGain,
      recordGain,
      monitorGain,
      analyser,
      meterBuf: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
      gain: 1,
      muted: false,
      monitor: 'OFF',
    })
    return true
  }

  removeChannel(id: string): void {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.sourceNode.disconnect()
    ch.masterGain.disconnect()
    ch.recordGain.disconnect()
    ch.monitorGain.disconnect()
    ch.analyser.disconnect()
    if (ch.ownsStream) {
      ch.stream.getAudioTracks().forEach((t) => t.stop())
    }
    this.channels.delete(id)
  }

  setGain(id: string, gain: number): void {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.gain = Math.min(2, Math.max(0, gain))
    this.applyRouting(ch)
  }

  setMuted(id: string, muted: boolean): void {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.muted = muted
    this.applyRouting(ch)
  }

  setMonitor(id: string, mode: MonitorMode): void {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.monitor = mode
    this.applyRouting(ch)
  }

  private applyRouting(ch: AudioChannelNode): void {
    ch.masterGain.gain.value = ch.muted ? 0 : ch.gain
    const toRecord = ch.monitor === 'OFF' || ch.monitor === 'MONITOR_AND_RECORD'
    const toMonitor = ch.monitor === 'MONITOR_ONLY' || ch.monitor === 'MONITOR_AND_RECORD'
    ch.recordGain.gain.value = toRecord ? 1 : 0
    ch.monitorGain.gain.value = toMonitor ? 1 : 0
  }

  getChannelsSnapshot(): AudioChannelInfo[] {
    const result: AudioChannelInfo[] = []
    for (const ch of this.channels.values()) {
      let peak = 0
      if (!ch.muted) {
        ch.analyser.getByteTimeDomainData(ch.meterBuf)
        for (let i = 0; i < ch.meterBuf.length; i++) {
          const v = Math.abs((ch.meterBuf[i] - 128) / 128)
          if (v > peak) peak = v
        }
      }
      result.push({
        id: ch.id,
        label: ch.label,
        kind: ch.kind,
        gain: ch.gain,
        muted: ch.muted,
        monitor: ch.monitor,
        level: Math.min(1, peak * 1.8),
      })
    }
    return result
  }

  getMixedAudioStream(): MediaStream | null {
    if (!this.destination || this.channels.size === 0) return null
    return this.destination.stream
  }

  dispose(): void {
    for (const id of Array.from(this.channels.keys())) {
      this.removeChannel(id)
    }
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
      this.destination = null
    }
  }
}
