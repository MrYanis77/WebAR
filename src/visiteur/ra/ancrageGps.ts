// Ancrage GPS en 3D : pose un modèle à une position géographique (latitude, longitude, hauteur au-dessus
// du sol, orientation) dans le repère SLAM du moteur 8th Wall.
//
// Le SLAM donne la pose de la caméra dans un repère local (Y vers le haut, unités proches du mètre),
// mais ne sait pas où est le nord ni où l'on est sur Terre. Chaque échantillon associe, au même instant :
//   - la position GPS du téléphone (et sa précision),
//   - le cap de la caméra donné par la boussole,
//   - la position et la direction de la caméra dans le repère SLAM.
// On en déduit l'angle du nord dans le repère SLAM et l'emplacement d'un point géographique de
// référence. Les échantillons sont moyennés (moyenne circulaire pour l'angle, pondérée par la précision
// du GPS pour la position) : le modèle se stabilise à mesure que le visiteur regarde autour de lui.
// Tout est calculé dans le téléphone (aucune position n'est envoyée).
import * as THREE from 'three'
import type { Coordonnees } from '../../commun/geo'
import type { PlacementGps } from '../../commun/types'
import type { Pose } from './contenu3d'

const RAYON_TERRE_M = 6_371_000
const RAD = Math.PI / 180
/** Hauteur supposée de la caméra au-dessus du sol (origine du repère SLAM, voir SceneRA). */
export const HAUTEUR_CAMERA_M = 1.6
/** Au-delà, la position GPS est trop imprécise pour être utile. */
export const PRECISION_GPS_MAX_M = 40
const ECHANTILLONS_MAX = 60

/** Décalage est / nord (mètres) de `b` par rapport à `a`, approximation plane valable sur quelques kilomètres. */
export function versEstNord(a: Coordonnees, b: Coordonnees): { est: number; nord: number } {
  const latMoy = ((a.latitude + b.latitude) / 2) * RAD
  return {
    est: (b.longitude - a.longitude) * RAD * Math.cos(latMoy) * RAYON_TERRE_M,
    nord: (b.latitude - a.latitude) * RAD * RAYON_TERRE_M,
  }
}

/**
 * Cap « SLAM » d'une direction horizontale : angle en degrés compté dans le sens des aiguilles d'une montre
 * depuis l'axe -Z, vu du dessus (même convention que le cap d'une boussole depuis le nord).
 */
export function capSlam(direction: THREE.Vector3): number {
  return Math.atan2(direction.x, -direction.z) / RAD
}

/** Vecteur horizontal du repère SLAM pour un décalage est / nord, `nordSlamDeg` étant le cap SLAM du nord. */
export function estNordVersSlam(est: number, nord: number, nordSlamDeg: number): THREE.Vector3 {
  const t = nordSlamDeg * RAD
  return new THREE.Vector3(nord * Math.sin(t) + est * Math.cos(t), 0, est * Math.sin(t) - nord * Math.cos(t))
}

export interface Echantillon {
  position: Coordonnees
  /** Précision du GPS (mètres, rayon à 68 %). */
  precisionM: number
  /** Cap de la caméra donné par la boussole (degrés, 0 = nord). */
  capDeg: number
  /** Position de la caméra dans le repère SLAM. */
  camera: THREE.Vector3
  /** Direction de visée de la caméra dans le repère SLAM. */
  regard: THREE.Vector3
}

/** Correspondance repère géographique ↔ repère SLAM, affinée échantillon après échantillon. */
export class AncrageGps {
  private readonly echantillons: Echantillon[] = []
  /** Point géographique de référence (le premier échantillon), proche du visiteur. */
  private reference: Coordonnees | null = null

  get nombre() {
    return this.echantillons.length
  }

  ajouter(e: Echantillon) {
    if (e.precisionM > PRECISION_GPS_MAX_M) return
    // Caméra pointée vers le ciel ou le sol : cap de la boussole et regard horizontal peu fiables.
    if (Math.abs(e.regard.clone().normalize().y) > 0.85) return
    this.reference ??= e.position
    this.echantillons.push(e)
    if (this.echantillons.length > ECHANTILLONS_MAX) this.echantillons.shift()
  }

  vider() {
    this.echantillons.length = 0
    this.reference = null
  }

  /** Cap SLAM du nord : moyenne circulaire des estimations (cap SLAM de la caméra − cap boussole). */
  private nordSlam(): number {
    let sx = 0
    let sy = 0
    for (const e of this.echantillons) {
      const a = (capSlam(new THREE.Vector3(e.regard.x, 0, e.regard.z)) - e.capDeg) * RAD
      sx += Math.cos(a)
      sy += Math.sin(a)
    }
    return Math.atan2(sy, sx) / RAD
  }

  /**
   * Position SLAM d'un point géographique, hauteur comprise. Renvoie null tant qu'aucun échantillon
   * n'est disponible. `sol` : hauteur du sol dans le repère SLAM (caméra à 1,6 m au-dessus).
   */
  versSlam(cible: Coordonnees, hauteurM: number): { position: THREE.Vector3; nordSlamDeg: number } | null {
    if (!this.reference || !this.echantillons.length) return null
    const nordSlamDeg = this.nordSlam()
    // Où se trouve la référence dans le repère SLAM ? Moyenne pondérée par 1 / précision².
    const origine = new THREE.Vector3()
    let poids = 0
    let sol = 0
    for (const e of this.echantillons) {
      const d = versEstNord(this.reference, e.position)
      const p = 1 / Math.max(1, e.precisionM) ** 2
      origine.addScaledVector(e.camera.clone().sub(estNordVersSlam(d.est, d.nord, nordSlamDeg)), p)
      sol += (e.camera.y - HAUTEUR_CAMERA_M) * p
      poids += p
    }
    origine.divideScalar(poids)
    const d = versEstNord(this.reference, cible)
    const position = origine.add(estNordVersSlam(d.est, d.nord, nordSlamDeg))
    position.y = sol / poids + hauteurM
    return { position, nordSlamDeg }
  }

  /**
   * Pose du modèle pour un placement GPS : à sa position, debout, sa face avant tournée vers le cap
   * demandé, ou vers le visiteur si aucune orientation n'est fixée.
   */
  pose(placement: PlacementGps, camera: THREE.Vector3): Pose | null {
    const r = this.versSlam(placement, placement.hauteurM)
    if (!r) return null
    const avant =
      placement.orientationDeg !== undefined
        ? estNordVersSlam(Math.sin(placement.orientationDeg * RAD), Math.cos(placement.orientationDeg * RAD), r.nordSlamDeg)
        : camera.clone().sub(r.position).setY(0)
    if (avant.lengthSq() < 1e-6) avant.set(0, 0, 1)
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(avant.x, avant.z))
    return { position: r.position, rotation, taille: placement.tailleM }
  }
}
