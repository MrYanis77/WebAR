// Choix d'une position précise sur une vraie carte (MapLibre GL JS) : vue satellite (orthophotos IGN,
// Licence Ouverte, sans clé) ou plan (OpenFreeMap, données OpenStreetMap), zoom jusqu'au bâtiment,
// inclinaison 3D, plein écran et recherche d'adresse (Base Adresse Nationale). Un clic ou un glisser
// du repère fixe la position. Options : rayon autour du point, repère d'un point de référence (le lieu,
// pour placer le modèle 3D d'une animation) et flèche d'orientation.
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson'
import maplibregl, { type GeoJSONSource, type Map as CarteMapLibre, type Marker, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { Coordonnees } from '../../commun/geo'
import { Icone } from '../../commun/Icone'

type Fond = 'satellite' | 'plan'

/** Orthophotos de l'IGN (Géoplateforme, flux WMTS public). */
export const SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    ortho: {
      type: 'raster',
      tiles: [
        'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© IGN – Géoplateforme',
    },
  },
  layers: [{ id: 'ortho', type: 'raster', source: 'ortho' }],
}
const PLAN = 'https://tiles.openfreemap.org/styles/liberty'

const vide: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function cercle(c: Coordonnees, rayonM: number): Feature<Polygon> {
  const points: [number, number][] = []
  const dLat = rayonM / 111_320
  const dLng = rayonM / (111_320 * Math.cos((c.latitude * Math.PI) / 180))
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    points.push([c.longitude + dLng * Math.cos(a), c.latitude + dLat * Math.sin(a)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [points] } }
}

/** Point à `distanceM` mètres de `c` dans la direction `capDeg` (0 = nord). */
export function decaler(c: Coordonnees, capDeg: number, distanceM: number): [number, number] {
  const a = (capDeg * Math.PI) / 180
  return [c.longitude + (Math.sin(a) * distanceM) / (111_320 * Math.cos((c.latitude * Math.PI) / 180)), c.latitude + (Math.cos(a) * distanceM) / 111_320]
}

export function ligne(points: [number, number][]): Feature<LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } }
}

export function element(classe: string, taille: number) {
  const el = document.createElement('div')
  el.className = classe
  el.innerHTML = `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.5" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>`
  return el
}

export function ChoixPosition({
  latitude,
  longitude,
  rayonM,
  reference,
  orientationDeg,
  rechercheInitiale = '',
  onChange,
}: {
  /** Texte proposé dans la recherche d'adresse (ex. l'adresse saisie pour le lieu). */
  rechercheInitiale?: string
  latitude: number
  longitude: number
  rayonM?: number
  reference?: Coordonnees
  /** Cap de la face avant (0 = nord), dessiné en flèche depuis le point. */
  orientationDeg?: number
  onChange: (lat: number, lng: number) => void
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMapLibre | null>(null)
  const repere = useRef<Marker | null>(null)
  const repereReference = useRef<Marker | null>(null)
  const surChangement = useRef(onChange)
  surChangement.current = onChange
  const [fond, setFond] = useState<Fond>('satellite')
  const [prete, setPrete] = useState(0) // incrémenté à chaque (re)chargement du style
  const [recherche, setRecherche] = useState(rechercheInitiale)
  const [messageRecherche, setMessageRecherche] = useState<string | null>(null)

  const choisir = (lat: number, lng: number) => surChangement.current(Number(lat.toFixed(6)), Number(lng.toFixed(6)))

  // Création de la carte, centrée sur la position actuelle.
  useEffect(() => {
    if (!conteneur.current) return
    const m = new maplibregl.Map({
      container: conteneur.current,
      style: SATELLITE,
      center: [longitude, latitude],
      zoom: 17.5,
      maxZoom: 21,
      attributionControl: false,
    })
    carte.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.FullscreenControl(), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    m.on('click', (e) => choisir(e.lngLat.lat, e.lngLat.lng))
    m.on('style.load', () => {
      m.addSource('rayon', { type: 'geojson', data: vide })
      m.addLayer({ id: 'rayon-fond', type: 'fill', source: 'rayon', paint: { 'fill-color': '#7b1e2e', 'fill-opacity': 0.15 } })
      m.addLayer({ id: 'rayon-bord', type: 'line', source: 'rayon', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addSource('traits', { type: 'geojson', data: vide })
      m.addLayer({ id: 'traits', type: 'line', source: 'traits', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#4fd1c5', 'line-width': 3 } })
      setPrete((n) => n + 1)
    })
    const marqueur = new maplibregl.Marker({ element: element('repere-carte', 34), anchor: 'bottom', draggable: true }).setLngLat([longitude, latitude]).addTo(m)
    marqueur.on('dragend', () => {
      const p = marqueur.getLngLat()
      choisir(p.lat, p.lng)
    })
    repere.current = marqueur
    return () => {
      repere.current = null
      repereReference.current = null
      m.remove()
      carte.current = null
    }
    // La carte n'est créée qu'une fois ; la position suit ensuite les props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Changement de fond (le style est remplacé, les calques ajoutés sont recréés à « style.load »).
  const fondInitial = useRef(true)
  useEffect(() => {
    if (fondInitial.current) {
      fondInitial.current = false
      return
    }
    carte.current?.setStyle(fond === 'satellite' ? SATELLITE : PLAN, { diff: false })
  }, [fond])

  // Repère, rayon, point de référence et flèche d'orientation suivent les valeurs du formulaire.
  useEffect(() => {
    const m = carte.current
    if (!m) return
    repere.current?.setLngLat([longitude, latitude])
    if (reference) {
      const lngLat: [number, number] = [reference.longitude, reference.latitude]
      if (repereReference.current) repereReference.current.setLngLat(lngLat)
      else repereReference.current = new maplibregl.Marker({ element: element('repere-carte reference', 24), anchor: 'bottom' }).setLngLat(lngLat).addTo(m)
    } else {
      repereReference.current?.remove()
      repereReference.current = null
    }
    if (!prete) return
    const point = { latitude, longitude }
    ;(m.getSource('rayon') as GeoJSONSource | undefined)?.setData(rayonM ? cercle(point, rayonM) : vide)
    const traits: Feature<LineString>[] = []
    if (reference) traits.push(ligne([[reference.longitude, reference.latitude], [longitude, latitude]]))
    if (orientationDeg !== undefined) {
      const bout = decaler(point, orientationDeg, 12)
      traits.push(ligne([[longitude, latitude], bout]), ligne([decaler(point, orientationDeg - 12, 9), bout, decaler(point, orientationDeg + 12, 9)]))
    }
    ;(m.getSource('traits') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: traits })
  }, [latitude, longitude, rayonM, reference?.latitude, reference?.longitude, orientationDeg, prete, reference])

  /** Recherche d'adresse (Base Adresse Nationale, service public) : centre la carte et place le repère. */
  async function chercher() {
    const q = recherche.trim()
    if (!q) return
    setMessageRecherche(null)
    try {
      const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1&lat=47.5095&lon=6.8035`)
      const d = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { label: string } }[] }
      const f = d.features[0]
      if (!f) return setMessageRecherche('Adresse introuvable.')
      const [lng, lat] = f.geometry.coordinates
      carte.current?.flyTo({ center: [lng, lat], zoom: 18.5 })
      choisir(lat, lng)
      setMessageRecherche(f.properties.label)
    } catch {
      setMessageRecherche('Recherche indisponible (réseau).')
    }
  }

  return (
    <div className="choix-position">
      <div className="barre-choix-position">
        <form
          className="recherche-adresse"
          onSubmit={(e) => {
            e.preventDefault()
            void chercher()
          }}
        >
          <Icone nom="pin" taille={15} />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une adresse…" aria-label="Rechercher une adresse" />
          <button type="submit" className="btn btn-secondaire">
            Localiser
          </button>
        </form>
        <div className="choix-fond" role="group" aria-label="Fond de carte">
          {(['satellite', 'plan'] as const).map((f) => (
            <button key={f} type="button" className={fond === f ? 'actif' : ''} aria-pressed={fond === f} onClick={() => setFond(f)}>
              {f === 'satellite' ? 'Satellite' : 'Plan'}
            </button>
          ))}
        </div>
      </div>
      <div className="carte-choix-position" ref={conteneur} />
      <small className="coordonnees">
        {messageRecherche ? `${messageRecherche} · ` : ''}Cliquez sur la carte ou faites glisser le repère · {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </small>
    </div>
  )
}
