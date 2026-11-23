// Modèle 3D dessiné sur une carte MapLibre (calque personnalisé Three.js), à sa position GPS, à sa
// hauteur au-dessus du sol, à sa taille réelle en mètres et tourné vers son cap ; fond satellite avec
// les bâtiments en relief (OpenStreetMap). Utilisé par l'atelier du monument.
import maplibregl, { type CustomLayerInterface, type Map as CarteMapLibre, type StyleSpecification } from 'maplibre-gl'
import * as THREE from 'three'
import type { Animation, PlacementGps, Reglages3D } from '../../../commun/types'
import { chargerGlb, eclairer, ModeleAnime } from '../../../visiteur/ra/contenu3d'
import { SATELLITE } from '../ChoixPosition'

const SOURCE_BATIMENTS = 'https://tiles.openfreemap.org/planet'
export const PLAN = 'https://tiles.openfreemap.org/styles/liberty'
const RAD = Math.PI / 180

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

/** Réglages appliqués en direct au modèle de la carte (brouillon de l'atelier). */
export interface ReglagesDirects {
  reglages: Reglages3D
  /** Clip joué (indice), null = tous ; absent : celui de l'animation. */
  clip?: number | null
  pause?: boolean
}

/**
 * Calque Three.js dans la carte : le modèle est posé à sa latitude / longitude, à `hauteurM` du sol,
 * à sa taille réelle en mètres et tourné vers `orientationDeg`. `lireDirect` (facultatif) remplace à
 * chaque image les réglages enregistrés du modèle ; `surDimensions` reçoit ses dimensions ramenées à 1.
 */
export function calqueModele(
  modele: Pick<Animation, 'modeleUrl' | 'reglages3d' | 'clipIndice' | 'lecture'>,
  lirePlacement: () => PlacementGps,
  lireDirect?: () => ReglagesDirects,
  surDimensions?: (d: THREE.Vector3) => void,
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
            if (!renderer) return
            instance = new ModeleAnime(gltf, { ...modele, reglages3d: lireDirect?.().reglages ?? modele.reglages3d })
            eclairage?.regler(instance.luminosite)
            scene.add(instance.racine)
            instance.lancer()
            applique = { reglages: lireDirect?.().reglages }
            surDimensions?.(instance.dimensions())
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
          surDimensions?.(instance.dimensions())
        }
        if (direct.clip !== undefined && direct.clip !== applique.clip) instance.choisirClip(direct.clip)
        if (direct.pause !== undefined && direct.pause !== applique.pause) instance.pause(direct.pause)
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
