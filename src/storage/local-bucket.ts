import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

export type LocalObject = {
  body: ReadableStream<Uint8Array>
  writeHttpMetadata: (headers: Headers) => void
}

export type LocalBucket = {
  put: (
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<void>
  get: (key: string) => Promise<LocalObject | null>
  delete: (key: string) => Promise<void>
  size: (key: string) => Promise<number | null>
}

function safeJoin(root: string, key: string): string {
  const normalized = key.replace(/^\/+/, '').replace(/\0/g, '')
  if (normalized.includes('..')) {
    throw new Error('Invalid storage key')
  }
  const full = path.resolve(root, normalized)
  const rootResolved = path.resolve(root)
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new Error('Invalid storage key')
  }
  return full
}

export function createLocalBucket(rootDir: string): LocalBucket {
  return {
    async put(key, value, options) {
      const filePath = safeJoin(rootDir, key)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      const buf = value instanceof Uint8Array ? value : new Uint8Array(value)
      await fs.writeFile(filePath, buf)
      if (options?.httpMetadata?.contentType) {
        await fs.writeFile(`${filePath}.meta.json`, JSON.stringify({
          contentType: options.httpMetadata.contentType,
        }))
      }
    },

    async get(key) {
      const filePath = safeJoin(rootDir, key)
      try {
        await fs.access(filePath)
      } catch {
        return null
      }
      let contentType = 'application/octet-stream'
      try {
        const meta = JSON.parse(await fs.readFile(`${filePath}.meta.json`, 'utf8')) as { contentType?: string }
        if (meta.contentType) contentType = meta.contentType
      } catch {
        if (filePath.endsWith('.webp')) contentType = 'image/webp'
      }
      const nodeStream = (await fs.open(filePath)).createReadStream()
      return {
        body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
        writeHttpMetadata(headers) {
          headers.set('Content-Type', contentType)
        },
      }
    },

    async delete(key) {
      const filePath = safeJoin(rootDir, key)
      await fs.rm(filePath, { force: true })
      await fs.rm(`${filePath}.meta.json`, { force: true })
    },

    async size(key) {
      try {
        const st = await fs.stat(safeJoin(rootDir, key))
        return st.size
      } catch {
        return null
      }
    },
  }
}
