// Import d'une affiche en PDF : la première page est rendue en image dans le navigateur avec pdf.js
// (aucun envoi du PDF au serveur), en haute définition, puis envoyée comme une image ordinaire. Le
// serveur la contrôle et la réencode (sharp) ; elle sert de visuel, de cible de reconnaissance 8th Wall
// et pour l'export PDF avec le QR code. Le format papier (A4 à A0) est déduit de la taille de la page.
import { FORMATS_MM } from '../../commun/AfficheQr'

/** Résolution visée pour l'impression, et côté maximal de l'image (poids et mémoire du navigateur). */
const DPI = 300
const COTE_MAX_PX = 6000
const POINTS_PAR_POUCE = 72

export interface PdfConverti {
  /** Image JPEG de la première page, prête à être importée. */
  fichier: File
  largeurPx: number
  hauteurPx: number
  /** Nombre de pages du PDF (seule la première est utilisée). */
  pages: number
  /** Format A4…A0 reconnu d'après la taille de la page, si elle correspond (à 3 % près). */
  format?: string
  /** Résolution obtenue pour la taille réelle de la page. */
  dpi: number
}

export const estPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

export async function pdfVersImage(source: File): Promise<PdfConverti> {
  const [pdfjs, { default: urlWorker }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker
  const base = import.meta.env.BASE_URL
  const tache = pdfjs.getDocument({
    data: new Uint8Array(await source.arrayBuffer()),
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
  })
  let document_: Awaited<typeof tache.promise>
  try {
    document_ = await tache.promise
  } catch (e) {
    const nom = (e as { name?: string }).name
    if (nom === 'PasswordException') throw new Error('Ce PDF est protégé par un mot de passe : exportez-le sans protection.')
    throw new Error('PDF illisible ou corrompu : exportez-le de nouveau depuis votre logiciel de mise en page.')
  }
  try {
    const page = await document_.getPage(1)
    const naturelle = page.getViewport({ scale: 1 }) // en points (1/72 de pouce)
    const echelle = Math.min(DPI / POINTS_PAR_POUCE, COTE_MAX_PX / Math.max(naturelle.width, naturelle.height))
    const vue = page.getViewport({ scale: echelle })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vue.width)
    canvas.height = Math.round(vue.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Conversion du PDF impossible dans ce navigateur.')
    // Fond blanc : les zones transparentes du PDF s'impriment en blanc.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport: vue }).promise
    const blob = await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Conversion du PDF impossible.'))), 'image/jpeg', 0.92))
    page.cleanup()

    const [petitMm, grandMm] = [naturelle.width, naturelle.height].map((p) => (p / POINTS_PAR_POUCE) * 25.4).sort((a, b) => a - b)
    const format = Object.entries(FORMATS_MM).find(([, [l, h]]) => Math.abs(l - petitMm) / l < 0.03 && Math.abs(h - grandMm) / h < 0.03)?.[0]
    return {
      fichier: new File([blob], `${source.name.replace(/\.pdf$/i, '')}.jpg`, { type: 'image/jpeg' }),
      largeurPx: canvas.width,
      hauteurPx: canvas.height,
      pages: document_.numPages,
      format,
      dpi: Math.round(echelle * POINTS_PAR_POUCE),
    }
  } finally {
    await document_.destroy()
  }
}
