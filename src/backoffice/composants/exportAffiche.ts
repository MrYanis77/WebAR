// Composition dans le navigateur de l'affiche importée et de son QR code (aperçu RA, export PNG).
// Le PDF à imprimer est produit par l'API (pdf-lib + qrcode, BF-15, BF-38, BF-42).
import QRCode from 'qrcode'
import { MENTION_QR, urlQr } from '../../commun/AfficheQr'
import type { PlacementQr } from '../../commun/types'

const COTE_MAX = 7000

async function chargerImage(fichier: Blob): Promise<ImageBitmap> {
  return createImageBitmap(fichier)
}

/** Dessine l'affiche et son QR code dans un canvas. */
export async function composerAffiche(fichier: Blob, code: string, qr: PlacementQr, coteMax = COTE_MAX): Promise<HTMLCanvasElement> {
  const img = await chargerImage(fichier)
  const ech = Math.min(1, coteMax / Math.max(img.width, img.height))
  const W = Math.round(img.width * ech)
  const H = Math.round(img.height * ech)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, W, H)

  const largeurBloc = qr.taille * W
  const marge = qr.fond ? largeurBloc * 0.07 : 0
  const coteQr = Math.round(largeurBloc - marge * 2)
  const hauteurMention = qr.mention ? largeurBloc * 0.16 : 0
  const x = qr.x * W
  const y = qr.y * H

  if (qr.fond || qr.mention) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(x, y, largeurBloc, largeurBloc + hauteurMention, largeurBloc * 0.05)
    ctx.fill()
  }
  const toile = document.createElement('canvas')
  await QRCode.toCanvas(toile, urlQr(code), { width: coteQr, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(toile, x + marge, y + marge, coteQr, coteQr)
  ctx.imageSmoothingEnabled = true

  if (qr.mention) {
    ctx.fillStyle = '#1e2024'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.round(largeurBloc * 0.075)}px Inter, Arial, sans-serif`
    ctx.fillText(MENTION_QR, x + largeurBloc / 2, y + largeurBloc + hauteurMention * 0.35, largeurBloc * 0.92)
  }
  return c
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const nomFichier = (nom: string) =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'affiche'

export async function exporterPng(fichier: Blob, code: string, qr: PlacementQr, nom: string) {
  const c = await composerAffiche(fichier, code, qr)
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Export impossible'))), 'image/png'))
  telecharger(blob, `${nomFichier(nom)}-qr.png`)
}
