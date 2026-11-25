import type { ChatConnectionState, ChatMessage } from '../types/studio'

const MAX_MESSAGES = 200

/**
 * Pengelola Chat Privat baca-saja (tidak pernah masuk kompositor/rekaman):
 * - Mendukung Twitch IRC WebSocket baca-saja anonim.
 * - Mendukung generator Demo/Tiruan untuk pengujian UI.
 */
export class ChatClient {
  private ws: WebSocket | null = null
  private fakeTimer: number | null = null
  private msgCounter = 0

  filterBots = false
  filterCommands = true

  private onMessage: (msg: ChatMessage) => void
  private onStatus: (state: ChatConnectionState) => void

  constructor(
    onMessage: (msg: ChatMessage) => void,
    onStatus: (state: ChatConnectionState) => void,
  ) {
    this.onMessage = onMessage
    this.onStatus = onStatus
  }

  connectDemo(): void {
    this.disconnect()
    this.onStatus('CONNECTED')
    const authors = ['Rina', 'Budi', 'Sari', 'Dimas', 'Putri', 'Agus', 'Maya', 'Fajar']
    const lines = [
      'Halo, gambarnya jernih sekali',
      'Tata letak scene terlihat rapi',
      'Audio terdengar jelas tanpa noise',
      'Lanjutkan, seru sekali!',
      'Pratinjau di layar kedua lancar',
      '!uptime',
      'Kualitas 60 fps stabil',
      'Salam dari Bandung',
    ]

    this.fakeTimer = window.setInterval(() => {
      this.msgCounter++
      const author = authors[this.msgCounter % authors.length]
      const text = lines[this.msgCounter % lines.length]
      const role: ChatMessage['role'] =
        this.msgCounter % 11 === 0 ? 'MOD' : this.msgCounter % 15 === 0 ? 'BOT' : 'VIEWER'
      this.emit({
        id: `demo-${this.msgCounter}`,
        author,
        text,
        role,
        timestampMs: Date.now(),
      })
    }, 1400)
  }

  connectTwitch(channelRaw: string): void {
    const channel = channelRaw.trim().toLowerCase().replace(/^#/, '')
    if (!channel) return
    this.disconnect()
    this.onStatus('CONNECTING')

    try {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
      this.ws = ws

      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags')
        ws.send('PASS SCHMOOPIIE')
        ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`)
        ws.send(`JOIN #${channel}`)
        this.onStatus('CONNECTED')
      }

      ws.onmessage = (event) => {
        const raw = String(event.data || '')
        const lines = raw.split('\r\n')
        for (const line of lines) {
          if (line.startsWith('PING')) {
            ws.send('PONG :tmi.twitch.tv')
            continue
          }
          if (!line.includes(' PRIVMSG ')) continue
          const parsed = this.parseTwitchLine(line)
          if (parsed) this.emit(parsed)
        }
      }

      ws.onerror = () => {
        this.onStatus('ERROR')
      }

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null
          this.onStatus('DISCONNECTED')
        }
      }
    } catch {
      this.onStatus('ERROR')
    }
  }

  disconnect(): void {
    if (this.fakeTimer !== null) {
      window.clearInterval(this.fakeTimer)
      this.fakeTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.onStatus('DISCONNECTED')
  }

  private emit(msg: ChatMessage): void {
    if (this.filterBots && (msg.role === 'BOT' || msg.author.toLowerCase().endsWith('bot'))) {
      return
    }
    if (this.filterCommands && msg.text.trimStart().startsWith('!')) {
      return
    }
    this.onMessage(msg)
  }

  private parseTwitchLine(line: string): ChatMessage | null {
    const msgIdx = line.indexOf(' PRIVMSG ')
    if (msgIdx < 0) return null
    const textIdx = line.indexOf(' :', msgIdx)
    if (textIdx < 0) return null
    const text = line.slice(textIdx + 2).trim()
    if (!text) return null

    let author = 'Penonton'
    let role: ChatMessage['role'] = 'VIEWER'
    const displayMatch = line.match(/display-name=([^;]+)/)
    if (displayMatch?.[1]) {
      author = displayMatch[1]
    } else {
      const nickMatch = line.match(/:([^!]+)![^ ]+ PRIVMSG/)
      if (nickMatch?.[1]) author = nickMatch[1]
    }
    if (line.includes('badges=broadcaster')) role = 'HOST'
    else if (line.includes('mod=1') || line.includes('badges=moderator')) role = 'MOD'

    this.msgCounter++
    return {
      id: `tw-${this.msgCounter}-${Date.now()}`,
      author,
      text,
      role,
      timestampMs: Date.now(),
    }
  }
}

export function appendCappedMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const next = [...list, msg]
  return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
}
