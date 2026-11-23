// Vue de l'atelier du monument : vraie carte (satellite IGN ou plan), bâtiments en relief et modèle 3D
// de l'animation dessiné à sa place, avec ses réglages en direct. Mêmes outils que l'atelier de
// l'affiche : déplacer (clic ou glisser du repère), tourner (glisser le rond, ou clic vers où regarder),
// agrandir (glisser la poignée du cercle).
import type { FeatureCollection } from 'geojson'
import maplibregl, { type GeoJSONSource, type Map as CarteMapLibre, type Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import { capVers, distanceM, type Coordonnees } from '../../../commun/geo'
import { Icone } from '../../../commun/Icone'
import type { PlacementGps, Reglages3D } from '../../../commun/types'
import { cercle, decaler, element, ligne } from '../ChoixPosition'
import { metres } from '../sceneApercu'
import { calqueModele, PLAN, styleSatellite3D } from './carteModele'
import { OutilsVue, type Outil } from './OutilsAtelier'

type Fond = 'satellite' | 'plan'

const vide: FeatureCollection = { type: 'FeatureCollection', features: [] }
/** Bornes de la taille du modèle au monument, en mètres (schéma de l'API). */
export const TAILLE_MONUMENT = { min: 0.5, max: 200 } as const

/** Distance de la poignée d'orientation au modèle (mètres). */
const distancePoignee = (p: PlacementGps) => Math.max(8, p.tailleM * 0.8)
/** Poignée de taille : sur le bord du cercle d'emprise, à l'est du modèle. */
const positionTaille = (p: PlacementGps) => decaler(p, 90, Math.max(0.25, p.tailleM / 2))

const CONSIGNES: Partial<Record<Outil, string>> = {
  position: 'Cliquez sur la carte ou glissez le repère pour déplacer le modèle.',
  rotation: 'Cliquez vers où le modèle doit regarder, ou glissez le rond cyan.',
  taille: 'Glissez la poignée blanche du cercle pour agrandir ou réduire le modèle.',
}

export function VueMonument({
  lieu,
  placement,
  onPlacement,
  modeleUrl,
  clipIndice,
  lecture,
  reglages3d,
  outil,
  onOutil,
  onDimensions,
  desactive,
}: {
  lieu: Coordonnees & { nom: string; rayonM?: number }
  placement: PlacementGps
  onPlacement: (p: PlacementGps) => void
  modeleUrl?: string
  clipIndice?: number
  lecture?: 'BOUCLE' | 'UNE_FOIS'
  reglages3d: Reglages3D
  outil: Outil
  onOutil: (o: Outil) => void
  onDimensions?: (d: THREE.Vector3 | null) => void
  desactive?: boolean
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMapLibre | null>(null)
  const repere = useRef<Marker | null>(null)
  const poigneeCap = useRef<Marker | null>(null)
  const poigneeTaille = useRef<Marker | null>(null)
  const placementRef = useRef(placement)
  placementRef.current = placement
  const reglagesRef = useRef(reglages3d)
  reglagesRef.current = reglages3d
  const outilRef = useRef(outil)
  outilRef.current = outil
  const desactiveRef = useRef(desactive)
  desactiveRef.current = desactive
  const rappels = useRef({ onPlacement, onDimensions })
  rappels.current = { onPlacement, onDimensions }
  const [fond, setFond] = useState<Fond>('satellite')
  const [prete, setPrete] = useState(0)
  const [aDimensions, setADimensions] = useState(false)

  const maj = (x: Partial<PlacementGps>) => !desactiveRef.current && rappels.current.onPlacement({ ...placementRef.current, ...x })

  // Création de la carte, vue inclinée sur le modèle.
  useEffect(() => {
    if (!conteneur.current) return
    const m = new maplibregl.Map({
      container: conteneur.current,
      style: styleSatellite3D(),
      center: [placement.longitude, placement.latitude],
      zoom: 18,
      pitch: 55,
      bearing: -20,
      maxZoom: 21,
      maxPitch: 80,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    })
    carte.current = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.FullscreenControl(), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'bottom-right')
    // Clic : déplacer le modèle (outil Position) ou le tourner vers le point (outil Rotation).
    m.on('click', (e) => {
      const p = { latitude: Number(e.lngLat.lat.toFixed(6)), longitude: Number(e.lngLat.lng.toFixed(6)) }
      if (outilRef.current === 'rotation') maj({ orientationDeg: Math.round(capVers(placementRef.current, p)) % 360 })
      else if (outilRef.current === 'position') maj(p)
    })
    m.on('style.load', () => setPrete((n) => n + 1))

    // Repère du modèle (glisser pour déplacer).
    const r = new maplibregl.Marker({ element: element('repere-carte', 34), anchor: 'bottom', draggable: true }).setLngLat([placement.longitude, placement.latitude]).addTo(m)
    r.on('drag', () => {
      const p = r.getLngLat()
      maj({ latitude: Number(p.lat.toFixed(6)), longitude: Number(p.lng.toFixed(6)) })
    })
    repere.current = r
    // Poignée d'orientation (glisser pour tourner).
    const elCap = document.createElement('div')
    elCap.className = 'poignee-orientation'
    elCap.title = 'Glisser pour orienter le modèle'
    const h = new maplibregl.Marker({ element: elCap, draggable: true }).setLngLat(decaler(placement, placement.orientationDeg ?? 180, distancePoignee(placement))).addTo(m)
    h.on('drag', () => {
      const p = h.getLngLat()
      maj({ orientationDeg: Math.round(capVers(placementRef.current, { latitude: p.lat, longitude: p.lng })) % 360 })
    })
    h.on('dragend', () => h.setLngLat(decaler(placementRef.current, placementRef.current.orientationDeg ?? 180, distancePoignee(placementRef.current))))
    poigneeCap.current = h
    // Poignée de taille (glisser pour agrandir) : le cercle d'emprise a pour diamètre la taille du modèle.
    const elTaille = document.createElement('div')
    elTaille.className = 'poignee-taille'
    elTaille.title = 'Glisser pour changer la taille du modèle'
    const t = new maplibregl.Marker({ element: elTaille, draggable: true }).setLngLat(positionTaille(placement)).addTo(m)
    t.on('drag', () => {
      const p = t.getLngLat()
      const taille = Math.min(TAILLE_MONUMENT.max, Math.max(TAILLE_MONUMENT.min, 2 * distanceM(placementRef.current, { latitude: p.lat, longitude: p.lng })))
      maj({ tailleM: Math.round(taille * 10) / 10 })
    })
    t.on('dragend', () => t.setLngLat(positionTaille(placementRef.current)))
    poigneeTaille.current = t
    return () => {
      m.remove()
      carte.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fond de carte (le style est remplacé : sources, bâtiments et modèle sont rajoutés à « style.load »).
  const fondInitial = useRef(true)
  useEffect(() => {
    if (fondInitial.current) {
      fondInitial.current = false
      return
    }
    carte.current?.setStyle(fond === 'satellite' ? styleSatellite3D() : PLAN, { diff: false })
  }, [fond])

  // Calques ajoutés à chaque chargement de style : rayon du lieu, emprise et orientation, modèle 3D.
  useEffect(() => {
    const m = carte.current
    if (!m || !prete) return
    if (!m.getSource('emprise')) {
      m.addSource('emprise', { type: 'geojson', data: vide })
      m.addLayer({ id: 'rayon-lieu', type: 'line', source: 'emprise', filter: ['==', ['get', 'role'], 'rayon'], paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'emprise-modele', type: 'fill', source: 'emprise', filter: ['==', ['get', 'role'], 'emprise'], paint: { 'fill-color': '#4fd1c5', 'fill-opacity': 0.25 } })
      m.addLayer({ id: 'bord-emprise', type: 'line', source: 'emprise', filter: ['==', ['get', 'role'], 'emprise'], paint: { 'line-color': '#4fd1c5', 'line-width': 1.5 } })
      m.addLayer({ id: 'traits-modele', type: 'line', source: 'emprise', filter: ['==', ['get', 'role'], 'trait'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#4fd1c5', 'line-width': 3 } })
    }
    if (!modeleUrl) {
      setADimensions(false)
      rappels.current.onDimensions?.(null)
      return
    }
    const calque = calqueModele(
      { modeleUrl, clipIndice, lecture },
      () => placementRef.current,
      () => ({ reglages: reglagesRef.current }),
      (d) => {
        setADimensions(true)
        rappels.current.onDimensions?.(d)
      },
    )
    m.addLayer(calque)
    return () => {
      if (carte.current?.getLayer(calque.id)) carte.current.removeLayer(calque.id)
    }
  }, [prete, modeleUrl, clipIndice, lecture])

  // Nouveaux réglages : une image de plus (la carte ne se redessine pas seule sans modèle animé).
  useEffect(() => carte.current?.triggerRepaint(), [reglages3d])

  // Repères et emprise suivent le placement.
  useEffect(() => {
    const m = carte.current
    repere.current?.setLngLat([placement.longitude, placement.latitude])
    poigneeCap.current?.setLngLat(decaler(placement, placement.orientationDeg ?? 180, distancePoignee(placement)))
    poigneeTaille.current?.setLngLat(positionTaille(placement))
    const source = m?.getSource('emprise') as GeoJSONSource | undefined
    if (!source) return
    const bout = decaler(placement, placement.orientationDeg ?? 180, distancePoignee(placement))
    source.setData({
      type: 'FeatureCollection',
      features: [
        ...(lieu.rayonM ? [{ ...cercle(lieu, lieu.rayonM), properties: { role: 'rayon' } }] : []),
        { ...cercle(placement, Math.max(0.25, placement.tailleM / 2)), properties: { role: 'emprise' } },
        ...(placement.orientationDeg !== undefined ? [{ ...ligne([[placement.longitude, placement.latitude], bout]), properties: { role: 'trait' } }] : []),
      ],
    })
    m?.triggerRepaint()
  }, [placement, lieu, prete])

  // Poignées actives selon l'outil (et figées en lecture seule).
  useEffect(() => {
    repere.current?.setDraggable(!desactive)
    poigneeCap.current?.setDraggable(!desactive)
    poigneeTaille.current?.setDraggable(!desactive)
    const elTaille = poigneeTaille.current?.getElement()
    if (elTaille) elTaille.style.visibility = outil === 'taille' && !desactive ? 'visible' : 'hidden'
    poigneeCap.current?.getElement().classList.toggle('active', outil === 'rotation')
    conteneur.current?.classList.toggle('clic-actif', !desactive && (outil === 'position' || outil === 'rotation'))
  }, [outil, desactive])

  const vue = (pitch: number, zoom?: number) => carte.current?.easeTo({ center: [placementRef.current.longitude, placementRef.current.latitude], pitch, ...(zoom ? { zoom } : {}), duration: 600 })
  const ecart = distanceM(lieu, placement)

  return (
    <div className="vue-atelier vue-monument">
      <div className="atelier-carte-fond" ref={conteneur} role="application" aria-label={`Carte du monument ${lieu.nom} avec le modèle 3D de l’animation`} />
      <div className="atelier-outils-vue">
        <OutilsVue outil={outil} onOutil={onOutil} desactive={desactive} />
        <span className="separateur" />
        {(['satellite', 'plan'] as const).map((f) => (
          <button key={f} type="button" className={fond === f ? 'actif' : ''} aria-pressed={fond === f} onClick={() => setFond(f)}>
            {f === 'satellite' ? 'Satellite' : 'Plan'}
          </button>
        ))}
        <span className="separateur" />
        <button type="button" onClick={() => vue(60)}>
          3D
        </button>
        <button type="button" onClick={() => vue(0)}>
          Dessus
        </button>
        <button type="button" onClick={() => carte.current?.easeTo({ center: [lieu.longitude, lieu.latitude], zoom: 18, duration: 600 })} title="Centrer sur le point du monument">
          <Icone nom="viseur" taille={14} />
        </button>
      </div>
      <div className="atelier-dimensions" aria-live="polite">
        <strong>{ecart < 1 ? 'Sur le point du monument' : `À ${metres(ecart)} du point du monument`}</strong>
        <span>
          {metres(placement.tailleM)} · socle à {metres(placement.hauteurM)} du sol
        </span>
        <small>{placement.orientationDeg === undefined ? 'Toujours face au visiteur' : `Orienté à ${placement.orientationDeg}°`}</small>
      </div>
      {!desactive && CONSIGNES[outil] && <p className="consigne-vue">{CONSIGNES[outil]}</p>}
      {(!modeleUrl || !aDimensions) && (
        <p className="message-vue" role="status">
          {modeleUrl ? (
            <>
              <span className="spinner" /> Chargement du modèle…
            </>
          ) : (
            <>
              <Icone nom="cube" taille={14} /> Choisissez un modèle 3D pour le voir au monument.
            </>
          )}
        </p>
      )}
    </div>
  )
}
