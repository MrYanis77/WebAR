// Assemble l'image de la caméra et la scène augmentée dans une photo (BF-11).
// La photo reste dans le téléphone : elle n'est jamais envoyée au serveur.

export interface ScenePhoto {
  source: HTMLVideoElement | HTMLImageElement | null
  theme: 'chateau' | 'stade' | 'affiche' | 'lieu'
  titre: string
  sousTitre: string
  score?: { a: string; b: string; sa: number; sb: number }
}

function couvrir(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, W: number, H: number) {
  const ech = Math.max(W / sw, H / sh)
  const w = sw * ech
  const h = sh * ech
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h)
}

export function capturerPhoto(s: ScenePhoto): string {
  const W = 1080
  const H = 1620
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#1e2024'
  ctx.fillRect(0, 0, W, H)
  const src = s.source
  if (src instanceof HTMLVideoElement && src.videoWidth) couvrir(ctx, src, src.videoWidth, src.videoHeight, W, H)
  else if (src instanceof HTMLImageElement && src.naturalWidth) couvrir(ctx, src, src.naturalWidth, src.naturalHeight, W, H)

  const degrade = ctx.createLinearGradient(0, 0, 0, H)
  degrade.addColorStop(0, 'rgba(20,20,22,0.55)')
  degrade.addColorStop(0.35, 'rgba(0,0,0,0)')
  degrade.addColorStop(0.75, 'rgba(0,0,0,0)')
  degrade.addColorStop(1, 'rgba(20,20,22,0.7)')
  ctx.fillStyle = degrade
  ctx.fillRect(0, 0, W, H)

  if (s.theme === 'chateau' || s.theme === 'lieu') {
    ctx.save()
    ctx.shadowColor = 'rgba(255,221,128,0.9)'
    ctx.shadowBlur = 50
    ctx.strokeStyle = 'rgba(255,227,155,0.9)'
    ctx.lineWidth = 12
    ctx.beginPath()
    ctx.moveTo(220, 1180)
    ctx.lineTo(220, 820)
    ctx.arc(540, 820, 320, Math.PI, 0)
    ctx.lineTo(860, 1180)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 70; i++) {
      ctx.beginPath()
      ctx.arc((i * 151) % W, (i * 263) % (H - 300) + 80, 3 + (i % 4), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (s.theme === 'stade' && s.score) {
    ctx.fillStyle = 'rgba(30,32,36,0.8)'
    ctx.strokeStyle = 'rgba(79,209,197,0.8)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(140, 640, 800, 300, 30)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = '700 130px "Bricolage Grotesque", sans-serif'
    ctx.fillText(`${s.score.sa} – ${s.score.sb}`, 540, 850)
    ctx.font = '700 40px Inter, sans-serif'
    ctx.fillText(s.score.a, 240, 810)
    ctx.fillText(s.score.b, 840, 810)
  }
  if (s.theme === 'affiche') {
    ctx.fillStyle = '#4fd1c5'
    ctx.shadowColor = '#4fd1c5'
    ctx.shadowBlur = 40
    ctx.font = '800 220px "Bricolage Grotesque", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('✦', 540, 860)
    ctx.shadowBlur = 0
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = '650 76px "Bricolage Grotesque", sans-serif'
  ctx.fillText(s.titre, 540, 300, 980)
  ctx.font = '500 34px Inter, sans-serif'
  ctx.fillText(s.sousTitre, 540, 360, 980)
  ctx.font = '700 30px Inter, sans-serif'
  ctx.fillStyle = '#4fd1c5'
  ctx.fillText('MONTBÉLIARD EXPÉRIENCES', 540, H - 80)
  return c.toDataURL('image/jpeg', 0.9)
}

export async function partagerPhoto(dataUrl: string, titre: string): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const fichier = new File([blob], 'montbeliard-ra.jpg', { type: 'image/jpeg' })
    if (navigator.canShare?.({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: titre })
      return true
    }
  } catch {
    /* partage annulé ou indisponible */
  }
  return false
}
