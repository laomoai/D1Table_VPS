export async function compressImage(file: File): Promise<{ thumb: Blob; display: Blob }> {
  const bitmap = await createImageBitmap(file)
  const MAX = 2048
  let dw = bitmap.width
  let dh = bitmap.height
  if (dw > MAX || dh > MAX) {
    const r = Math.min(MAX / dw, MAX / dh)
    dw = Math.round(dw * r)
    dh = Math.round(dh * r)
  }
  const displayCanvas = document.createElement('canvas')
  displayCanvas.width = dw
  displayCanvas.height = dh
  displayCanvas.getContext('2d')!.drawImage(bitmap, 0, 0, dw, dh)

  const T = 200
  const scale = Math.max(T / bitmap.width, T / bitmap.height)
  const sw = T / scale
  const sh = T / scale
  const sx = (bitmap.width - sw) / 2
  const sy = (bitmap.height - sh) / 2
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = T
  thumbCanvas.height = T
  thumbCanvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, T, T)
  bitmap.close()

  const [display, thumb] = await Promise.all([
    canvasToBlob(displayCanvas, 'image/webp', 0.85),
    canvasToBlob(thumbCanvas, 'image/webp', 0.75),
  ])
  return { display, thumb }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), type, quality),
  )
}
