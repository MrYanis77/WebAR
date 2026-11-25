// Scène de réalité augmentée : moteur 8th Wall (caméra, reconnaissance d'image, SLAM) + Three.js.
// Le moteur affiche la caméra dans le canevas et pilote la caméra Three.js ; ce composant y ajoute le
// modèle de l'animation et le pose dans l'environnement du visiteur :
//  - sur l'affiche dès qu'elle est reconnue, puis le SLAM le garde en place
//    quand le visiteur détourne le téléphone ; viser de nouveau la cible recale l'animation ;
//  - à une position GPS en 3D (latitude, longitude, hauteur, orientation) : le GPS et la boussole sont
//    échantillonnés en continu pour relier le repère géographique au repère SLAM (ra/ancrageGps.ts) ;
//  - devant le visiteur, à la demande.
// Chargé seulement à l'ouverture de la caméra (import dynamique depuis VueRA).
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { capVers, type Coordonnees } from '../../commun/geo'
import type { Animation, CibleImage, PlacementGps } from '../../commun/types'
import { AncrageGps } from '../ra/ancrageGps'
import { appliquerPose, chargerGlb, eclairer, ModeleAnime, poseDevant, poseSurCible, REGLAGE_AFFICHE_DEFAUT, type Pose, type ReglageAffiche } from '../ra/contenu3d'
import { chargerMoteur, suivreCap, type DetailCible, type ModulePipeline, type Xr8 } from '../ra/moteur'

export type EvenementScene =
  | { type: 'camera' } // image de la caméra reçue : la recherche commence
  | { type: 'camera-refusee' }
  | { type: 'incompatible' }
  | { type: 'erreur'; message: string }
  | { type: 'modele-indisponible' }
  | { type: 'cible-trouvee'; nom: string }
  | { type: 'cible-perdue' }
  | { type: 'suivi'; normal: boolean }
  | { type: 'lumiere'; sombre: boolean }
  /** Zoom nécessaire pour que l'image de la caméra remplisse tout l'écran (bouton « Plein écran »). */
  | { type: 'cadrage'; couverture: number }
  /** Animation posée mais hors du champ de la caméra : de quel côté tourner (ou lever) le téléphone. */
  | { type: 'direction'; cote: CoteDirection | null }

export type CoteDirection = 'gauche' | 'droite' | 'haut' | 'bas'

export interface CommandesScene {
  /** Pose l'animation devant le visiteur (affiche non reconnue). Renvoie false si la scène n'est pas prête. */
  poserDevant(): boolean
  /**
   * Pose l'animation à une position GPS en 3D. « sans-boussole » : aucune mesure de la boussole, le
   * téléphone est supposé viser la position ; « pas-pret » : caméra ou position pas encore disponibles.
   */
  poserGps(placement: PlacementGps): 'ok' | 'sans-boussole' | 'pas-pret'
  /** Photo de la caméra et de la scène 3D (data URL JPEG), assemblée dans le téléphone. */
  photo(): Promise<string | null>
}

interface Props {
  animation: Animation
  /** Cible d'image de l'affiche à reconnaître (aucune pour un monument : placement GPS). */
  cibles: CibleImage[]
  /** Façade : l'animation est posée au-dessus du détail reconnu, en plus grand. */
  mode: 'affiche' | 'monument'
  reglage?: ReglageAffiche
  /** Hauteur réelle (m) de la cible imprimée : échelle du déplacement de l'animation autour de l'affiche. */
  hauteurCibleM?: number
  /** Recherche (re)lancée : l'animation est retirée jusqu'à la prochaine reconnaissance. */
  recherche: boolean
  /** Relance : l'animation repart du début, à la même place. */
  cycle: number
  /**
   * Zoom de l'affichage : 1 = tout le champ de la caméra, sans recadrage (bandes noires si l'écran n'a
   * pas les proportions de la caméra). Agrandit ensemble l'image de la caméra et la scène 3D.
   */
  zoom: number
  /** Position GPS du visiteur et sa précision (mètres), pour le placement GPS en 3D. */
  gps: { coords: Coordonnees; precisionM: number } | null
  commandes: Ref<CommandesScene>
  onEvenement: (e: EvenementScene) => void
}

/** Exposition moyenne de l'image (−1 à 1) en dessous de laquelle l'éclairage est jugé trop faible. */
const SEUIL_SOMBRE = -0.55

/** Intervalle entre deux échantillons GPS + boussole + pose SLAM, et entre deux recalculs de la pose GPS. */
const INTERVALLE_ECHANTILLON_MS = 500
/** Une mesure de la boussole plus ancienne est ignorée. */
const AGE_CAP_MAX_MS = 1000

export default function SceneRA({ animation, cibles, mode, reglage = animation.reglageAffiche ?? REGLAGE_AFFICHE_DEFAUT, hauteurCibleM, recherche, cycle, zoom, gps, commandes, onEvenement }: Props) {
  const hauteurCibleRef = useRef(hauteurCibleM)
  hauteurCibleRef.current = hauteurCibleM
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const cadre = useRef<HTMLDivElement>(null)
  const gpsRef = useRef(gps)
  gpsRef.current = gps
  const conteneur = useRef<HTMLDivElement>(null)
  const canevas = useRef<HTMLCanvasElement>(null)
  const signaler = useRef(onEvenement)
  signaler.current = onEvenement
  const reglageCible = reglage
  const reglageRef = useRef(reglageCible)
  reglageRef.current = reglageCible

  // État partagé entre le pipeline du moteur (hors React) et les commandes.
  const etat = useRef<{
    xr8: Xr8 | null
    camera: THREE.PerspectiveCamera | null
    modele: ModeleAnime | null
    /** Pose visée : la racine du modèle la rejoint en douceur à chaque image. */
    pose: Pose | null
    /** Pose en attente quand le modèle n'est pas encore chargé. */
    attente: Pose | null
    recherche: boolean
    /** Correspondance GPS ↔ SLAM, alimentée en continu pendant toute la séance. */
    ancrage: AncrageGps
    /** Placement GPS en cours : la pose est recalculée à chaque nouvel échantillon (le modèle se stabilise). */
    placementGps: PlacementGps | null
    /** Dernière mesure de la boussole. */
    cap: { valeur: number; instant: number } | null
  }>({ xr8: null, camera: null, modele: null, pose: null, attente: null, recherche, ancrage: new AncrageGps(), placementGps: null, cap: null })

  /** Pose (ou recale) le modèle ; `suivre` = recalage doux sur une cible déjà posée. */
  function poser(pose: Pose, suivre = false) {
    const e = etat.current
    if (!e.modele) {
      e.attente = pose
      return
    }
    const deja = e.modele.visible
    e.pose = pose
    if (!deja || !suivre) {
      appliquerPose(e.modele.racine, pose)
      if (!deja) e.modele.lancer()
    }
  }

  /** Pose l'animation à une position GPS en 3D (voir CommandesScene.poserGps). */
  function placerGps(placement: PlacementGps): 'ok' | 'sans-boussole' | 'pas-pret' {
    const e = etat.current
    const position = gpsRef.current
    if (!e.camera || !position) return 'pas-pret'
    let resultat: 'ok' | 'sans-boussole' = 'ok'
    if (!e.ancrage.nombre) {
      // Pas de boussole : on suppose que le visiteur vise la position (cap de la caméra = cap de la cible).
      resultat = 'sans-boussole'
      e.ancrage.ajouter({
        position: position.coords,
        precisionM: Math.min(position.precisionM, 30),
        capDeg: capVers(position.coords, placement),
        camera: e.camera.getWorldPosition(new THREE.Vector3()),
        regard: e.camera.getWorldDirection(new THREE.Vector3()).setY(0),
      })
    }
    const pose = e.ancrage.pose(placement, e.camera.getWorldPosition(new THREE.Vector3()))
    if (!pose) return 'pas-pret'
    e.recherche = false
    e.placementGps = placement
    poser(pose)
    return resultat
  }

  useImperativeHandle(commandes, () => ({
    poserDevant() {
      const { camera } = etat.current
      if (!camera) return false
      etat.current.recherche = false
      poser(poseDevant(camera, mode === 'monument' ? 2 : 1))
      return true
    },
    poserGps: placerGps,
    async photo() {
      const xr8 = etat.current.xr8
      if (!xr8) return null
      try {
        return `data:image/jpeg;base64,${await xr8.CanvasScreenshot.takeScreenshot()}`
      } catch {
        return null
      }
    },
  }))

  // Nouvelle recherche : l'animation disparaît jusqu'à la prochaine reconnaissance.
  useEffect(() => {
    const e = etat.current
    e.recherche = recherche
    if (recherche) {
      e.modele?.masquer()
      e.pose = null
      e.attente = null
      e.placementGps = null
    }
  }, [recherche, cycle])

  // Relance : l'animation repart du début, à la même place.
  useEffect(() => {
    const e = etat.current
    if (cycle > 0 && !e.recherche && e.pose) e.modele?.lancer()
  }, [cycle])

  // Boussole suivie pendant toute la séance (placement GPS) ; autorisation demandée pendant les consignes.
  useEffect(() => suivreCap((valeur) => (etat.current.cap = { valeur, instant: performance.now() })), [])

  // Cycle de vie du moteur : chargé une fois, démarré à l'ouverture de la vue, arrêté en la quittant.
  const cleCibles = cibles.map((c) => c.name).join(',')
  useEffect(() => {
    const canvas = canevas.current
    const boite = conteneur.current
    if (!canvas || !boite) return
    if (!animation.modeleUrl) {
      signaler.current({ type: 'modele-indisponible' })
      return
    }
    let annule = false
    let demarre = false
    let liberer: (() => void) | null = null
    const e = etat.current

    // Le moteur remplit le canevas avec l'image de la caméra, en la recadrant si leurs proportions
    // diffèrent. Le canevas prend donc les proportions de la caméra et tient entièrement dans l'écran :
    // tout le champ est visible (zoom 1). Le zoom agrandit ensuite le cadre (caméra et 3D ensemble).
    let proportionCamera = 0 // largeur / hauteur de l'image de la caméra, une fois connue
    let derniereCouverture = 0
    const surTailleVideo = (largeur: number, hauteur: number) => {
      if (!largeur || !hauteur) return
      let p = largeur / hauteur
      // L'image suit l'orientation de l'écran (portrait sur un téléphone tenu droit).
      const portrait = boite.clientHeight > boite.clientWidth
      if (portrait !== p < 1) p = 1 / p
      if (Math.abs(p - proportionCamera) < 1e-3) return
      proportionCamera = p
      redimensionner()
    }
    const redimensionner = () => {
      const [bl, bh] = [boite.clientWidth, boite.clientHeight]
      const p = proportionCamera || (bh > bl ? 3 / 4 : 4 / 3)
      const [l, h] = bl / bh > p ? [bh * p, bh] : [bl, bl / p]
      const cadreEl = cadre.current
      if (cadreEl) {
        cadreEl.style.width = `${l}px`
        cadreEl.style.height = `${h}px`
      }
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(l * ratio))
      canvas.height = Math.max(1, Math.round(h * ratio))
      const couverture = Math.max(bl / l, bh / h)
      if (Math.abs(couverture - derniereCouverture) > 1e-3) {
        derniereCouverture = couverture
        signaler.current({ type: 'cadrage', couverture })
      }
    }
    redimensionner()
    const observateur = new ResizeObserver(redimensionner)
    observateur.observe(boite)

    const surCible = (detail: DetailCible, nouvelle: boolean) => {
      if (!cibles.some((c) => c.name === detail.name)) return
      // Pendant une recherche, ou pour recaler l'animation déjà posée sur cette cible.
      if (!e.recherche && !e.modele?.visible && !e.attente) return
      const premiere = e.recherche
      e.recherche = false
      e.placementGps = null
      poser(poseSurCible(detail, reglageRef.current, hauteurCibleRef.current), !premiere)
      if (nouvelle || premiere) signaler.current({ type: 'cible-trouvee', nom: detail.name })
    }

    let dernierSuivi: boolean | null = null
    let dernierEchantillon = 0
    let derniereDirection: CoteDirection | null = null
    let dernierSombre = false
    let horloge = performance.now()

    /** Échantillon GPS + boussole + pose SLAM, puis nouvelle pose si un placement GPS est en cours. */
    const echantillonner = (camera: THREE.PerspectiveCamera, suiviNormal: boolean, maintenant: number) => {
      const position = gpsRef.current
      const cap = e.cap
      if (suiviNormal && position && cap && maintenant - cap.instant < AGE_CAP_MAX_MS)
        e.ancrage.ajouter({
          position: position.coords,
          precisionM: position.precisionM,
          capDeg: cap.valeur,
          camera: camera.getWorldPosition(new THREE.Vector3()),
          regard: camera.getWorldDirection(new THREE.Vector3()),
        })
      if (e.placementGps && e.modele?.visible) {
        const pose = e.ancrage.pose(e.placementGps, camera.getWorldPosition(new THREE.Vector3()))
        if (pose) e.pose = pose // rejointe en douceur à chaque image
      }
    }

    /**
     * Animation hors du champ : indique de quel côté tourner le téléphone, ou s'il faut le lever ou le
     * baisser (modèle posé en hauteur, au-dessus d'un bâtiment). Le champ visible tient compte du zoom.
     */
    const signalerDirection = (camera: THREE.PerspectiveCamera) => {
      let cote: CoteDirection | null = null
      if (e.modele?.visible) {
        const centre = e.modele.racine.getWorldPosition(new THREE.Vector3())
        centre.y += e.modele.racine.scale.y * 0.5
        const local = centre.applyMatrix4(camera.matrixWorldInverse)
        const deg = Math.PI / 180
        const angle = Math.atan2(local.x, -local.z) / deg
        const elevation = Math.atan2(local.y, Math.hypot(local.x, local.z)) / deg
        // Part de l'image de la caméra réellement visible à l'écran (le zoom recadre).
        const cadreEl = cadre.current
        const z = Math.max(1, zoomRef.current)
        const partL = cadreEl?.offsetWidth ? Math.min(1, boite.clientWidth / (cadreEl.offsetWidth * z)) : 1
        const partH = cadreEl?.offsetHeight ? Math.min(1, boite.clientHeight / (cadreEl.offsetHeight * z)) : 1
        const tanV = Math.tan((camera.fov * deg) / 2)
        const demiH = Math.atan(tanV * Math.max(camera.aspect, 0.3) * partL) / deg
        const demiV = Math.atan(tanV * partH) / deg
        if (Math.abs(angle) > demiH) cote = angle > 0 ? 'droite' : 'gauche'
        else if (Math.abs(elevation) > demiV) cote = elevation > 0 ? 'haut' : 'bas'
      }
      if (cote !== derniereDirection) {
        derniereDirection = cote
        signaler.current({ type: 'direction', cote })
      }
    }

    const moduleScene: ModulePipeline = {
      name: 'montbeliard-scene',
      onStart: () => {
        const xr8 = e.xr8!
        const { scene, camera, renderer } = xr8.Threejs.xrScene()
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.shadowMap.enabled = false
        // Origine du repère SLAM : caméra à 1,6 m du sol, unités proches du mètre.
        camera.position.set(0, 1.6, 0)
        xr8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion })
        e.camera = camera
        const eclairage = eclairer(scene, renderer)
        chargerGlb(animation.modeleUrl!, renderer)
          .then((gltf) => {
            if (annule) return
            const modele = new ModeleAnime(gltf, animation)
            eclairage.regler(modele.luminosite)
            scene.add(modele.racine)
            e.modele = modele
            if (e.attente) {
              const pose = e.attente
              e.attente = null
              poser(pose)
            }
          })
          .catch(() => !annule && signaler.current({ type: 'modele-indisponible' }))
        liberer = () => {
          eclairage.liberer()
          e.modele?.liberer()
          e.modele = null
          e.camera = null
        }
      },
      onUpdate: ({ processCpuResult }) => {
        const maintenant = performance.now()
        const dt = Math.min(0.1, (maintenant - horloge) / 1000)
        horloge = maintenant
        if (e.modele && e.pose) appliquerPose(e.modele.racine, e.pose, 1 - Math.exp(-dt * 8))
        e.modele?.mettreAJour(dt)
        const realite = processCpuResult.reality
        if (!realite) return
        const normal = realite.trackingStatus !== 'LIMITED'
        if (e.camera && maintenant - dernierEchantillon > INTERVALLE_ECHANTILLON_MS) {
          dernierEchantillon = maintenant
          echantillonner(e.camera, normal, maintenant)
          signalerDirection(e.camera)
        }
        if (normal !== dernierSuivi) {
          dernierSuivi = normal
          signaler.current({ type: 'suivi', normal })
        }
        const exposition = realite.lighting?.exposure
        if (typeof exposition === 'number') {
          const sombre = dernierSombre ? exposition < SEUIL_SOMBRE + 0.1 : exposition < SEUIL_SOMBRE
          if (sombre !== dernierSombre) {
            dernierSombre = sombre
            signaler.current({ type: 'lumiere', sombre })
          }
        }
      },
      onVideoSizeChange: ({ videoWidth, videoHeight }) => surTailleVideo(videoWidth, videoHeight),
      onCameraStatusChange: ({ status, reason, video }) => {
        if (status === 'hasVideo') {
          if (video) surTailleVideo(video.videoWidth, video.videoHeight)
          signaler.current({ type: 'camera' })
        }
        if (status === 'failed') signaler.current(reason === 'DENY_CAMERA' ? { type: 'camera-refusee' } : { type: 'erreur', message: reason ?? 'camera' })
      },
      onException: (erreur) => {
        // Autorisation refusée : { type: 'permission', permission: 'camera' | 'deviceorientation' | … }.
        const refus = erreur as { type?: string; permission?: string } | null
        if (refus?.type === 'permission' && refus.permission === 'camera') return signaler.current({ type: 'camera-refusee' })
        // Capteurs de mouvement refusés ou absents, navigateur non pris en charge : repli sur l'aperçu simulé.
        signaler.current({ type: 'erreur', message: erreur instanceof Error ? erreur.message : JSON.stringify(erreur) })
      },
      listeners: [
        { event: 'reality.imagefound', process: ({ detail }) => surCible(detail as DetailCible, true) },
        { event: 'reality.imageupdated', process: ({ detail }) => surCible(detail as DetailCible, false) },
        { event: 'reality.imagelost', process: () => signaler.current({ type: 'cible-perdue' }) },
      ],
    }

    chargerMoteur()
      .then((xr8) => {
        if (annule) return
        if (!xr8.XrDevice.isDeviceBrowserCompatible({ allowedDevices: xr8.XrConfig.device().MOBILE_AND_HEADSETS })) {
          signaler.current({ type: 'incompatible' })
          return
        }
        e.xr8 = xr8
        // Reconnaissance des cibles + SLAM (le suivi de l'environnement garde l'animation en place).
        xr8.XrController.configure({ imageTargetData: cibles, disableWorldTracking: false, enableLighting: true, scale: 'responsive' })
        xr8.CanvasScreenshot.configure({ maxDimension: 1620, jpgCompression: 88 })
        xr8.addCameraPipelineModules([
          xr8.GlTextureRenderer.pipelineModule(), // image de la caméra
          xr8.Threejs.pipelineModule(), // scène Three.js pilotée par le moteur
          xr8.XrController.pipelineModule(), // reconnaissance d'image et SLAM
          xr8.CanvasScreenshot.pipelineModule(), // photo
          moduleScene,
        ])
        xr8.run({ canvas, allowedDevices: xr8.XrConfig.device().MOBILE_AND_HEADSETS })
        demarre = true
      })
      .catch((err: Error) => !annule && signaler.current({ type: 'erreur', message: err.message }))

    return () => {
      annule = true
      observateur.disconnect()
      if (demarre && e.xr8) {
        e.xr8.stop()
        e.xr8.clearCameraPipelineModules()
      }
      liberer?.()
      e.xr8 = null
      e.pose = null
      e.attente = null
      e.placementGps = null
      e.ancrage.vider()
    }
    // Le moteur n'est redémarré que si le modèle ou les cibles changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation.modeleUrl, animation.clipIndice, animation.lecture, cleCibles])

  return (
    <div className="scene-ra" ref={conteneur}>
      <div className="cadre-ra" ref={cadre} style={{ transform: `translate(-50%, -50%) scale(${zoom})` }}>
        <canvas ref={canevas} className="canevas-ra" />
      </div>
    </div>
  )
}
