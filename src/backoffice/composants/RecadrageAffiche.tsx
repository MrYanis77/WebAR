import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { FORMATS_MM } from '../../commun/impression'
import { Icone } from '../../commun/Icone'

/** Côté le plus long de l'image produite (limite des canvas des navigateurs et du poids d'import). */
const COTE_MAX_PX = 8000
const POIDS_MAX_OCTETS = 30_000_000
const ZOOM_MAX = 6
/** Résolution d'impression visée : le résultat n'est jamais produit en dessous. */
const DPI_CIBLE = 150
/** Sous cette résolution d'origine, l'agrandissement rendra l'impression visiblement floue. */
const DPI_FAIBLE = 90

interface Cadrage {
  /** Facteur appliqué à l'échelle « remplir » (1 = l'image couvre toute la page). */
  zoom: number
  /** Centre de l'image par rapport au centre de la page, en fraction de la largeur / hauteur de la page. */
  x: number
  y: number
  /** Rotation de l'image, en quarts de tour. */
  quarts: number
}

/**
 * Recadrage de l'affiche au format d'impression (A4 à A0, portrait ou paysage) : l'image est déplacée
 * à la souris (ou au clavier), agrandie ou rétrécie (molette, curseur, boutons) et tournée d'un quart
 * de tour. Rétrécie sous la page, elle laisse des marges blanches. Le résultat est une image JPEG aux
 * proportions exactes du format, à la résolution de l'image d'origine.
 */
export function RecadrageAffiche({
  source,
  nom,
  formatInitial,
  onValider,
  onTelQuel,
  onAnnuler,
}: {
  source: Blob
  nom: string
  formatInitial: string
  onValider: (fichier: File, format: string) => void
  /** Importe le fichier d'origine sans le recadrer. */
  onTelQuel?: () => void
  onAnnuler: () => void
}) {
  const [url, setUrl] = useState('')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [calcul, setCalcul] = useState(false)
  const [format, setFormat] = useState(FORMATS_MM[formatInitial] ? formatInitial : 'A3')
  const [paysage, setPaysage] = useState<boolean | null>(null)
  const [cadrage, setCadrage] = useState<Cadrage>({ zoom: 1, x: 0, y: 0, quarts: 0 })
  const [ecran, setEcran] = useState(() => ({ l: window.innerWidth, h: window.innerHeight }))
  const glisse = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null)

  // L'URL blob: est créée et révoquée dans le même effet : en StrictMode (développement), React démonte
  // puis remonte le composant, et une URL créée hors de l'effet serait révoquée avant d'être chargée.
  useEffect(() => {
    const lien = URL.createObjectURL(source)
    let actif = true
    const i = new Image()
    i.onload = () => {
      if (!actif) return
      setUrl(lien)
      setImg(i)
      setPaysage((p) => p ?? i.naturalWidth > i.naturalHeight)
    }
    i.onerror = () => actif && setErreur('Image illisible ou corrompue.')
    i.src = lien
    return () => {
      actif = false
      URL.revokeObjectURL(lien)
    }
  }, [source])
  useEffect(() => {
    const surRedim = () => setEcran({ l: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', surRedim)
    return () => window.removeEventListener('resize', surRedim)
  }, [])
  useEffect(() => {
    const echap = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onAnnuler()
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onAnnuler])

  // ------------------------------------------------------------ géométrie
  const [fl, fh] = FORMATS_MM[format]
  const pageMm = paysage ? { l: fh, h: fl } : { l: fl, h: fh }
  const ratioPage = pageMm.l / pageMm.h
  // Page affichée : la plus grande possible dans la fenêtre, marge autour pour voir l'image qui déborde.
  const MARGE = ecran.l < 700 ? 16 : 32
  const maxL = Math.min(620, ecran.l - 110 - 2 * MARGE)
  const maxH = Math.max(160, Math.min(560, ecran.h - 380 - 2 * MARGE))
  const pageL = Math.max(120, ratioPage > maxL / maxH ? maxL : maxH * ratioPage)
  const pageH = pageL / ratioPage

  const tourne = cadrage.quarts % 2 === 1
  const imgL = img ? (tourne ? img.naturalHeight : img.naturalWidth) : 1
  const imgH = img ? (tourne ? img.naturalWidth : img.naturalHeight) : 1
  const echelleRemplir = Math.max(pageL / imgL, pageH / imgH)
  const echelleAjuster = Math.min(pageL / imgL, pageH / imgH)
  const zoomMin = Math.min(1, (echelleAjuster / echelleRemplir) * 0.5)
  const zoomAjuster = echelleAjuster / echelleRemplir

  /** Garde l'image dans la page (plus petite) ou la page couverte (plus grande), sur chaque axe. */
  function borner(c: Cadrage): Cadrage {
    const zoom = Math.min(ZOOM_MAX, Math.max(zoomMin, c.zoom))
    const s = echelleRemplir * zoom
    const jeuX = Math.abs(imgL * s - pageL) / 2 / pageL
    const jeuY = Math.abs(imgH * s - pageH) / 2 / pageH
    return { ...c, zoom, x: Math.min(jeuX, Math.max(-jeuX, c.x)), y: Math.min(jeuY, Math.max(-jeuY, c.y)) }
  }
  const c = borner(cadrage)
  const maj = (p: Partial<Cadrage>) => setCadrage((x) => borner({ ...x, ...p }))
  const s = echelleRemplir * c.zoom
  const affL = imgL * s
  const affH = imgH * s

  // Résolution du résultat. La page mesure pageL / s pixels de l'image d'origine (résolution « native ») ;
  // le résultat est produit à au moins DPI_CIBLE pour le format (l'image est alors agrandie, lissée),
  // sans dépasser COTE_MAX_PX sur le grand côté.
  const pouces = pageMm.l / 25.4
  const natifL = pageL / s
  const dpiNatif = Math.round(natifL / pouces)
  const voulueL = Math.max(natifL, DPI_CIBLE * pouces)
  const sortieL = Math.max(1, Math.round(Math.min(voulueL, COTE_MAX_PX * Math.min(1, ratioPage))))
  const sortieH = Math.max(1, Math.round(sortieL / ratioPage))
  const dpiSortie = Math.round(sortieL / pouces)
  const qualite: 'ok' | 'agrandie' | 'faible' = dpiNatif >= DPI_CIBLE ? 'ok' : dpiNatif >= DPI_FAIBLE ? 'agrandie' : 'faible'
  const marges = affL < pageL - 1 || affH < pageH - 1

  // ------------------------------------------------------------ interactions
  /** Zoom autour d'un point de la page (px depuis son centre) : ce point reste sous le curseur. */
  function zoomer(zoom: number, px = 0, py = 0) {
    setCadrage((x) => {
      const b = borner(x)
      const z = Math.min(ZOOM_MAX, Math.max(zoomMin, zoom))
      const k = z / b.zoom
      const cx = px - (px - b.x * pageL) * k
      const cy = py - (py - b.y * pageH) * k
      return borner({ ...b, zoom: z, x: cx / pageL, y: cy / pageH })
    })
  }
  const centreScene = useRef<HTMLDivElement>(null)
  function pointPage(e: { clientX: number; clientY: number }) {
    const r = centreScene.current?.getBoundingClientRect()
    return r ? { px: e.clientX - (r.left + r.width / 2), py: e.clientY - (r.top + r.height / 2) } : { px: 0, py: 0 }
  }
  // Molette : écouteur natif non passif, pour empêcher la fenêtre de défiler en même temps qu'on zoome
  // (React enregistre « wheel » en passif : preventDefault y est sans effet et la fenêtre tremble).
  const scene = useRef<HTMLDivElement>(null)
  const surMolette = useRef<(e: globalThis.WheelEvent) => void>(() => {})
  surMolette.current = (e) => {
    e.preventDefault()
    const { px, py } = pointPage(e)
    // Pas borné : une molette « à crans » et un pavé tactile zooment à la même vitesse.
    const delta = Math.max(-120, Math.min(120, e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY))
    zoomer(c.zoom * Math.exp(-delta * 0.0015), px, py)
  }
  useEffect(() => {
    const el = scene.current
    if (!el) return
    const h = (e: globalThis.WheelEvent) => surMolette.current(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  function surAppui(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    glisse.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: c.x, y: c.y }
  }
  function surDeplacement(e: PointerEvent<HTMLDivElement>) {
    const g = glisse.current
    if (!g || g.id !== e.pointerId) return
    maj({ x: g.x + (e.clientX - g.px) / pageL, y: g.y + (e.clientY - g.py) / pageH })
  }
  function surClavier(e: KeyboardEvent) {
    const pas = e.shiftKey ? 0.05 : 0.01
    const d: Record<string, [number, number]> = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }
    if (d[e.key]) {
      e.preventDefault()
      maj({ x: c.x + d[e.key][0], y: c.y + d[e.key][1] })
    } else if (e.key === '+' || e.key === '=') zoomer(c.zoom * 1.1)
    else if (e.key === '-') zoomer(c.zoom / 1.1)
  }

  // ------------------------------------------------------------ export
  async function valider() {
    if (!img) return
    setCalcul(true)
    setErreur(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = sortieL
      canvas.height = sortieH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas indisponible')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, sortieL, sortieH)
      ctx.imageSmoothingQuality = 'high'
      // Passage de l'écran (px de la page affichée) au résultat.
      const k = sortieL / pageL
      ctx.translate(sortieL / 2 + c.x * pageL * k, sortieH / 2 + c.y * pageH * k)
      ctx.rotate((c.quarts * Math.PI) / 2)
      const l = img.naturalWidth * s * k
      const h = img.naturalHeight * s * k
      ctx.drawImage(img, -l / 2, -h / 2, l, h)
      let qualite = 0.92
      let blob: Blob | null = null
      while (qualite >= 0.6) {
        blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualite))
        if (!blob || blob.size <= POIDS_MAX_OCTETS) break
        qualite -= 0.1
      }
      if (!blob) throw new Error('Export impossible')
      const base = nom.replace(/\.[^.]+$/, '') || 'affiche'
      onValider(new File([blob], `${base}-${format}.jpg`, { type: 'image/jpeg' }), format)
    } catch {
      setErreur('Le recadrage a échoué : image trop grande pour le navigateur. Essayez de zoomer davantage.')
    } finally {
      setCalcul(false)
    }
  }

  const sceneL = pageL + 2 * MARGE
  const sceneH = pageH + 2 * MARGE
  const transformeImage = `translate(-50%, -50%) translate(${c.x * pageL}px, ${c.y * pageH}px) rotate(${c.quarts * 90}deg)`
  // L'élément <img> garde ses dimensions d'origine (avant rotation).
  const elemL = img ? img.naturalWidth * s : 0
  const elemH = img ? img.naturalHeight * s : 0

  return createPortal(
    <div className="bo-voile centre" onClick={onAnnuler}>
      <div
        className="dialogue recadrage"
        role="dialog"
        aria-modal="true"
        aria-label="Recadrer l’affiche"
        // Largeur fixée par la scène (et non par les textes) : la fenêtre ne bouge pas pendant le zoom.
        style={{ width: Math.min(ecran.l - 32, Math.max(520, sceneL + 44)) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recadrage-tete">
          <div>
            <h2>Recadrer l’affiche</h2>
            <p className="dialogue-texte">Faites glisser l’image, zoomez à la molette ou avec le curseur. Le cadre correspond exactement à la feuille imprimée.</p>
          </div>
          <button type="button" className="bo-icone" onClick={onAnnuler} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </div>

        <div className="recadrage-options">
          <label className="champ">
            <span className="etiquette">Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {Object.entries(FORMATS_MM).map(([f, [l, h]]) => (
                <option key={f} value={f}>
                  {f} — {l / 10} × {h / 10} cm
                </option>
              ))}
            </select>
          </label>
          <div className="choix-segment" role="group" aria-label="Orientation">
            <button type="button" className={!paysage ? 'actif' : ''} onClick={() => setPaysage(false)}>
              Portrait
            </button>
            <button type="button" className={paysage ? 'actif' : ''} onClick={() => setPaysage(true)}>
              Paysage
            </button>
          </div>
          <div className="boutons-rapides">
            <button type="button" className={Math.abs(c.zoom - 1) < 0.005 && !c.x && !c.y ? 'actif' : ''} onClick={() => setCadrage((x) => ({ ...x, zoom: 1, x: 0, y: 0 }))} title="L’image couvre toute la feuille (les bords qui dépassent sont coupés)">
              Remplir
            </button>
            <button type="button" className={Math.abs(c.zoom - zoomAjuster) < 0.005 && !c.x && !c.y ? 'actif' : ''} onClick={() => setCadrage((x) => ({ ...x, zoom: zoomAjuster, x: 0, y: 0 }))} title="Toute l’image est visible (marges blanches)">
              Ajuster
            </button>
            <button type="button" onClick={() => setCadrage((x) => ({ ...x, quarts: (x.quarts + 1) % 4, x: 0, y: 0 }))} title="Tourner d’un quart de tour">
              <Icone nom="pivoter" taille={14} /> Tourner
            </button>
          </div>
        </div>

        <div
          ref={scene}
          className="recadrage-scene"
          style={{ width: sceneL, height: sceneH }}
          tabIndex={0}
          onPointerDown={surAppui}
          onPointerMove={surDeplacement}
          onPointerUp={() => (glisse.current = null)}
          onPointerCancel={() => (glisse.current = null)}
          onKeyDown={surClavier}
          aria-label="Zone de recadrage : flèches pour déplacer, + et − pour zoomer"
        >
          <div ref={centreScene} className="recadrage-page" style={{ width: pageL, height: pageH }} />
          {img ? (
            <img src={url} alt="" draggable={false} className="recadrage-image" style={{ width: elemL, height: elemH, transform: transformeImage }} />
          ) : (
            !erreur && <span className="spinner recadrage-attente" />
          )}
          <div className="recadrage-cadre" style={{ width: pageL, height: pageH }}>
            <span style={{ left: '33.333%' }} />
            <span style={{ left: '66.666%' }} />
            <span className="h" style={{ top: '33.333%' }} />
            <span className="h" style={{ top: '66.666%' }} />
          </div>
        </div>

        <div className="recadrage-zoom">
          <button type="button" className="bo-icone" onClick={() => zoomer(c.zoom / 1.15)} aria-label="Rétrécir" disabled={c.zoom <= zoomMin + 1e-6}>
            <Icone nom="moins" taille={16} />
          </button>
          <input
            type="range"
            min={Math.log(zoomMin)}
            max={Math.log(ZOOM_MAX)}
            step={0.001}
            value={Math.log(c.zoom)}
            onChange={(e) => zoomer(Math.exp(Number(e.target.value)))}
            aria-label="Zoom"
          />
          <button type="button" className="bo-icone" onClick={() => zoomer(c.zoom * 1.15)} aria-label="Agrandir" disabled={c.zoom >= ZOOM_MAX - 1e-6}>
            <Icone nom="plus" taille={16} />
          </button>
          <span className="recadrage-pourcent">{Math.round(c.zoom * 100)} %</span>
        </div>

        {/* Hauteur réservée : le texte change pendant le zoom sans faire bouger la fenêtre. */}
        <div className={`recadrage-info ${qualite}`} aria-live="polite">
          {img && (
            <>
              <Icone nom={qualite === 'ok' ? 'check' : qualite === 'agrandie' ? 'info' : 'alerte'} taille={14} />
              <span>
                <strong>
                  {sortieL} × {sortieH} px · {dpiSortie} dpi en {format}
                  {marges ? ' · marges blanches' : ''}
                </strong>
                <small>
                  {qualite === 'ok'
                    ? 'Qualité d’impression suffisante.'
                    : qualite === 'agrandie'
                      ? `Image d’origine à ${dpiNatif} dpi pour ce cadrage : agrandie à ${DPI_CIBLE} dpi, légère perte de netteté possible.`
                      : `Image d’origine à ${dpiNatif} dpi seulement pour ce cadrage : l’impression sera floue. Zoomez moins, choisissez un format plus petit ou un fichier plus grand.`}
                </small>
              </span>
            </>
          )}
        </div>
        {erreur && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreur}
          </p>
        )}

        <div className="dialogue-actions">
          <button type="button" className="btn btn-fantome" onClick={onAnnuler}>
            Annuler
          </button>
          {onTelQuel && (
            <button type="button" className="btn btn-secondaire" onClick={onTelQuel} disabled={calcul}>
              Garder sans recadrer
            </button>
          )}
          <button type="button" className="btn btn-primaire" onClick={() => void valider()} disabled={!img || calcul}>
            {calcul ? <span className="spinner" /> : <Icone nom="check" taille={15} />} Valider le recadrage
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
