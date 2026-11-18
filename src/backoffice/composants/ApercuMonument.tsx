// Aperçu « au monument » de l'atelier 3D : carte satellite avec les bâtiments en relief (OpenStreetMap)
// et le modèle posé à son placement (position, hauteur du socle, taille et orientation de l'animation).
// Les réglages de l'atelier (orientation, ancrage, décalage, vitesse, luminosité, clip, pause) sont lus
// à chaque image : on juge en direct le rendu du modèle devant le vrai bâtiment.
import type { FeatureCollection } from 'geojson'
import maplibregl, { type CameraOptions, type Map as CarteMapLibre } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import type { Coordonnees } from '../../commun/geo'
import type { PlacementGps } from '../../commun/types'
import { cercle } from './ChoixPosition'
import { calqueModele, styleSatellite3D, type ReglagesDirects } from './EditeurPlacement3D'

export type VueApercu = 'perspective' | 'face' | 'cote' | 'dessus'

const RAD = Math.PI / 180
/** Mètres par pixel au zoom 0 et à l'équateur (tuiles de 512 px). */
const METRES_PAR_PX_Z0 = 78_271.517
const vide: FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * Caméra de la carte pour une vue de l'atelier, alignée sur la face avant du modèle : « Face » regarde
 * le modèle de face, « Côté » de profil, « Dessus » d'aplomb. Le centre visé est le milieu du modèle
 * (au-dessus du sol) et le zoom montre le modèle avec le bâtiment autour.
 */
function cameraPour(p: PlacementGps, vue: VueApercu, largeurPx: number): CameraOptions {
  const cap = p.orientationDeg ?? 180
  const etendue = Math.max(50, p.tailleM * 3, (p.hauteurM + p.tailleM / 2) * 3.4)
  const zoom = Math.min(20.5, Math.max(14, Math.log2((METRES_PAR_PX_Z0 * Math.cos(p.latitude * RAD) * Math.max(320, largeurPx)) / etendue)))
  const angles = { perspective: { pitch: 60, bearing: cap + 141 }, face: { pitch: 82, bearing: cap + 180 }, cote: { pitch: 82, bearing: cap + 90 }, dessus: { pitch: 0, bearing: cap + 180 } }[vue]
  return { center: [p.longitude, p.latitude], elevation: p.hauteurM + p.tailleM / 2, zoom, pitch: angles.pitch, bearing: (((angles.bearing + 180) % 360) + 360) % 360 - 180 }
}

export default function ApercuMonument({
  modeleUrl,
  lieu,
  placement,
  lireDirect,
  vue,
  cadrage,
}: {
  modeleUrl: string
  lieu: Coordonnees & { rayonM?: number }
  placement: PlacementGps
  /** Réglages de l'atelier, lus à chaque image. */
  lireDirect: () => ReglagesDirects
  vue: VueApercu
  /** Change à chaque demande de cadrage (bouton de vue de l'atelier). */
  cadrage: number
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMapLibre | null>(null)
  const placementRef = useRef(placement)
  placementRef.current = placement
  const direct = useRef(lireDirect)
  direct.current = lireDirect

  // Carte créée une fois par modèle et par lieu.
  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const m = new maplibregl.Map({
      container: el,
      style: styleSatellite3D(),
      ...cameraPour(placementRef.current, vue, el.clientWidth),
      maxZoom: 21,
      maxPitch: 85,
      // Centre de la vue au milieu du modèle (et non au sol) : le modèle reste au centre en tournant.
      centerClampedToGround: false,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    })
    carte.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'top-right')
    const calque = calqueModele({ modeleUrl }, () => placementRef.current, () => direct.current())
    m.on('style.load', () => {
      m.addSource('rayon', { type: 'geojson', data: lieu.rayonM ? cercle(lieu, lieu.rayonM) : vide })
      m.addLayer({ id: 'rayon-lieu', type: 'line', source: 'rayon', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      m.addLayer(calque)
    })
    return () => {
      if (m.getLayer(calque.id)) m.removeLayer(calque.id)
      m.remove()
      carte.current = null
    }
    // La vue initiale est lue une fois ; les changements passent par l'effet de cadrage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeleUrl, lieu.latitude, lieu.longitude, lieu.rayonM])

  // Cadrage : bouton de vue de l'atelier, ou autre placement choisi.
  const clePlacement = `${placement.latitude},${placement.longitude},${placement.hauteurM},${placement.tailleM},${placement.orientationDeg}`
  const premier = useRef(true)
  useEffect(() => {
    if (premier.current) {
      premier.current = false
      return
    }
    const m = carte.current
    if (!m) return
    m.easeTo({ ...cameraPour(placementRef.current, vue, m.getContainer().clientWidth), duration: 700 })
    m.triggerRepaint()
  }, [clePlacement, vue, cadrage])

  // Enveloppe positionnée par l'atelier : la feuille de style de MapLibre impose `position: relative` à la carte.
  return (
    <div className="atelier-carte">
      <div className="atelier-carte-fond" ref={conteneur} role="img" aria-label="Aperçu du modèle au monument, sur la carte satellite avec les bâtiments en relief" />
    </div>
  )
}
