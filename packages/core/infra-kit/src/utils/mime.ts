function extname(filename: string): string {
  const basename = filename.slice(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\\\')) + 1)
  const dot = basename.lastIndexOf('.')
  return dot > 0 ? basename.slice(dot) : ''
}

export function getMimeType(filename: string) {
  const ext = extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.webp': 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}
