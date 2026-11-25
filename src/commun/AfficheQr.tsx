import QRCode from 'qrcode'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DOMAINE_APPLICATION } from './constantes'
import { Icone } from './Icone'
import { FORMATS_MM } from './impression'
import type { Affiche, PlacementQr } from './types'

/**
 * Adresse de l'application encodée dans les QR codes : celle du site lui-même, jamais un lien saisi
 * (BNF-18). Ordre : VITE_URL_PUBLIQUE (tunnel), adresse réseau du PC quand le site est ouvert sur
 * « localhost » (test avec un téléphone), sinon l'origine de la page (le domaine en production).
 */
export function origineApplication() {
  if (import.meta.env.VITE_URL_PUBLIQUE) return import.meta.env.VITE_URL_PUBLIQUE.replace(/\/$/, '')
  if (typeof window === 'undefined') return DOMAINE_APPLICATION
  if (pageLocale() && urlReseau) return urlReseau
  return window.location.origin
}

const pageLocale = () => typeof window !== 'undefined' && /^(localhost|127\.|\[::1\])/.test(window.location.hostname)

/** Adresse réseau du PC (développement) : valeur de départ, puis adresse actuelle lue auprès de Vite. */
let urlReseau = __URL_RESEAU__
const abonnes = new Set<() => void>()

/**
 * En développement, sur « localhost » : relit l'adresse que le téléphone doit ouvrir (IP actuelle du
 * Wi-Fi, vrai port, ou URL_RESEAU de .env) — elle peut avoir changé depuis le démarrage du serveur.
 */
export const urlReseauChargee: Promise<void> =
  import.meta.env.DEV && pageLocale()
    ? fetch('/__url-reseau')
        .then((r) => (r.ok ? (r.json() as Promise<{ url: string | null }>) : null))
        .then((d) => {
          if (d?.url && d.url !== urlReseau) {
            urlReseau = d.url
            abonnes.forEach((f) => f())
          }
        })
        .catch(() => {})
    : Promise.resolve()

/** Origine encodée dans les QR codes, à jour (le composant se redessine quand l'adresse réseau est connue). */
export function useOrigineApplication() {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    origineApplication,
    origineApplication,
  )
}

/** URL du QR code d'une affiche : /a/<code unique>. */
export function urlQr(code: string) {
  return `${origineApplication()}/a/${code}`
}

export const QR_DEFAUT: PlacementQr = { x: 0.74, y: 0.76, taille: 0.2, fond: true, mention: true }
export const MENTION_QR = 'Scannez · expérience RA'

export { FORMATS_MM }

/** Largeur imprimée de l'affiche, en mm, selon son format et son orientation. */
export function largeurImpressionMm(a: Pick<Affiche, 'format' | 'image'>) {
  const [l, h] = FORMATS_MM[a.format ?? 'A3'] ?? FORMATS_MM.A3
  const paysage = !!a.image && a.image.largeur > a.image.hauteur
  return paysage ? h : l
}

export function QrCode({ code, taille = 120, className }: { code: string; taille?: number; className?: string }) {
  const [src, setSrc] = useState('')
  // Redessiné quand l'adresse réseau du PC est connue (test avec un téléphone).
  const origine = useOrigineApplication()
  useEffect(() => {
    let actif = true
    QRCode.toDataURL(urlQr(code), { margin: 1, width: Math.round(taille * 2), errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((u) => actif && setSrc(u))
      .catch(() => {})
    return () => {
      actif = false
    }
  }, [code, taille, origine])
  return src ? <img src={src} alt={`QR code vers ${urlQr(code)}`} className={className} draggable={false} /> : <span className={className} />
}

const borner = (v: number, max: number) => Math.min(Math.max(0, v), Math.max(0, max))

/**
 * Affiche importée avec son QR code superposé. En mode édition, un clic sur l'affiche y place le QR
 * code (centré sous le pointeur, un repère montre où il ira) ; on peut ensuite le faire glisser
 * (souris ou doigt) ou l'ajuster aux flèches du clavier. Il reste dans les limites de l'affiche.
 */
export function AfficheAvecQr({
  image,
  ratio,
  code,
  qr,
  nom,
  onQr,
  className = '',
  sansQr = false,
}: {
  image?: string
  ratio: number
  code: string
  qr: PlacementQr
  nom: string
  onQr?: (p: PlacementQr) => void
  className?: string
  /** QR code pas encore placé (création d'affiche avant l'étape du QR code) : l'affiche seule. */
  sansQr?: boolean
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const bloc = useRef<HTMLDivElement>(null)
  /** Glisser en cours : écart entre le pointeur et le coin haut gauche du QR code (pixels). */
  const glisse = useRef<{ dx: number; dy: number } | null>(null)
  /** Repère au survol : où le QR code sera posé au clic (fractions de l'affiche). */
  const [fantome, setFantome] = useState<{ x: number; y: number; l: number; h: number } | null>(null)

  /** Position du QR code pour un pointeur en (clientX, clientY), à l'écart (dx, dy) de son coin. */
  function positionPour(clientX: number, clientY: number, dx?: number, dy?: number) {
    const c = cadre.current?.getBoundingClientRect()
    const b = bloc.current?.getBoundingClientRect()
    if (!c || !b || !c.width || !c.height) return null
    const l = b.width / c.width
    const h = b.height / c.height
    return {
      x: borner((clientX - c.left - (dx ?? b.width / 2)) / c.width, 1 - l),
      y: borner((clientY - c.top - (dy ?? b.height / 2)) / c.height, 1 - h),
      l,
      h,
    }
  }

  const surBloc = (cible: EventTarget) => !!bloc.current?.contains(cible as Node)

  return (
    <div
      ref={cadre}
      className={`affiche-qr-cadre ${onQr ? 'editable' : ''} ${className}`}
      style={{ aspectRatio: String(ratio) }}
      onPointerDown={(e) => {
        if (!onQr || e.button !== 0) return
        const b = bloc.current?.getBoundingClientRect()
        if (!b) return
        e.preventDefault()
        // Sur le QR code : on le saisit là où on l'a pris. Ailleurs : il saute sous le pointeur.
        glisse.current = surBloc(e.target) ? { dx: e.clientX - b.left, dy: e.clientY - b.top } : { dx: b.width / 2, dy: b.height / 2 }
        e.currentTarget.setPointerCapture(e.pointerId)
        setFantome(null)
        const p = positionPour(e.clientX, e.clientY, glisse.current.dx, glisse.current.dy)
        if (p && !surBloc(e.target)) onQr({ ...qr, x: p.x, y: p.y })
        bloc.current?.focus({ preventScroll: true })
      }}
      onPointerMove={(e) => {
        if (!onQr) return
        if (glisse.current) {
          const p = positionPour(e.clientX, e.clientY, glisse.current.dx, glisse.current.dy)
          if (p) onQr({ ...qr, x: p.x, y: p.y })
        } else setFantome(e.pointerType === 'mouse' && !surBloc(e.target) ? positionPour(e.clientX, e.clientY) : null)
      }}
      onPointerUp={() => (glisse.current = null)}
      onPointerCancel={() => (glisse.current = null)}
      onPointerLeave={() => setFantome(null)}
    >
      {image ? (
        <img src={image} alt={`Affiche ${nom}`} className="affiche-qr-image" draggable={false} />
      ) : (
        <div className="affiche-qr-vide">
          <Icone nom="image" taille={28} />
          <strong>{nom || 'Votre affiche'}</strong>
          <small>Fichier de l’affiche à importer</small>
        </div>
      )}
      {!sansQr && (
      <div
        ref={bloc}
        className={`bloc-qr ${qr.fond ? 'avec-fond' : ''}`}
        // Le padding en % se rapporte à la largeur de l'affiche : 7 % du bloc = taille × 7 %.
        style={{ left: `${qr.x * 100}%`, top: `${qr.y * 100}%`, width: `${qr.taille * 100}%`, padding: qr.fond ? `${qr.taille * 7}%` : 0, containerType: 'inline-size' }}
        role={onQr ? 'slider' : undefined}
        aria-label={onQr ? 'Position du QR code : cliquez sur l’affiche ou glissez pour le déplacer, flèches du clavier pour ajuster' : undefined}
        aria-valuetext={onQr ? `${Math.round(qr.x * 100)} % depuis la gauche, ${Math.round(qr.y * 100)} % depuis le haut` : undefined}
        tabIndex={onQr ? 0 : undefined}
        onKeyDown={(e) => {
          if (!onQr) return
          const pas = e.shiftKey ? 0.05 : 0.01
          const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key]
          if (!d) return
          e.preventDefault()
          const c = cadre.current?.getBoundingClientRect()
          const b = bloc.current?.getBoundingClientRect()
          const hauteur = c && b && c.height ? b.height / c.height : qr.taille
          onQr({ ...qr, x: borner(qr.x + d[0], 1 - qr.taille), y: borner(qr.y + d[1], 1 - hauteur) })
        }}
      >
        <QrCode code={code} taille={240} className="bloc-qr-image" />
        {qr.mention && <span className="bloc-qr-mention">{MENTION_QR}</span>}
      </div>
      )}
      {fantome && !sansQr &&<span className="fantome-qr" style={{ left: `${fantome.x * 100}%`, top: `${fantome.y * 100}%`, width: `${fantome.l * 100}%`, height: `${fantome.h * 100}%` }} aria-hidden="true" />}
    </div>
  )
}
