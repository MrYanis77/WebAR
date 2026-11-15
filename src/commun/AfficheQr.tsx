import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { DOMAINE_APPLICATION } from './constantes'
import { Icone } from './Icone'
import type { Affiche, PlacementQr } from './types'

/** URL du QR code : toujours le domaine de l'application, jamais un lien saisi (BNF-18). */
export function urlQr(code: string) {
  return `${DOMAINE_APPLICATION}/a/${code}`
}

export const QR_DEFAUT: PlacementQr = { x: 0.74, y: 0.76, taille: 0.2, fond: true, mention: true }
export const MENTION_QR = 'Scannez · expérience RA'

/** Dimensions des formats d'impression, en millimètres (portrait). */
export const FORMATS_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
}

/** Largeur imprimée de l'affiche, en mm, selon son format et son orientation. */
export function largeurImpressionMm(a: Pick<Affiche, 'format' | 'image'>) {
  const [l, h] = FORMATS_MM[a.format ?? 'A3'] ?? FORMATS_MM.A3
  const paysage = !!a.image && a.image.largeur > a.image.hauteur
  return paysage ? h : l
}

export function QrCode({ code, taille = 120, className }: { code: string; taille?: number; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let actif = true
    QRCode.toDataURL(urlQr(code), { margin: 1, width: Math.round(taille * 2), errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((u) => actif && setSrc(u))
      .catch(() => {})
    return () => {
      actif = false
    }
  }, [code, taille])
  return src ? <img src={src} alt={`QR code vers ${urlQr(code)}`} className={className} draggable={false} /> : <span className={className} />
}

/**
 * Affiche importée avec son QR code superposé. En mode édition, le QR code se déplace
 * au glisser (souris ou doigt) et reste dans les limites de l'affiche.
 */
export function AfficheAvecQr({
  image,
  ratio,
  code,
  qr,
  nom,
  onQr,
  className = '',
}: {
  image?: string
  ratio: number
  code: string
  qr: PlacementQr
  nom: string
  onQr?: (p: PlacementQr) => void
  className?: string
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const bloc = useRef<HTMLDivElement>(null)
  const glisse = useRef<{ dx: number; dy: number } | null>(null)

  function deplacer(clientX: number, clientY: number) {
    const c = cadre.current?.getBoundingClientRect()
    const b = bloc.current?.getBoundingClientRect()
    if (!c || !b || !glisse.current || !onQr) return
    const x = (clientX - c.left - glisse.current.dx) / c.width
    const y = (clientY - c.top - glisse.current.dy) / c.height
    onQr({ ...qr, x: Math.min(Math.max(0, x), 1 - b.width / c.width), y: Math.min(Math.max(0, y), 1 - b.height / c.height) })
  }

  return (
    <div ref={cadre} className={`affiche-qr-cadre ${onQr ? 'editable' : ''} ${className}`} style={{ aspectRatio: String(ratio) }}>
      {image ? (
        <img src={image} alt={`Affiche ${nom}`} className="affiche-qr-image" draggable={false} />
      ) : (
        <div className="affiche-qr-vide">
          <Icone nom="image" taille={28} />
          <strong>{nom || 'Votre affiche'}</strong>
          <small>Fichier de l’affiche à importer</small>
        </div>
      )}
      <div
        ref={bloc}
        className={`bloc-qr ${qr.fond ? 'avec-fond' : ''}`}
        // Le padding en % se rapporte à la largeur de l'affiche : 7 % du bloc = taille × 7 %.
        style={{ left: `${qr.x * 100}%`, top: `${qr.y * 100}%`, width: `${qr.taille * 100}%`, padding: qr.fond ? `${qr.taille * 7}%` : 0, containerType: 'inline-size' }}
        role={onQr ? 'slider' : undefined}
        aria-label={onQr ? 'Position du QR code : glissez pour le déplacer, flèches du clavier pour ajuster' : undefined}
        aria-valuetext={onQr ? `${Math.round(qr.x * 100)} % depuis la gauche, ${Math.round(qr.y * 100)} % depuis le haut` : undefined}
        tabIndex={onQr ? 0 : undefined}
        onKeyDown={(e) => {
          if (!onQr) return
          const pas = e.shiftKey ? 0.05 : 0.01
          const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key]
          if (!d) return
          e.preventDefault()
          onQr({ ...qr, x: Math.min(Math.max(0, qr.x + d[0]), 1 - qr.taille), y: Math.min(Math.max(0, qr.y + d[1]), 0.98) })
        }}
        onPointerDown={(e) => {
          if (!onQr) return
          const b = e.currentTarget.getBoundingClientRect()
          glisse.current = { dx: e.clientX - b.left, dy: e.clientY - b.top }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => deplacer(e.clientX, e.clientY)}
        onPointerUp={() => (glisse.current = null)}
      >
        <QrCode code={code} taille={240} className="bloc-qr-image" />
        {qr.mention && <span className="bloc-qr-mention">{MENTION_QR}</span>}
      </div>
    </div>
  )
}
