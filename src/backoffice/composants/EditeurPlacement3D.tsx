// Éditeur de placement 3D d'une animation de lieu, sur une vraie carte : vue satellite (IGN) ou plan,
// bâtiments en relief (données OpenStreetMap) et le modèle GLB de l'animation dessiné à sa place par
// Three.js (calque personnalisé MapLibre), avec ses réglages de l'atelier 3D et son animation.
// On le place n'importe où autour du bâtiment : clic ou glisser du repère, poignée pour l'orienter,
// curseurs de hauteur et de taille ; vue inclinée pour juger le rendu en 3D.
import type { FeatureCollection } from 'geojson'
import maplibregl, { type CustomLayerInterface, type GeoJSONSource, type Map as CarteMapLibre, type Marker, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { capVers, distanceM, type Coordonnees } from '../../commun/geo'
import { Icone } from '../../commun/Icone'
import type { Animation, PlacementGps, Reglages3D } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime } from '../../visiteur/ra/contenu3d'
import { cercle, decaler, element, ligne, SATELLITE } from './ChoixPosition'

type Fond = 'satellite' | 'plan'

const SOURCE_BATIMENTS = 'https://tiles.openfreemap.org/planet'

/** Fond satellite + bâtiments en relief (hauteurs OpenStreetMap), semi-transparents pour voir le modèle. */
export function styleSatellite3D(): StyleSpecification {
  return {
    ...SATELLITE,
    sources: { ...SATELLITE.sources, osm: { type: 'vector', url: SOURCE_BATIMENTS } },
    layers: [
      ...SATELLITE.layers,
      {
        id: 'batiments-3d',
        type: 'fill-extrusion',
        source: 'osm',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#f1ece2',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.55,
        },
      },
    ],
  }
}
const PLAN = 'https://tiles.openfreemap.org/styles/liberty'
const vide: FeatureCollection = { type: 'FeatureCollection', features: [] }
const RAD = Math.PI / 180

/** Distance de la poignée d'orientation au modèle (mètres). */
const distancePoignee = (p: PlacementGps) => Math.max(8, p.tailleM * 0.8)

/** Réglages appliqués en direct au modèle de la carte (aperçu « au monument » de l'atelier 3D). */
export interface ReglagesDirects {
  reglages: Reglages3D
  /** Clip joué (indice) ; null = tous les clips. */
  clip: number | null
  pause: boolean
}

/**
 * Calque Three.js dans la carte : le modèle est posé à sa latitude / longitude, à `hauteurM` du sol,
 * à sa taille réelle en mètres et tourné vers `orientationDeg`. `lireDirect` (facultatif) remplace
 * à chaque image les réglages enregistrés du modèle : l'atelier 3D les modifie en direct.
 */
export function calqueModele(
  modele: Pick<Animation, 'modeleUrl' | 'reglages3d' | 'clipIndice' | 'lecture'>,
  lirePlacement: () => PlacementGps,
  lireDirect?: () => ReglagesDirects,
): CustomLayerInterface & { liberer(): void } {
  let renderer: THREE.WebGLRenderer | null = null
  let carte: CarteMapLibre | null = null
  const scene = new THREE.Scene()
  const camera = new THREE.Camera()
  let instance: ModeleAnime | null = null
  let eclairage: ReturnType<typeof eclairer> | null = null
  let precedent = performance.now()
  /** Derniers réglages directs appliqués (comparés par référence à chaque image). */
  let applique: Partial<ReglagesDirects> = {}
  return {
    id: 'modele-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      carte = m
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      eclairage = eclairer(scene, renderer)
      if (modele.modeleUrl)
        void chargerGlb(modele.modeleUrl, renderer)
          .then((gltf) => {
            instance = new ModeleAnime(gltf, modele)
            eclairage?.regler(instance.luminosite)
            scene.add(instance.racine)
            instance.lancer()
            m.triggerRepaint()
          })
          .catch(() => {})
    },
    render(_gl, options) {
      if (!renderer || !carte) return
      const maintenant = performance.now()
      const direct = lireDirect?.()
      if (instance && direct) {
        if (direct.reglages !== applique.reglages) {
          instance.appliquerReglages(direct.reglages)
          eclairage?.regler(direct.reglages.luminosite)
        }
        if (direct.clip !== applique.clip) instance.choisirClip(direct.clip)
        if (direct.pause !== applique.pause) instance.pause(direct.pause)
        applique = { ...direct }
      }
      instance?.mettreAJour(Math.min(0.1, (maintenant - precedent) / 1000))
      precedent = maintenant
      const p = lirePlacement()
      if (instance) instance.racine.scale.setScalar(p.tailleM)
      const mc = maplibregl.MercatorCoordinate.fromLngLat([p.longitude, p.latitude], p.hauteurM)
      const s = mc.meterInMercatorCoordinateUnits()
      // Y de Three.js vers le haut ; face avant (+Z) tournée vers le cap demandé (sud si « face au visiteur »).
      const theta = (180 - (p.orientationDeg ?? 180)) * RAD
      const modeleVersMonde = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(theta))
      camera.projectionMatrix = new THREE.Matrix4().fromArray(options.defaultProjectionData.mainMatrix as unknown as number[]).multiply(modeleVersMonde)
      renderer.resetState()
      renderer.render(scene, camera)
      carte.triggerRepaint() // animation du modèle
    },
    onRemove() {
      this.liberer()
    },
    liberer() {
      instance?.liberer()
      instance = null
      eclairage?.liberer()
      eclairage = null
      renderer = null
    },
  }
}

export function EditeurPlacement3D({
  placement,
  lieu,
  modele,
  onChange,
}: {
  placement: PlacementGps
  lieu: Coordonnees & { nom: string; rayonM?: number }
  /** Modèle de l'animation (dessiné sur la carte) ; absent tant qu'aucun modèle n'est choisi. */
  modele?: Pick<Animation, 'modeleUrl' | 'reglages3d' | 'clipIndice' | 'lecture'>
  onChange: (p: PlacementGps) => void
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMapLibre | null>(null)
  const repere = useRef<Marker | null>(null)
  const poignee = useRef<Marker | null>(null)
  const placementRef = useRef(placement)
  placementRef.current = placement
  const surChangement = useRef(onChange)
  surChangement.current = onChange
  const [fond, setFond] = useState<Fond>('satellite')
  const [prete, setPrete] = useState(0)

  const maj = (x: Partial<PlacementGps>) => surChangement.current({ ...placementRef.current, ...x })

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
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'bottom-right')
    m.on('click', (e) => maj({ latitude: Number(e.lngLat.lat.toFixed(6)), longitude: Number(e.lngLat.lng.toFixed(6)) }))
    m.on('style.load', () => setPrete((n) => n + 1))

    // Repère du modèle (glisser pour déplacer) et poignée d'orientation (glisser pour tourner).
    const r = new maplibregl.Marker({ element: element('repere-carte', 34), anchor: 'bottom', draggable: true }).setLngLat([placement.longitude, placement.latitude]).addTo(m)
    r.on('drag', () => {
      const p = r.getLngLat()
      maj({ latitude: Number(p.lat.toFixed(6)), longitude: Number(p.lng.toFixed(6)) })
    })
    repere.current = r
    const el = document.createElement('div')
    el.className = 'poignee-orientation'
    el.title = 'Glisser pour orienter le modèle'
    const h = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(decaler(placement, placement.orientationDeg ?? 180, distancePoignee(placement))).addTo(m)
    h.on('drag', () => {
      const p = h.getLngLat()
      maj({ orientationDeg: Math.round(capVers(placementRef.current, { latitude: p.lat, longitude: p.lng })) % 360 })
    })
    h.on('dragend', () => h.setLngLat(decaler(placementRef.current, placementRef.current.orientationDeg ?? 180, distancePoignee(placementRef.current))))
    poignee.current = h
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
      m.addLayer({ id: 'traits-modele', type: 'line', source: 'emprise', filter: ['==', ['get', 'role'], 'trait'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#4fd1c5', 'line-width': 3 } })
    }
    if (!modele?.modeleUrl) return
    const calque = calqueModele(modele, () => placementRef.current)
    m.addLayer(calque)
    return () => {
      if (carte.current?.getLayer(calque.id)) carte.current.removeLayer(calque.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prete, modele?.modeleUrl, modele?.reglages3d, modele?.clipIndice, modele?.lecture])

  // Repères et emprise suivent le placement.
  useEffect(() => {
    const m = carte.current
    repere.current?.setLngLat([placement.longitude, placement.latitude])
    poignee.current?.setLngLat(decaler(placement, placement.orientationDeg ?? 180, distancePoignee(placement)))
    const source = m?.getSource('emprise') as GeoJSONSource | undefined
    if (!source) return
    const bout = decaler(placement, placement.orientationDeg ?? 180, distancePoignee(placement))
    source.setData({
      type: 'FeatureCollection',
      features: [
        ...(lieu.rayonM ? [{ ...cercle(lieu, lieu.rayonM), properties: { role: 'rayon' } }] : []),
        { ...cercle(placement, Math.max(0.5, placement.tailleM / 2)), properties: { role: 'emprise' } },
        ...(placement.orientationDeg !== undefined ? [{ ...ligne([[placement.longitude, placement.latitude], bout]), properties: { role: 'trait' } }] : []),
      ],
    })
    m?.triggerRepaint()
  }, [placement, lieu, prete])

  const vue = (pitch: number, zoom?: number) => carte.current?.easeTo({ center: [placement.longitude, placement.latitude], pitch, ...(zoom ? { zoom } : {}), duration: 600 })
  const ecart = distanceM(lieu, placement)
  const tailleLog = Math.log10(placement.tailleM)

  return (
    <div className="editeur-placement">
      <div className="barre-choix-position">
        <div className="choix-fond" role="group" aria-label="Fond de carte">
          {(['satellite', 'plan'] as const).map((f) => (
            <button key={f} type="button" className={fond === f ? 'actif' : ''} aria-pressed={fond === f} onClick={() => setFond(f)}>
              {f === 'satellite' ? 'Satellite 3D' : 'Plan'}
            </button>
          ))}
        </div>
        <div className="choix-fond" role="group" aria-label="Vue">
          <button type="button" onClick={() => vue(60)}>
            Vue 3D
          </button>
          <button type="button" onClick={() => vue(0)}>
            Vue du dessus
          </button>
          <button type="button" onClick={() => carte.current?.easeTo({ center: [lieu.longitude, lieu.latitude], zoom: 18, duration: 600 })}>
            Centrer sur le lieu
          </button>
        </div>
      </div>
      <div className="carte-editeur-placement" ref={conteneur} />
      <small className="coordonnees">
        Cliquez autour du bâtiment ou faites glisser le repère pour déplacer l’animation ; faites glisser le rond pour l’orienter. {placement.latitude.toFixed(6)}, {placement.longitude.toFixed(6)} ·{' '}
        {ecart < 1 ? 'sur le point du lieu' : `à ${Math.round(ecart)} m du point du lieu`}
        {!modele?.modeleUrl && ' · choisissez un modèle 3D pour le voir sur la carte'}
      </small>
      <div className="reglages-placement">
        <label className="reglage-curseur">
          <span>
            Hauteur au-dessus du sol <b>{placement.hauteurM.toString().replace('.', ',')} m</b>
          </span>
          <input type="range" min={0} max={80} step={0.5} value={placement.hauteurM} onChange={(e) => maj({ hauteurM: Number(e.target.value) })} />
        </label>
        <label className="reglage-curseur">
          <span>
            Taille du modèle <b>{placement.tailleM.toString().replace('.', ',')} m</b>
          </span>
          <input type="range" min={-0.3} max={2.2} step={0.01} value={tailleLog} onChange={(e) => maj({ tailleM: Number((10 ** Number(e.target.value)).toFixed(1)) })} />
        </label>
        <label className="reglage-curseur">
          <span>
            Orientation <b>{placement.orientationDeg === undefined ? 'face au visiteur' : `${placement.orientationDeg}°`}</b>
          </span>
          <input type="range" min={0} max={359} step={1} value={placement.orientationDeg ?? 180} onChange={(e) => maj({ orientationDeg: Number(e.target.value) })} />
        </label>
        <label className="case">
          <input type="checkbox" checked={placement.orientationDeg === undefined} onChange={(e) => maj({ orientationDeg: e.target.checked ? undefined : 180 })} />
          Toujours tourné vers le visiteur
        </label>
        <div className="champs-coordonnees">
          <label className="champ">
            <span className="etiquette">Latitude</span>
            <input type="number" step="0.000001" value={placement.latitude} onChange={(e) => maj({ latitude: Number(e.target.value) })} />
          </label>
          <label className="champ">
            <span className="etiquette">Longitude</span>
            <input type="number" step="0.000001" value={placement.longitude} onChange={(e) => maj({ longitude: Number(e.target.value) })} />
          </label>
          <button type="button" className="btn btn-secondaire" onClick={() => maj({ latitude: lieu.latitude, longitude: lieu.longitude })}>
            <Icone nom="pin" taille={14} /> Sur le point du lieu
          </button>
        </div>
      </div>
    </div>
  )
}
