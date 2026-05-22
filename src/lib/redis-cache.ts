import net from 'net'
import tls from 'tls'

function getRestRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

function getTcpRedisUrl() {
  return process.env.KV_REDIS_URL || process.env.REDIS_URL || null
}

function encodeRedisCommand(command: unknown[]) {
  return Buffer.from(`*${command.length}\r\n${command.map((part) => {
    const value = String(part)
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`
  }).join('')}`, 'utf8')
}

function parseRedisReply(buffer: Buffer, offset = 0): { value: unknown; offset: number } {
  const type = String.fromCharCode(buffer[offset])
  const lineEnd = buffer.indexOf('\r\n', offset)
  if (lineEnd < 0) throw new Error('Incomplete Redis reply')
  const line = buffer.toString('utf8', offset + 1, lineEnd)
  const next = lineEnd + 2

  if (type === '+') return { value: line, offset: next }
  if (type === '-') throw new Error(line)
  if (type === ':') return { value: Number(line), offset: next }
  if (type === '$') {
    const length = Number(line)
    if (length < 0) return { value: null, offset: next }
    const end = next + length
    if (buffer.length < end + 2) throw new Error('Incomplete Redis bulk reply')
    return { value: buffer.toString('utf8', next, end), offset: end + 2 }
  }
  if (type === '*') {
    const count = Number(line)
    if (count < 0) return { value: null, offset: next }
    const values: unknown[] = []
    let cursor = next
    for (let i = 0; i < count; i++) {
      const parsed = parseRedisReply(buffer, cursor)
      values.push(parsed.value)
      cursor = parsed.offset
    }
    return { value: values, offset: cursor }
  }
  throw new Error(`Unknown Redis reply type: ${type}`)
}

async function redisTcpCommand<T = unknown>(redisUrl: string, command: unknown[]): Promise<T | null> {
  return new Promise((resolve) => {
    const parsed = new URL(redisUrl)
    const port = Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379))
    const host = parsed.hostname
    const password = decodeURIComponent(parsed.password || '')
    const username = decodeURIComponent(parsed.username || '')
    const socket = parsed.protocol === 'rediss:'
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port })
    const chunks: Buffer[] = []
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve(null)
    }, 8000)

    socket.on('connect', () => {
      const commands: Buffer[] = []
      if (password) {
        commands.push(encodeRedisCommand(username ? ['AUTH', username, password] : ['AUTH', password]))
      }
      commands.push(encodeRedisCommand(command))
      socket.write(Buffer.concat(commands))
    })

    socket.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      try {
        const buffer = Buffer.concat(chunks)
        let offset = 0
        if (password) offset = parseRedisReply(buffer, offset).offset
        const parsedReply = parseRedisReply(buffer, offset)
        clearTimeout(timeout)
        socket.end()
        resolve(parsedReply.value as T)
      } catch {
        // Wait for the full reply.
      }
    })

    socket.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
    socket.on('close', () => clearTimeout(timeout))
  })
}

export function hasRedisConfig() {
  return !!getRestRedisConfig() || !!getTcpRedisUrl()
}

export async function redisCommand<T = unknown>(command: unknown[]): Promise<T | null> {
  const rest = getRestRedisConfig()
  if (rest) {
    try {
      const response = await fetch(rest.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rest.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        cache: 'no-store',
      })
      if (response.ok) {
        const json = await response.json()
        if (!json.error) return json.result as T
      }
    } catch {
      // Fall through to TCP Redis if configured.
    }
  }

  const tcpUrl = getTcpRedisUrl()
  if (!tcpUrl) return null
  return redisTcpCommand<T>(tcpUrl, command)
}
