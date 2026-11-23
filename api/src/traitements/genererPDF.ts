// Traitement « genererPDF » : affiche prête à imprimer (pdf-lib + qrcode, BF-15, BF-38, BF-42).
// L'image importée est placée à sa résolution d'origine, le QR code vectorisé en PNG haute définition
// est incrusté à la position choisie par l'éditeur, au format d'impression demandé.
import { readFile } from 'node:fs/promises'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'
import { config } from '../config.js'
import { cheminAbsolu } from '../services/stockage.js'

const FORMATS_MM: Record<string, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] }
const MM_EN_PT = 72 / 25.4
export const MENTION_QR = 'Scannez · expérience RA'

/**
 * Origine encodée dans les QR codes des PDF. En production : toujours le domaine officiel (jamais une
 * adresse venue de la requête, BNF-18). En développement : URL_RESEAU (.env), sinon l'adresse réseau du
 * PC transmise par le serveur Vite (en-tête X-Url-Reseau), pour tester l'affiche imprimée avec un téléphone.
 */
export function origineQr(enTeteUrlReseau?: string | string[]): string {
  if (config.production) return config.domaine
  if (config.urlReseau) return config.urlReseau.replace(/\/$/, '')
  const valeur = Array.isArray(enTeteUrlReseau) ? enTeteUrlReseau[0] : enTeteUrlReseau
  if (valeur && /^https?:\/\/[\w.-]+(:\d{2,5})?$/.test(valeur)) return valeur
  return config.domaine
}

export const urlQr = (code: string, origine = config.domaine) => `${origine}/a/${code}`

interface DonneesPdf {
  /** Origine des QR codes (voir origineQr). */
  origine?: string
  nom: string
  codeQr: string
  format: string
  image: { chemin: string; mime: string; largeur: number; hauteur: number }
  qr: { x: number; y: number; taille: number; fond: boolean; mention: boolean }
}

export async function genererPdfAffiche(d: DonneesPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(d.nom)
  pdf.setCreator('Mindi')
  const octets = await readFile(cheminAbsolu(d.image.chemin))
  const image = d.image.mime === 'image/png' ? await pdf.embedPng(octets) : await pdf.embedJpg(octets)

  // Page au format choisi, orientée comme l'affiche ; image ajustée sans déformation.
  const [l, h] = FORMATS_MM[d.format] ?? FORMATS_MM.A3
  const paysage = d.image.largeur > d.image.hauteur
  const pageL = (paysage ? h : l) * MM_EN_PT
  const pageH = (paysage ? l : h) * MM_EN_PT
  const page = pdf.addPage([pageL, pageH])
  const ech = Math.min(pageL / image.width, pageH / image.height)
  const w = image.width * ech
  const hh = image.height * ech
  const x0 = (pageL - w) / 2
  const y0 = (pageH - hh) / 2
  page.drawImage(image, { x: x0, y: y0, width: w, height: hh })

  // QR code : coordonnées en fractions de l'affiche ; l'origine PDF est en bas à gauche.
  const largeurBloc = d.qr.taille * w
  const marge = d.qr.fond ? largeurBloc * 0.07 : 0
  const coteQr = largeurBloc - marge * 2
  const hauteurMention = d.qr.mention ? largeurBloc * 0.16 : 0
  const xBloc = x0 + d.qr.x * w
  const yHautBloc = y0 + hh - d.qr.y * hh
  if (d.qr.fond || d.qr.mention) {
    page.drawRectangle({ x: xBloc, y: yHautBloc - largeurBloc - hauteurMention, width: largeurBloc, height: largeurBloc + hauteurMention, color: rgb(1, 1, 1) })
  }
  const pngQr = await QRCode.toBuffer(urlQr(d.codeQr, d.origine), { type: 'png', width: 1200, margin: 1, errorCorrectionLevel: 'M' })
  const qr = await pdf.embedPng(pngQr)
  page.drawImage(qr, { x: xBloc + marge, y: yHautBloc - marge - coteQr, width: coteQr, height: coteQr })
  if (d.qr.mention) {
    const police = await pdf.embedFont(StandardFonts.HelveticaBold)
    const taille = largeurBloc * 0.075
    const largeurTexte = police.widthOfTextAtSize(MENTION_QR, taille)
    page.drawText(MENTION_QR, {
      x: xBloc + (largeurBloc - largeurTexte) / 2,
      y: yHautBloc - largeurBloc - hauteurMention * 0.55,
      size: taille,
      font: police,
      color: rgb(0.12, 0.13, 0.14),
    })
  }
  return pdf.save()
}
