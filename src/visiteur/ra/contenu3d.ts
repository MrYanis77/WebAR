// Contenu 3D des animations, en Three.js : chargement du modèle GLB, lecture des animations intégrées
// et calcul de la pose dans l'espace (devant ou au-dessus de l'affiche,
// devant le visiteur ; la pose à une position GPS est calculée par ra/ancrageGps.ts). Utilisé avec le moteur 8th Wall et dans l'aperçu simulé.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { NOM_ANIMATION_COMBINEE, REGLAGE_AFFICHE_RA_DEFAUT, REGLAGES_3D_DEFAUT } from '../../commun/constantes'
import type { Animation, Reglages3D } from '../../commun/types'
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

export interface Eclairage {
  /** Intensité relative (réglage « luminosité » du modèle, 1 = normale). */
  regler(luminosite: number): void
  liberer(): void
}

const INTENSITE_SOLEIL = 1.4

/** Éclairage de la scène : une seule lumière et un environnement neutre (matériaux PBR), sans ombres (section 9.2). */
export function eclairer(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Eclairage {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  scene.environment = environnement
  const soleil = new THREE.DirectionalLight(0xffffff, INTENSITE_SOLEIL)
  soleil.position.set(1, 3, 2)
  scene.add(soleil)
  return {
    regler(luminosite) {
      soleil.intensity = INTENSITE_SOLEIL * luminosite
      scene.environmentIntensity = luminosite
    },
    liberer() {
      scene.remove(soleil)
      if (scene.environment === environnement) scene.environment = null
      environnement.dispose()
    },
  }
}

const DUREE_APPARITION_S = 0.8

/**
 * Réglages complets (valeurs par défaut pour les champs absents). Une ancienne « échelle » enregistrée
 * par l'atelier est ignorée : la taille se règle au placement de l'animation.
 */
export function reglagesComplets(r?: Partial<Reglages3D>): Reglages3D {
  return {
    rotation: { ...REGLAGES_3D_DEFAUT.rotation, ...r?.rotation },
    ancrage: r?.ancrage ?? REGLAGES_3D_DEFAUT.ancrage,
    hauteur: r?.hauteur ?? REGLAGES_3D_DEFAUT.hauteur,
    vitesse: r?.vitesse ?? REGLAGES_3D_DEFAUT.vitesse,
    luminosite: r?.luminosite ?? REGLAGES_3D_DEFAUT.luminosite,
  }
}

/**
 * Modèle de l'animation prêt à poser dans la scène. Hiérarchie :
 * racine (pose dans l'espace) › apparition (effet d'apparition) › reglage (décalage vertical de
 * l'atelier 3D) › orientation (rotation de l'atelier, ramenée à 1 unité) › scène du fichier GLB.
 * Le modèle, une fois tourné, mesure 1 unité pour sa plus grande dimension, centré, socle (ou centre)
 * à y = 0 ; `racine` reçoit la pose (échelle = taille voulue). `tailleReelle` garde les dimensions du
 * fichier (mètres) au lieu de les ramener à 1 : utilisé par l'atelier 3D.
 */
export class ModeleAnime {
  readonly racine = new THREE.Group()
  private readonly apparition = new THREE.Group()
  private readonly reglage = new THREE.Group()
  private readonly orientation = new THREE.Group()
  private readonly melangeur: THREE.AnimationMixer | null = null
  private actions: THREE.AnimationAction[] = []
  private progression = 0
  private readonly gltf: GLTF
  private readonly tailleReelle: boolean
  private reglages: Reglages3D

  constructor(gltf: GLTF, animation: Partial<Pick<Animation, 'clipIndice' | 'lecture' | 'reglages3d'>>, options: { tailleReelle?: boolean } = {}) {
    this.gltf = gltf
    this.tailleReelle = !!options.tailleReelle
    const objet = gltf.scene
    objet.traverse((o) => {
      o.frustumCulled = false // modèles animés : la boîte englobante de repos ne suit pas les os
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = m.receiveShadow = false
    })
    this.orientation.add(objet)
    this.reglage.add(this.orientation)
    this.apparition.add(this.reglage)
    this.racine.add(this.apparition)
    this.racine.visible = false
    this.reglages = reglagesComplets(animation.reglages3d)
    this.appliquerReglages(this.reglages)

    const clips = gltf.animations
    if (clips.length) {
      this.melangeur = new THREE.AnimationMixer(objet)
      this.melangeur.timeScale = this.reglages.vitesse
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

  /**
   * Applique les réglages de l'atelier 3D : rotation, mise à l'échelle 1 unité (ou taille réelle),
   * ancrage au sol ou au centre, décalage vertical, échelle et vitesse. Utilisable en direct (atelier).
   */
  appliquerReglages(r: Reglages3D) {
    this.reglages = r
    const deg = Math.PI / 180
    // Rotation, puis mesure du modèle tourné (sans la mise à l'échelle précédente).
    this.orientation.rotation.set(r.rotation.x * deg, r.rotation.y * deg, r.rotation.z * deg)
    this.orientation.position.set(0, 0, 0)
    this.orientation.scale.setScalar(1)
    this.racine.updateMatrixWorld(true)
    const boite = new THREE.Box3().setFromObject(this.gltf.scene)
    // setFromObject mesure dans le repère du monde : on retire la pose des groupes parents.
    const inverse = this.orientation.parent ? new THREE.Matrix4().copy(this.orientation.parent.matrixWorld).invert() : new THREE.Matrix4()
    boite.applyMatrix4(inverse)
    const taille = boite.getSize(new THREE.Vector3())
    const centre = boite.getCenter(new THREE.Vector3())
    const e = this.tailleReelle ? 1 : 1 / Math.max(taille.x, taille.y, taille.z, 1e-3)
    this.orientation.scale.setScalar(e)
    this.orientation.position.set(-centre.x * e, -(r.ancrage === 'sol' ? boite.min.y : centre.y) * e, -centre.z * e)
    const reference = this.tailleReelle ? Math.max(taille.x, taille.y, taille.z) : 1
    this.reglage.position.set(0, r.hauteur * reference, 0)
    if (this.melangeur) this.melangeur.timeScale = r.vitesse
  }

  /** Dimensions du modèle tel qu'affiché (largeur x, hauteur y, profondeur z), sans la pose ni l'apparition. */
  dimensions(): THREE.Vector3 {
    this.racine.updateMatrixWorld(true)
    const boite = new THREE.Box3().setFromObject(this.orientation)
    const inverse = new THREE.Matrix4().copy(this.apparition.matrixWorld).invert()
    return boite.applyMatrix4(inverse).getSize(new THREE.Vector3())
  }

  /** Noms des animations intégrées au fichier. */
  get clips(): string[] {
    return this.gltf.animations.map((c) => c.name)
  }

  /** Joue un clip précis (indice), ou tous les clips (null) ; utilisé par l'atelier 3D. */
  choisirClip(indice: number | null) {
    if (!this.melangeur) return
    this.melangeur.stopAllAction()
    const clips = this.gltf.animations
    const aJouer = indice === null ? clips.filter((c) => c.name !== NOM_ANIMATION_COMBINEE) : [clips[indice]].filter(Boolean)
    this.actions = aJouer.map((c) => this.melangeur!.clipAction(c))
    if (this.racine.visible) for (const a of this.actions) a.reset().play()
  }

  /** Pause ou reprise des animations. */
  pause(enPause: boolean) {
    for (const a of this.actions) a.paused = enPause
  }

  get luminosite() {
    return this.reglages.luminosite
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

export const REGLAGE_AFFICHE_DEFAUT: ReglageAffiche = { ...REGLAGE_AFFICHE_RA_DEFAUT }

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
