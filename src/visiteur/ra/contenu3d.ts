// Contenu 3D des animations, en Three.js : chargement du modèle GLB, lecture des animations intégrées
// et calcul de la pose dans l'espace (devant ou au-dessus de l'affiche, au-dessus d'un détail de façade,
// devant le visiteur ; la pose à une position GPS est calculée par ra/ancrageGps.ts). Utilisé avec le moteur 8th Wall et dans l'aperçu simulé.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { NOM_ANIMATION_COMBINEE } from '../../commun/constantes'
import type { Animation } from '../../commun/types'
import type { DetailCible } from './moteur'

/**
 * Charge un modèle GLB : géométrie compressée Meshopt ou Draco et textures KTX2 acceptées
 * (décodeurs servis par l'application, voir vite.config.ts : rien n'est chargé depuis un autre site).
 */
export async function chargerGlb(url: string, renderer: THREE.WebGLRenderer): Promise<GLTF> {
  const base = import.meta.env.BASE_URL
  const draco = new DRACOLoader().setDecoderPath(`${base}draco/`)
  const ktx2 = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer)
  const chargeur = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
  try {
    return await chargeur.loadAsync(url)
  } finally {
    draco.dispose()
    ktx2.dispose()
  }
}

/** Éclairage de la scène : une seule lumière et un environnement neutre (matériaux PBR), sans ombres (section 9.2). */
export function eclairer(scene: THREE.Scene, renderer: THREE.WebGLRenderer): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  scene.environment = environnement
  const soleil = new THREE.DirectionalLight(0xffffff, 1.4)
  soleil.position.set(1, 3, 2)
  scene.add(soleil)
  return () => {
    scene.remove(soleil)
    if (scene.environment === environnement) scene.environment = null
    environnement.dispose()
  }
}

const DUREE_APPARITION_S = 0.8

/**
 * Modèle de l'animation prêt à poser dans la scène : ramené à 1 unité pour sa plus grande dimension,
 * socle à y = 0, centré. `racine` reçoit la pose (position, rotation, échelle = taille voulue).
 */
export class ModeleAnime {
  readonly racine = new THREE.Group()
  private readonly apparition = new THREE.Group()
  private readonly melangeur: THREE.AnimationMixer | null = null
  private readonly actions: THREE.AnimationAction[] = []
  private progression = 0
  private readonly gltf: GLTF

  constructor(gltf: GLTF, animation: Pick<Animation, 'clipIndice' | 'lecture'>) {
    this.gltf = gltf
    const objet = gltf.scene
    const boite = new THREE.Box3().setFromObject(objet)
    const taille = boite.getSize(new THREE.Vector3())
    const echelle = 1 / Math.max(taille.x, taille.y, taille.z, 1e-3)
    const centre = boite.getCenter(new THREE.Vector3())
    objet.scale.multiplyScalar(echelle)
    objet.position.set(-centre.x * echelle, -boite.min.y * echelle, -centre.z * echelle)
    objet.traverse((o) => {
      o.frustumCulled = false // modèles animés : la boîte englobante de repos ne suit pas les os
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = m.receiveShadow = false
    })
    this.apparition.add(objet)
    this.racine.add(this.apparition)
    this.racine.visible = false

    const clips = gltf.animations
    if (clips.length) {
      this.melangeur = new THREE.AnimationMixer(objet)
      // Clip choisi par l'éditeur ; sinon tous les clips ensemble (l'animation combinée ajoutée par
      // l'API pour <model-viewer> les contient déjà : on la joue seule si elle est présente).
      const choisi = animation.clipIndice !== undefined ? clips[animation.clipIndice] : undefined
      const combinee = clips.find((c) => c.name === NOM_ANIMATION_COMBINEE)
      const aJouer = choisi ? [choisi] : combinee ? [combinee] : clips
      for (const clip of aJouer) {
        const action = this.melangeur.clipAction(clip)
        if (animation.lecture === 'UNE_FOIS') {
          action.setLoop(THREE.LoopOnce, 1)
          action.clampWhenFinished = true
        }
        this.actions.push(action)
      }
    }
  }

  /** Fait apparaître le modèle (il grandit en 0,8 s) et joue son animation depuis le début. */
  lancer() {
    this.racine.visible = true
    this.progression = 0
    for (const a of this.actions) {
      a.reset()
      a.play()
    }
  }

  masquer() {
    this.racine.visible = false
    for (const a of this.actions) a.stop()
  }

  get visible() {
    return this.racine.visible
  }

  mettreAJour(dt: number) {
    if (!this.racine.visible) return
    this.progression = Math.min(1, this.progression + dt / DUREE_APPARITION_S)
    const e = 1 - (1 - this.progression) ** 3
    this.apparition.scale.setScalar(Math.max(0.001, e))
    this.melangeur?.update(dt)
  }

  liberer() {
    this.melangeur?.stopAllAction()
    this.racine.removeFromParent()
    this.gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        for (const valeur of Object.values(mat)) if (valeur instanceof THREE.Texture) valeur.dispose()
        mat.dispose()
      }
    })
  }
}

// ------------------------------------------------------------------ poses dans l'espace

export interface Pose {
  position: THREE.Vector3
  rotation: THREE.Quaternion
  /** Taille du modèle (plus grande dimension) en unités de la scène, proches du mètre. */
  taille: number
}

/** Réglage de l'animation d'affiche (choisi par le partenaire, section 5.3). */
export interface ReglageAffiche {
  position: 'devant' | 'dessus'
  /** Taille du modèle par rapport à la hauteur de l'affiche. */
  taille: number
}

export const REGLAGE_AFFICHE_DEFAUT: ReglageAffiche = { position: 'devant', taille: 1 }

const HAUT = new THREE.Vector3(0, 1, 0)

/** Modèle debout (axe vertical du monde), sa face avant (+Z) tournée vers `avant`. */
function debout(avant: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(HAUT, Math.atan2(avant.x, avant.z))
}

/**
 * Pose de l'animation à partir d'une cible reconnue. Dans le repère de la cible, l'image est dans le
 * plan XY (+Y vers le haut de l'image, +Z vers le visiteur) et mesure 1 unité de haut, soit `scale`
 * unités de la scène. Le modèle reste debout même si l'affiche est penchée.
 */
export function poseSurCible(d: DetailCible, reglage: ReglageAffiche): Pose {
  const centre = new THREE.Vector3(d.position.x, d.position.y, d.position.z)
  const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w)
  const normale = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
  const hautImage = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
  const taille = d.scale * reglage.taille
  // Face avant tournée vers l'avant de l'affiche ; affiche posée à plat : vers le bas de l'image (le visiteur).
  const avant = normale.clone().setY(0)
  if (avant.lengthSq() < 0.05) avant.copy(hautImage).negate().setY(0)
  avant.normalize()
  const position =
    reglage.position === 'dessus'
      ? // Socle sur le bord haut de l'image, légèrement en avant.
        centre.addScaledVector(hautImage, 0.5 * d.scale).addScaledVector(normale, 0.1 * d.scale)
      : // Devant l'affiche, centré sur elle.
        centre.addScaledVector(normale, 0.35 * d.scale).addScaledVector(HAUT, -taille / 2)
  return { position, rotation: debout(avant), taille }
}

/** Direction horizontale du regard de la caméra. */
function regardHorizontal(camera: THREE.Camera): THREE.Vector3 {
  const v = camera.getWorldDirection(new THREE.Vector3()).setY(0)
  return v.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, -1) : v.normalize()
}

/** Pose à 1,6 m devant le visiteur, à hauteur du regard (affiche non reconnue ou sans cible). */
export function poseDevant(camera: THREE.Camera, taille = 1): Pose {
  const regard = regardHorizontal(camera)
  const position = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(regard, 1.6)
  position.y -= taille * 0.75
  return { position, rotation: debout(regard.clone().negate()), taille }
}

/** Applique une pose, d'un coup ou en douceur (recalage sur la cible, sans à-coup). */
export function appliquerPose(objet: THREE.Object3D, pose: Pose, lissage = 1) {
  objet.position.lerp(pose.position, lissage)
  objet.quaternion.slerp(pose.rotation, lissage)
  const s = THREE.MathUtils.lerp(objet.scale.x, pose.taille, lissage)
  objet.scale.setScalar(s)
}
