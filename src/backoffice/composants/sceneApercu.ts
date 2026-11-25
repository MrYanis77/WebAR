// Éléments partagés des aperçus 3D du back-office (atelier 3D, placement d'une animation d'affiche) :
// silhouette de 1,75 m, cadrage de la caméra et décor « affiche au mur » — l'affiche imprimée comme le
// PDF de l'API (image et QR code ajustés à la page), avec le modèle posé par le même calcul que
// l'application visiteur (cible 8th Wall, taille, déplacement en mètres dans le rayon de 3 m).
import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { QR_DEFAUT } from '../../commun/AfficheQr'
import { RAYON_AFFICHE_M } from '../../commun/constantes'
import { geometrieAffiche, type GeometrieAffiche } from '../../commun/impression'
import type { Affiche, ReglageAfficheRA } from '../../commun/types'
import { appliquerPose, poseSurCible } from '../../visiteur/ra/contenu3d'
import { composerAffiche } from './exportAffiche'

export type VueCamera = 'perspective' | 'face' | 'cote' | 'dessus'

export const LIBELLES_VUES: Record<VueCamera, string> = { perspective: '3D', face: 'Face', cote: 'Côté', dessus: 'Dessus' }

/** Bas de l'affiche au-dessus du sol, en mètres (comme la comparaison des formats de l'éditeur d'affiche). */
export const BAS_AFFICHE_M = 0.9

export const metres = (v: number) => (v >= 10 ? `${v.toFixed(1)} m` : v >= 1 ? `${v.toFixed(2)} m` : `${Math.round(v * 100)} cm`).replace('.', ',')

/** Silhouette humaine simplifiée de 1,75 m (repère d'échelle). */
export function silhouette(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, transparent: true, opacity: 0.55, roughness: 0.8 })
  const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.95, 4, 12), mat)
  corps.position.y = 0.2 + 0.95 / 2 + 0.05
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat)
  tete.position.y = 1.63
  g.add(corps, tete)
  return g
}

/**
 * Place la caméra pour voir toute la boîte, dans la direction de la vue (face : +Z, côté : +X,
 * dessus : +Y) ; `rayonMin` évite un cadrage trop serré sur un petit objet.
 */
export function cadrerCamera(camera: THREE.PerspectiveCamera, controles: OrbitControls, boite: THREE.Box3, vue: VueCamera, rayonMin: number) {
  const taille = boite.getSize(new THREE.Vector3())
  const cible = boite.getCenter(new THREE.Vector3())
  const rayon = Math.max(taille.x, taille.y, taille.z, rayonMin) * 0.75
  const distance = rayon / Math.sin((camera.fov * Math.PI) / 360)
  const dir = vue === 'face' ? new THREE.Vector3(0, 0, 1) : vue === 'cote' ? new THREE.Vector3(1, 0, 0) : vue === 'dessus' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.8, 0.45, 1)
  camera.position.copy(cible).addScaledVector(dir.normalize(), distance)
  camera.near = distance / 100
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  controles.target.copy(cible)
  controles.update()
}

/** Libère les géométries, matériaux et textures restant dans une scène. */
export function libererScene(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    for (const mat of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshBasicMaterial[]) {
      mat.map?.dispose()
      mat.dispose()
    }
  })
}

// ------------------------------------------------------------------ affiche au mur

/** Géométrie imprimée de l'affiche choisie (format et image), ou du gabarit au format demandé. */
export function dimensionsAffiche(affiche: Affiche | undefined, formatGabarit: string): GeometrieAffiche {
  return affiche ? geometrieAffiche(affiche.format, affiche.image?.largeur, affiche.image?.hauteur) : geometrieAffiche(formatGabarit)
}

export type Decalage = NonNullable<ReglageAfficheRA['decalage']>

/** Au centimètre, vers zéro : un déplacement ramené sur le rayon ne le dépasse jamais à l'affichage. */
const arrondi = (v: number) => Math.trunc(v * 100) / 100

/**
 * Déplacement ramené dans le rayon de 3 m (BNF-05), au centimètre, sans passer derrière le mur :
 * `zMin` est le recul possible depuis la position de départ jusqu'au plan de l'affiche.
 */
export function limiterDecalage(d: Decalage, zMin = -Infinity): Decalage {
  let { x, y } = d
  let z = Math.max(d.z, zMin)
  const longueur = Math.hypot(x, y, z)
  if (longueur > RAYON_AFFICHE_M) {
    const k = RAYON_AFFICHE_M / longueur
    x *= k
    y *= k
    z *= k
  }
  return { x: arrondi(x), y: arrondi(y), z: arrondi(z) }
}

/**
 * Recul possible depuis la position de départ jusqu'au plan de l'affiche (négatif) : le modèle ne passe
 * pas derrière le mur. Même calcul que `poseSurCible` (départ à 0,35 ou 0,1 hauteur de cible du mur).
 */
export function reculMur(position: ReglageAfficheRA['position'], hauteurCible: number) {
  return -Math.round((position === 'dessus' ? 0.1 : 0.35) * hauteurCible * 100) / 100
}

/** Gabarit d'affiche vierge (aucune affiche choisie) : cadre, titre et emplacement du QR code. */
function gabaritAffiche(format: string, ratio: number): HTMLCanvasElement {
  const H = 1200
  const W = Math.round(H * ratio)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const fond = ctx.createLinearGradient(0, 0, 0, H)
  fond.addColorStop(0, '#8d2a3b')
  fond.addColorStop(1, '#3d0f17')
  ctx.fillStyle = fond
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgb(255 255 255 / 0.55)'
  ctx.lineWidth = 6
  ctx.setLineDash([22, 14])
  ctx.strokeRect(36, 36, W - 72, H - 72)
  ctx.setLineDash([])
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.font = `700 ${Math.round(W * 0.1)}px system-ui, sans-serif`
  ctx.fillText('Votre affiche', W / 2, H * 0.4)
  ctx.font = `500 ${Math.round(W * 0.055)}px system-ui, sans-serif`
  ctx.fillText(`Gabarit ${format}`, W / 2, H * 0.4 + W * 0.09)
  const cote = QR_DEFAUT.taille * W
  ctx.fillRect(QR_DEFAUT.x * W, QR_DEFAUT.y * H, cote, cote)
  ctx.fillStyle = '#3d0f17'
  ctx.font = `700 ${Math.round(cote * 0.22)}px system-ui, sans-serif`
  ctx.fillText('QR', QR_DEFAUT.x * W + cote / 2, QR_DEFAUT.y * H + cote * 0.6)
  return c
}

/** Page imprimée : image (avec son QR code) ajustée sans déformation et centrée sur fond blanc, comme le PDF. */
function pageImprimee(image: HTMLCanvasElement, geo: GeometrieAffiche): HTMLCanvasElement {
  const H = 1600
  const W = Math.round((H * geo.pageL) / geo.pageH)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const ech = Math.min(W / image.width, H / image.height)
  const l = image.width * ech
  const h = image.height * ech
  ctx.drawImage(image, (W - l) / 2, (H - h) / 2, l, h)
  return c
}

export interface DecorAffiche {
  /** Mur, affiche, grille (devant le mur seulement) et repère du rayon de 3 m. */
  groupe: THREE.Group
  affiche: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  grille: THREE.GridHelper
  /** Demi-cercle de 3 m au sol et aplomb du modèle (placement d'une animation d'affiche). */
  rayon: THREE.Group
  /** Affiche à ses dimensions imprimées, bas à BAS_AFFICHE_M du sol, face au visiteur (+Z). */
  dimensionner(geo: GeometrieAffiche): void
  /**
   * Image de l'affiche avec son QR code, ajustée à la page (après `dimensionner`), ou gabarit ; renvoie
   * l'annulation. `avecQr` faux : l'affiche seule (QR code pas encore placé, création d'affiche).
   */
  habiller(affiche: Affiche | undefined, format: string, avecQr?: boolean): () => void
  /**
   * Pose le modèle comme l'application visiteur (la cible 3:4 de l'affiche, mesurée en mètres) et
   * renvoie sa position de départ, sans le déplacement.
   */
  poser(racine: THREE.Object3D, reglage: ReglageAfficheRA): THREE.Vector3
}

/**
 * Décor de l'affiche au mur. Le mur et l'affiche sont dessinés sous le modèle sans jamais le masquer,
 * comme l'image de la caméra dans l'application visiteur (le modèle peut « entrer » dans le mur).
 */
export function creerDecorAffiche(): DecorAffiche {
  const mur = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ color: 0xd9d3c7, depthWrite: false }))
  mur.position.set(0, 1.5, -0.005)
  mur.renderOrder = -2
  const affiche = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }))
  affiche.renderOrder = -1
  const grille = new THREE.GridHelper(8, 8, 0x7b1e2e, 0xbdb6a8)
  grille.position.z = 4

  // Rayon de 3 m : demi-cercle au sol devant le mur, centré sous la position de départ ; aplomb du modèle.
  const matRayon = new THREE.LineDashedMaterial({ color: 0x7b1e2e, dashSize: 0.12, gapSize: 0.08 })
  const arc = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI) * RAYON_AFFICHE_M, 0.003, Math.sin((i / 64) * Math.PI) * RAYON_AFFICHE_M))),
    matRayon,
  )
  arc.computeLineDistances()
  const centre = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7b1e2e }))
  centre.position.y = 0.004
  const departGroupe = new THREE.Group()
  departGroupe.add(arc, centre)
  const aplomb = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), new THREE.LineBasicMaterial({ color: 0x4fd1c5 }))
  const point = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.8 }))
  const rayon = new THREE.Group()
  rayon.add(departGroupe, aplomb, point)
  rayon.visible = false

  const groupe = new THREE.Group()
  groupe.add(mur, affiche, grille, rayon)
  let geo = geometrieAffiche('A3')

  return {
    groupe,
    affiche,
    grille,
    rayon,
    dimensionner(g) {
      geo = g
      affiche.scale.set(g.pageL, g.pageH, 1)
      affiche.position.set(0, BAS_AFFICHE_M + g.pageH / 2, 0)
    },
    habiller(a, format, avecQr = true) {
      const mat = affiche.material
      const url = a?.image?.url
      const cle = `${url ?? 'gabarit'}|${a?.codeQr}|${avecQr ? JSON.stringify(a?.qr) : 'sans-qr'}|${format}|${geo.pageL}x${geo.pageH}`
      if (mat.userData.cle === cle) return () => {}
      let annule = false
      const g = geo
      const appliquer = (toile: HTMLCanvasElement) => {
        if (annule) return
        const tex = new THREE.CanvasTexture(pageImprimee(toile, g))
        tex.colorSpace = THREE.SRGBColorSpace
        mat.map?.dispose()
        mat.map = tex
        mat.userData.cle = cle
        mat.needsUpdate = true
      }
      const gabarit = () => appliquer(gabaritAffiche(format, g.pageL / g.pageH))
      if (url && a) {
        fetch(url)
          .then((reponse) => (reponse.ok ? reponse.blob() : Promise.reject(new Error(`HTTP ${reponse.status}`))))
          .then((b) => composerAffiche(b, a.codeQr, avecQr ? (a.qr ?? QR_DEFAUT) : null, 1600))
          .then(appliquer)
          .catch(gabarit)
      } else gabarit()
      return () => {
        annule = true
      }
    },
    poser(racine, reglage) {
      // L'affiche est la cible reconnue : centrée sur la page, sa hauteur réelle vaut `scale` (mètres ici).
      const c = affiche.position
      const cible = { name: 'apercu', type: 'PLANAR', position: { x: c.x, y: c.y, z: c.z }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: geo.hauteurCible }
      const depart = poseSurCible(cible, { ...reglage, decalage: undefined }, geo.hauteurCible).position
      appliquerPose(racine, poseSurCible(cible, reglage, geo.hauteurCible))
      departGroupe.position.set(depart.x, 0, depart.z)
      aplomb.position.copy(racine.position)
      aplomb.scale.y = Math.max(0.001, racine.position.y)
      point.position.set(racine.position.x, 0.005, racine.position.z)
      return depart
    },
  }
}
