// Carte des zones d'affichage sur un vrai fond de carte (MapLibre GL JS, plan OpenFreeMap / OpenStreetMap).
// L'ancienne carte stylisée ne montrait qu'un petit morceau du centre-ville : ici, toute la ville est
// navigable et la vue se cadre d'elle-même sur l'ensemble des zones. Un repère par zone, cliquable.
// Sert à la page « Zones d'affichage » et au choix de l'emplacement au début de la création d'une affiche.
import maplibregl, { type LngLatBoundsLike, type Map as CarteMapLibre, type Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Zone } from '../../commun/types'

const PLAN = 'https://tiles.openfreemap.org/styles/positron'
/** Centre de Montbéliard : vue de départ quand aucune zone n'est encore placée. */
const MONTBELIARD: [number, number] = [6.7983, 47.5097]
/** Icône « affiche » (mêmes tracés que l'icône de l'interface), dans la pastille du repère. */
const ICONE_AFFICHE =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>'

/** Position renseignée (les anciennes zones peuvent ne pas en avoir : 0, 0). */
export const zonePositionnee = (z: Pick<Zone, 'latitude' | 'longitude'>) => !!z.latitude && !!z.longitude

export default function CarteZones({
  zones,
  choisie,
  survol,
  onChoix,
  libelleRepere = (z) => `${z.nom} — ${z.adresse}`,
  className = 'carte-zones',
}: {
  zones: Zone[]
  /** Zone mise en avant (zone choisie pour une affiche). */
  choisie?: string
  /** Zone survolée dans une liste à côté de la carte. */
  survol?: string | null
  onChoix: (z: Zone) => void
  /** Texte d'aide et nom accessible d'un repère. */
  libelleRepere?: (z: Zone) => string
  className?: string
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMapLibre | null>(null)
  const reperes = useRef(new Map<string, Marker>())
  const rappels = useRef({ onChoix, libelleRepere, zones })
  // Toujours les dernières valeurs pour les repères (créés une fois) ; mises à jour avant les effets ci-dessous.
  useLayoutEffect(() => {
    rappels.current = { onChoix, libelleRepere, zones }
  })
  /** Le cadrage automatique n'a lieu qu'au premier affichage et quand une zone apparaît ou disparaît. */
  const cadrageFait = useRef('')

  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const m = new maplibregl.Map({ container: el, style: PLAN, center: MONTBELIARD, zoom: 13, maxZoom: 19, attributionControl: false })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.FullscreenControl(), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'bottom-right')
    carte.current = m
    const observateur = new ResizeObserver(() => m.resize())
    observateur.observe(el)
    const liste = reperes.current
    return () => {
      observateur.disconnect()
      for (const r of liste.values()) r.remove()
      liste.clear()
      m.remove()
      carte.current = null
      cadrageFait.current = ''
    }
  }, [])

  // Repères créés, déplacés ou retirés avec les zones ; cadrage sur l'ensemble.
  const cle = zones.map((z) => `${z.id}:${z.latitude}:${z.longitude}:${z.active}:${z.nom}`).join('|')
  useEffect(() => {
    const m = carte.current
    if (!m) return
    const placees = rappels.current.zones.filter(zonePositionnee)
    const vues = new Set<string>()
    for (const z of placees) {
      vues.add(z.id)
      let r = reperes.current.get(z.id)
      if (!r) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'repere-zone'
        el.innerHTML = `<span>${ICONE_AFFICHE}</span>`
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          const actuelle = rappels.current.zones.find((x) => x.id === z.id)
          if (actuelle) rappels.current.onChoix(actuelle)
        })
        r = new maplibregl.Marker({ element: el }).setLngLat([z.longitude, z.latitude]).addTo(m)
        reperes.current.set(z.id, r)
      }
      r.setLngLat([z.longitude, z.latitude])
      const el = r.getElement()
      el.classList.toggle('inactive', !z.active)
      el.title = rappels.current.libelleRepere(z)
      el.setAttribute('aria-label', rappels.current.libelleRepere(z))
    }
    for (const [id, r] of reperes.current) {
      if (vues.has(id)) continue
      r.remove()
      reperes.current.delete(id)
    }

    const ids = placees
      .map((z) => z.id)
      .sort()
      .join(',')
    if (ids === cadrageFait.current) return
    cadrageFait.current = ids
    if (placees.length === 1) m.jumpTo({ center: [placees[0].longitude, placees[0].latitude], zoom: 16 })
    else if (placees.length > 1) {
      const lng = placees.map((z) => z.longitude)
      const lat = placees.map((z) => z.latitude)
      const limites: LngLatBoundsLike = [
        [Math.min(...lng), Math.min(...lat)],
        [Math.max(...lng), Math.max(...lat)],
      ]
      m.fitBounds(limites, { padding: 56, maxZoom: 16, duration: 0 })
    }
  }, [cle])

  // Zone choisie ou survolée : repère agrandi et mis au premier plan.
  useEffect(() => {
    for (const [id, r] of reperes.current) {
      const el = r.getElement()
      el.classList.toggle('choisie', id === choisie)
      el.classList.toggle('survol', id === survol)
      el.setAttribute('aria-pressed', String(id === choisie))
    }
  }, [choisie, survol, cle])

  return <div className={className} ref={conteneur} />
}
