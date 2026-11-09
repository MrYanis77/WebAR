import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { EMPRISE } from './geo'

// Carte stylisée du centre de Montbéliard (style de la maquette), dessinée en SVG
// dans le repère de projection de geo.ts. Elle tient lieu de fond MapLibre/PMTiles hors ligne.

export function FondCarte() {
  return (
    <g className="fond-carte">
      <rect x={-400} y={-400} width={1200} height={1400} fill="#d8d2c6" />
      {/* îlots bâtis */}
      <g fill="#cec7ba">
        <path d="M150 210 L230 190 L250 255 L175 275 Z" />
        <path d="M30 150 L100 140 L110 230 L40 240 Z" />
        <path d="M200 330 L280 310 L295 380 L215 400 Z" />
        <path d="M320 300 L400 290 L400 380 L335 390 Z" />
        <path d="M60 380 L130 365 L150 440 L70 455 Z" />
        <path d="M230 40 L300 30 L310 95 L240 105 Z" />
        <path d="M330 150 L400 140 L400 215 L345 225 Z" />
        <path d="M150 500 L240 490 L250 560 L160 575 Z" />
        <path d="M300 470 L380 455 L395 530 L310 545 Z" />
        <path d="M-60 260 L60 250 L70 300 L-60 320 Z" />
      </g>
      <g fill="#e2ddd3">
        <path d="M60 30 L150 20 L160 90 L70 105 Z" />
        <path d="M170 120 L260 110 L270 170 L180 180 Z" />
        <path d="M250 520 L300 510 L310 600 L255 610 Z" />
        <path d="M-40 520 L80 500 L95 600 L-40 610 Z" />
        <path d="M360 40 L460 30 L460 110 L370 120 Z" />
      </g>
      {/* espaces verts */}
      <path d="M170 395 C200 380 250 385 262 410 C270 440 240 455 205 452 C175 450 160 420 170 395 Z" fill="#cdd1bd" />
      <path d="M95 270 C110 262 128 266 134 280 C138 292 128 304 112 304 C98 302 88 286 95 270 Z" fill="#cbc4b4" />
      {/* l'Allan */}
      <path d="M-60 210 C40 230 70 330 110 360 C150 395 170 470 240 480 C300 488 360 470 460 500" fill="none" stroke="#c4cfcc" strokeWidth={18} strokeLinecap="round" />
      {/* voies principales */}
      <g fill="none" stroke="#faf8f4" strokeLinecap="round" strokeLinejoin="round">
        <g strokeWidth={13}>
          <path d="M-60 312 C60 300 110 322 170 302 S300 250 460 262" />
          <path d="M118 -40 C132 110 108 220 138 300 S152 470 118 660" />
          <path d="M300 -40 C288 100 322 180 312 262 S282 420 302 660" />
          <path d="M140 300 C200 252 252 186 460 140" />
          <path d="M-60 470 C80 438 220 474 460 428" />
        </g>
        <g strokeWidth={7}>
          <path d="M-60 120 C80 140 200 100 300 120 S400 110 460 100" />
          <path d="M210 -40 C215 80 200 160 216 280 S230 400 214 520" />
          <path d="M60 -40 C70 100 40 200 64 360 S50 520 70 660" />
          <path d="M170 302 C190 360 230 380 300 372" />
          <path d="M312 262 C350 300 380 340 460 352" />
          <path d="M138 400 C190 410 240 400 300 410" />
          <path d="M-60 560 C80 548 180 580 460 560" />
          <path d="M330 -40 C360 60 380 80 460 60" />
        </g>
      </g>
      {/* quartiers */}
      <g className="etiquettes-carte" fill="#8a857e" fontSize={9} fontWeight={600} letterSpacing={1.6} fontFamily="Inter, sans-serif">
        <text x={170} y={238}>CENTRE-VILLE</text>
        <text x={18} y={345} transform="rotate(-28 18 345)">L’ALLAN</text>
        <text x={322} y={420}>LA PRAIRIE</text>
        <text x={78} y={515}>PETITE-HOLLANDE</text>
        <text x={250} y={78}>LA CHIFFOGNE</text>
        <text x={24} y={70}>LES GRAPPES</text>
      </g>
    </g>
  )
}

export interface VueCarte {
  x: number
  y: number
  w: number
  h: number
}

export interface Centrage {
  x: number
  y: number
  cle: string | number
  zoom?: number
}

const VUE_DEFAUT: VueCarte = { x: 30, y: 60, w: 360, h: 540 }

/**
 * Carte déplaçable (glisser) et zoomable (molette / boutons). Les marqueurs sont des éléments HTML
 * positionnés grâce à `versEcran`, pour rester accessibles au clavier et aux lecteurs d'écran.
 */
export function CarteInteractive({
  centrage,
  ancrageY = 0.42,
  calques,
  surcouche,
  onClicCarte,
  className,
  vueInitiale = VUE_DEFAUT,
  boutonsZoom = false,
}: {
  centrage?: Centrage | null
  ancrageY?: number
  calques?: ReactNode
  surcouche: (versEcran: (x: number, y: number) => { left: number; top: number }, echelle: number) => ReactNode
  onClicCarte?: (x: number, y: number) => void
  className?: string
  vueInitiale?: VueCarte
  boutonsZoom?: boolean
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [taille, setTaille] = useState({ l: 390, h: 600 })
  const [vue, setVue] = useState<VueCarte>(vueInitiale)
  const glisse = useRef<{ x: number; y: number; vue: VueCarte; bouge: boolean } | null>(null)
  const anim = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = conteneur.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setTaille({ l: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Échelle « slice » : la vue remplit tout le conteneur.
  const echelle = Math.max(taille.l / vue.w, taille.h / vue.h)
  const decalX = (taille.l - vue.w * echelle) / 2
  const decalY = (taille.h - vue.h * echelle) / 2

  const versEcran = useCallback(
    (x: number, y: number) => ({ left: (x - vue.x) * echelle + decalX, top: (y - vue.y) * echelle + decalY }),
    [vue, echelle, decalX, decalY],
  )

  const vueRef = useRef(vue)
  vueRef.current = vue
  const tailleRef = useRef(taille)
  tailleRef.current = taille
  const centrageRef = useRef(centrage)
  centrageRef.current = centrage

  const animerVers = useCallback((cible: VueCarte) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    const depart = performance.now()
    const debut = vueRef.current
    const pas = (t: number) => {
      const k = Math.min(1, (t - depart) / 450)
      const e = 1 - (1 - k) ** 3
      setVue({
        x: debut.x + (cible.x - debut.x) * e,
        y: debut.y + (cible.y - debut.y) * e,
        w: debut.w + (cible.w - debut.w) * e,
        h: debut.h + (cible.h - debut.h) * e,
      })
      if (k < 1) anim.current = requestAnimationFrame(pas)
    }
    anim.current = requestAnimationFrame(pas)
  }, [])

  const cleCentrage = centrage?.cle
  useEffect(() => {
    const c = centrageRef.current
    if (!c || cleCentrage === undefined) return
    const v = vueRef.current
    const { l, h: hauteur } = tailleRef.current
    const facteur = c.zoom ?? 1
    const w = v.w * facteur
    const h = v.h * facteur
    const ech = Math.max(l / w, hauteur / h)
    // Place le point à (50 %, ancrageY) de l'écran.
    animerVers({
      x: c.x - (l * 0.5 - (l - w * ech) / 2) / ech,
      y: c.y - (hauteur * ancrageY - (hauteur - h * ech) / 2) / ech,
      w,
      h,
    })
  }, [cleCentrage, ancrageY, animerVers])

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current)
  }, [])

  function zoomer(facteur: number, cx = taille.l / 2, cy = taille.h / 2) {
    setVue((v) => {
      const w = Math.min(900, Math.max(120, v.w * facteur))
      const h = (w / v.w) * v.h
      const ech = Math.max(taille.l / v.w, taille.h / v.h)
      const px = v.x + (cx - (taille.l - v.w * ech) / 2) / ech
      const py = v.y + (cy - (taille.h - v.h * ech) / 2) / ech
      const ech2 = Math.max(taille.l / w, taille.h / h)
      return { x: px - (cx - (taille.l - w * ech2) / 2) / ech2, y: py - (cy - (taille.h - h * ech2) / 2) / ech2, w, h }
    })
  }

  return (
    <div
      ref={conteneur}
      className={`carte-interactive ${className ?? ''}`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return
        glisse.current = { x: e.clientX, y: e.clientY, vue, bouge: false }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const g = glisse.current
        if (!g) return
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (Math.abs(dx) + Math.abs(dy) > 4) g.bouge = true
        const limite = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val))
        setVue({
          ...g.vue,
          x: limite(g.vue.x - dx / echelle, -150, EMPRISE.largeur + 150 - g.vue.w),
          y: limite(g.vue.y - dy / echelle, -150, EMPRISE.hauteur + 150 - g.vue.h),
        })
      }}
      onPointerUp={(e) => {
        const g = glisse.current
        glisse.current = null
        if (g && !g.bouge && onClicCarte && conteneur.current) {
          const r = conteneur.current.getBoundingClientRect()
          onClicCarte(vue.x + (e.clientX - r.left - decalX) / echelle, vue.y + (e.clientY - r.top - decalY) / echelle)
        }
      }}
      onWheel={(e) => {
        const r = conteneur.current?.getBoundingClientRect()
        if (!r) return
        zoomer(e.deltaY > 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top)
      }}
    >
      <svg viewBox={`${vue.x} ${vue.y} ${vue.w} ${vue.h}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Plan du centre de Montbéliard">
        <FondCarte />
        {calques}
      </svg>
      {surcouche(versEcran, echelle)}
      {boutonsZoom && (
        <div className="zoom-carte">
          <button type="button" onClick={() => zoomer(0.8)} aria-label="Zoomer">
            +
          </button>
          <button type="button" onClick={() => zoomer(1.25)} aria-label="Dézoomer">
            −
          </button>
        </div>
      )}
    </div>
  )
}
