import maplibregl, { type GeoJSONSource, type LngLatLike, type Map as CarteMapLibre, type Marker } from 'maplibre-gl'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { Coordonnees } from '../../commun/geo'
import type { Lieu } from '../../commun/types'

// Carte MapLibre GL JS (BF-05, BF-06, BF-32). Fond OpenFreeMap (données OpenStreetMap, sans clé) ;
// le cahier des charges prévoit à terme un fichier PMTiles servi par l'API.
const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const CENTRE: LngLatLike = [6.8035, 47.5095]

export interface CentrageCarte {
  longitude: number
  latitude: number
  cle: string
  zoom?: number
}

const PIN =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>'

/** Cercle du rayon de proximité, en polygone GeoJSON. */
function cercle(c: Coordonnees, rayonM: number): Feature<Polygon> {
  const points: [number, number][] = []
  const dLat = rayonM / 111_320
  const dLng = rayonM / (111_320 * Math.cos((c.latitude * Math.PI) / 180))
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    points.push([c.longitude + dLng * Math.cos(a), c.latitude + dLat * Math.sin(a)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [points] } }
}

const vide: FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function CarteLieux({
  lieux,
  selection,
  onSelection,
  position,
  misEnAvant,
  centrage,
  trace,
  marges,
}: {
  lieux: Lieu[]
  selection: string | null
  onSelection: (id: string) => void
  position: Coordonnees | null
  misEnAvant?: string | null
  centrage: CentrageCarte | null
  trace: [number, number][] | null
  marges: { haut: number; bas: number; gauche: number }
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMapLibre | null>(null)
  const marqueurs = useRef(new Map<string, Marker>())
  const moi = useRef<Marker | null>(null)
  const surSelection = useRef(onSelection)
  surSelection.current = onSelection
  const [prete, setPrete] = useState(false)
  const [erreur, setErreur] = useState(false)

  // Création de la carte.
  useEffect(() => {
    if (!conteneur.current) return
    let m: CarteMapLibre
    try {
      m = new maplibregl.Map({
        container: conteneur.current,
        style: STYLE,
        center: CENTRE,
        zoom: 14.6,
        minZoom: 11,
        maxZoom: 19,
        attributionControl: false,
        cooperativeGestures: false,
      })
    } catch {
      setErreur(true)
      return
    }
    carte.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
    m.on('load', () => {
      // Teintes de la maquette : fond crème, eau gris-vert, parcs vert sauge.
      for (const couche of m.getStyle().layers ?? []) {
        if (couche.type === 'background') m.setPaintProperty(couche.id, 'background-color', '#ebe5d9')
        else if (couche.type === 'fill' && /water/.test(couche.id)) m.setPaintProperty(couche.id, 'fill-color', '#c4d3d0')
        else if (couche.type === 'fill' && /park|landcover|wood|grass/.test(couche.id)) m.setPaintProperty(couche.id, 'fill-color', '#d6dbc6')
        else if (couche.type === 'fill' && /building/.test(couche.id)) m.setPaintProperty(couche.id, 'fill-color', '#ddd5c7')
      }
      m.addSource('rayon', { type: 'geojson', data: vide })
      m.addLayer({ id: 'rayon-fond', type: 'fill', source: 'rayon', paint: { 'fill-color': '#7b1e2e', 'fill-opacity': 0.08 } })
      m.addLayer({ id: 'rayon-bord', type: 'line', source: 'rayon', paint: { 'line-color': '#7b1e2e', 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      m.addSource('itineraire', { type: 'geojson', data: vide })
      m.addLayer({ id: 'itineraire-contour', type: 'line', source: 'itineraire', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } })
      m.addLayer({ id: 'itineraire-trace', type: 'line', source: 'itineraire', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7b1e2e', 'line-width': 5 } })
      m.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      setPrete(true)
    })
    m.on('error', (e) => {
      if (String(e.error?.message ?? '').includes('Failed to fetch')) setErreur(true)
    })
    return () => {
      marqueurs.current.clear()
      moi.current = null
      m.remove()
      carte.current = null
    }
  }, [])

  // Zone utile de la carte : sous l'en-tête et au-dessus de la fiche.
  useEffect(() => {
    carte.current?.setPadding({ top: marges.haut, bottom: marges.bas, left: marges.gauche, right: 20 })
  }, [marges.haut, marges.bas, marges.gauche, prete])

  // Marqueurs des lieux.
  useEffect(() => {
    const m = carte.current
    if (!m) return
    const ids = new Set(lieux.map((l) => l.id))
    for (const [id, mk] of marqueurs.current) {
      if (!ids.has(id)) {
        mk.remove()
        marqueurs.current.delete(id)
      }
    }
    for (const l of lieux) {
      let mk = marqueurs.current.get(l.id)
      if (!mk) {
        const ancre = document.createElement('div')
        ancre.className = 'marqueur-ancre'
        const el = document.createElement('button')
        el.type = 'button'
        ancre.appendChild(el)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          surSelection.current(l.id)
        })
        mk = new maplibregl.Marker({ element: ancre, anchor: 'center' }).setLngLat([l.longitude, l.latitude]).addTo(m)
        marqueurs.current.set(l.id, mk)
      }
      mk.setLngLat([l.longitude, l.latitude])
      const el = mk.getElement().firstElementChild as HTMLButtonElement
      el.className = `marqueur ${l.id === selection ? 'selectionne' : ''} ${misEnAvant === l.id ? 'mis-en-avant' : ''}`
      el.setAttribute('aria-label', `Sélectionner ${l.nom}`)
      el.setAttribute('aria-pressed', String(l.id === selection))
      el.innerHTML = `${PIN}<span></span>`
      el.querySelector('span')!.textContent = l.nomCourt
    }
  }, [lieux, selection, misEnAvant, prete])

  // Rayon de proximité du lieu sélectionné.
  useEffect(() => {
    const src = carte.current?.getSource('rayon') as GeoJSONSource | undefined
    const l = lieux.find((x) => x.id === selection)
    src?.setData(l ? cercle(l, l.rayonM) : vide)
  }, [lieux, selection, prete])

  // Position du visiteur.
  useEffect(() => {
    const m = carte.current
    if (!m) return
    if (!position) {
      moi.current?.remove()
      moi.current = null
      return
    }
    if (!moi.current) {
      const el = document.createElement('span')
      el.className = 'point-utilisateur'
      el.setAttribute('aria-label', 'Votre position')
      el.appendChild(document.createElement('span'))
      moi.current = new maplibregl.Marker({ element: el }).setLngLat([position.longitude, position.latitude]).addTo(m)
    } else moi.current.setLngLat([position.longitude, position.latitude])
  }, [position, prete])

  // Itinéraire : tracé et cadrage.
  useEffect(() => {
    const m = carte.current
    const src = m?.getSource('itineraire') as GeoJSONSource | undefined
    if (!m || !src) return
    if (!trace || trace.length < 2) {
      src.setData(vide)
      return
    }
    src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trace } })
    const bornes = trace.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(trace[0], trace[0]))
    m.fitBounds(bornes, { padding: 50, maxZoom: 17, duration: 900 })
  }, [trace, prete])

  // Centrage demandé (lieu sélectionné, lieu promu par une affiche, « Ma position »).
  const cle = centrage?.cle
  const centrageRef = useRef(centrage)
  centrageRef.current = centrage
  const cadrageInitial = useRef(false)
  useEffect(() => {
    const c = centrageRef.current
    const m = carte.current
    if (!m || !prete) return
    if (!c) {
      // Première vue : tous les lieux visibles.
      if (cadrageInitial.current || lieux.length === 0) return
      cadrageInitial.current = true
      const b = lieux.reduce((x, l) => x.extend([l.longitude, l.latitude]), new maplibregl.LngLatBounds([lieux[0].longitude, lieux[0].latitude], [lieux[0].longitude, lieux[0].latitude]))
      m.fitBounds(b, { padding: 60, maxZoom: 15.5, duration: 0 })
      return
    }
    cadrageInitial.current = true
    m.flyTo({ center: [c.longitude, c.latitude], zoom: c.zoom ?? Math.max(m.getZoom(), 15), duration: 900, essential: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, prete])

  return (
    <div className="carte-maplibre">
      <div ref={conteneur} className="carte-maplibre-conteneur" role="region" aria-label="Carte des lieux de Montbéliard" />
      {erreur && (
        <div className="carte-indisponible" role="status">
          Fond de carte indisponible (réseau ou WebGL). Les fiches des lieux restent accessibles.
        </div>
      )}
    </div>
  )
}
