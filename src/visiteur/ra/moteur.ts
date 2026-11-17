// Moteur de réalité augmentée 8th Wall (binaire distribué @8thwall/engine-binary, licence Niantic Spatial).
// Le moteur lit la caméra, reconnaît l'affiche (cible d'image) puis suit
// l'environnement (SLAM) : l'animation reste en place même quand la cible n'est plus filmée.
// Il pilote la caméra Three.js : on utilise Three.js directement (cahier des charges, section 3.1).
// Tout est calculé dans le téléphone : aucune image ni position n'est envoyée.
import * as THREE from 'three'
import type { CibleImage } from '../../commun/types'

/** Pose d'une cible reconnue (événements reality.imagefound / imageupdated). */
export interface DetailCible {
  name: string
  type: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  /** Hauteur de l'image recadrée dans la scène : 1 unité locale de la cible vaut `scale`. */
  scale: number
  scaledWidth?: number
  scaledHeight?: number
}

export type EtatCameraMoteur = 'requesting' | 'hasStream' | 'hasVideo' | 'failed'

interface ResultatCpu {
  reality?: { trackingStatus?: 'NORMAL' | 'LIMITED'; trackingReason?: string; lighting?: { exposure?: number } }
}

/** Module du pipeline de la caméra 8th Wall (seules les étapes utilisées ici sont typées). */
export interface ModulePipeline {
  name: string
  onStart?: (a: { canvas: HTMLCanvasElement }) => void
  onUpdate?: (a: { processCpuResult: ResultatCpu }) => void
  onCameraStatusChange?: (a: { status: EtatCameraMoteur; reason?: string; video?: HTMLVideoElement }) => void
  onVideoSizeChange?: (a: { videoWidth: number; videoHeight: number }) => void
  onException?: (erreur: unknown) => void
  listeners?: { event: string; process: (e: { name: string; detail: unknown }) => void }[]
}

type ModuleOpaque = object

export interface Xr8 {
  addCameraPipelineModules(modules: (ModulePipeline | ModuleOpaque)[]): void
  clearCameraPipelineModules(): void
  run(options: { canvas: HTMLCanvasElement; allowedDevices?: string }): void
  stop(): void
  GlTextureRenderer: { pipelineModule(): ModuleOpaque }
  Threejs: {
    pipelineModule(): ModuleOpaque
    xrScene(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer }
  }
  XrController: {
    pipelineModule(): ModuleOpaque
    configure(options: { imageTargetData?: CibleImage[]; disableWorldTracking?: boolean; enableLighting?: boolean; scale?: 'responsive' | 'absolute' }): void
    updateCameraProjectionMatrix(options: { origin: THREE.Vector3; facing: THREE.Quaternion }): void
    recenter(): void
  }
  CanvasScreenshot: {
    pipelineModule(): ModuleOpaque
    configure(options: { maxDimension?: number; jpgCompression?: number }): void
    /** Image JPEG (base64, sans préfixe « data: ») de la caméra et de la scène 3D. */
    takeScreenshot(): Promise<string>
  }
  XrConfig: { device(): { MOBILE: string; MOBILE_AND_HEADSETS: string; ANY: string } }
  XrDevice: { isDeviceBrowserCompatible(options: { allowedDevices: string }): boolean }
}

declare global {
  interface Window {
    XR8?: Xr8
    THREE?: typeof THREE
  }
}

let chargement: Promise<Xr8> | null = null

/**
 * Charge le moteur à la demande (et pas au démarrage de l'application : 300 Ko maximum, section 9.2).
 * xr.js est un script classique servi sous /xr8/ (voir vite.config.ts) ; l'attribut
 * data-preload-chunks="slam" lui fait charger en plus le module de reconnaissance d'image et de SLAM.
 * L'appeler pendant les consignes avance le téléchargement.
 */
export function chargerMoteur(): Promise<Xr8> {
  if (window.XR8) return Promise.resolve(window.XR8)
  chargement ??= new Promise<Xr8>((resoudre, rejeter) => {
    // Le module Three.js du moteur utilise la version de three.js de l'application.
    window.THREE = THREE
    const script = document.createElement('script')
    script.src = `${import.meta.env.BASE_URL}xr8/xr.js`
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.preloadChunks = 'slam'
    window.addEventListener('xrloaded', () => (window.XR8 ? resoudre(window.XR8) : rejeter(new Error('Moteur 8th Wall absent'))), { once: true })
    script.onerror = () => {
      chargement = null
      script.remove()
      rejeter(new Error('Moteur 8th Wall introuvable'))
    }
    document.head.appendChild(script)
  })
  return chargement
}

/**
 * Téléchargement anticipé, pendant les consignes (section 4.1) : moteur de RA (sur smartphone) et
 * fichiers de l'animation, gardés par le cache du navigateur (fichiers /uploads en cache long).
 */
export function prechargerRA(urls: (string | undefined)[]) {
  if (appareilMobile()) void chargerMoteur().catch(() => {})
  for (const url of urls) if (url) void fetch(url).catch(() => {})
}

/**
 * Le SLAM de 8th Wall ne fonctionne que sur smartphone ou tablette (iOS 16.4+, Android) : sur ordinateur,
 * l'application garde l'aperçu simulé. Test rapide fait avant de télécharger le moteur.
 */
export function appareilMobile(): boolean {
  const ua = navigator.userAgent
  const ipadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /Android|iPhone|iPad|iPod/.test(ua) || ipadOs
}

type EvenementPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

/**
 * Sur iPhone, les capteurs de mouvement (utilisés par le SLAM) et la boussole exigent une autorisation
 * demandée pendant un geste du visiteur (DeviceOrientationEvent.requestPermission) : à appeler
 * directement dans le clic de « Autoriser et commencer ». Ailleurs, rien n'est demandé.
 */
export function demanderCapteursMouvement(): Promise<boolean> {
  const demandes = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
    .map((e) => (e as unknown as EvenementPermission | undefined)?.requestPermission)
    .filter((f): f is NonNullable<typeof f> => typeof f === 'function')
  if (!demandes.length) return Promise.resolve(true)
  return Promise.all(demandes.map((f) => f().catch(() => 'denied' as const))).then((r) => r.every((x) => x === 'granted'))
}

/**
 * Suit le cap de la caméra arrière en degrés (0 = nord, 90 = est) sur la boussole du téléphone.
 * iPhone : webkitCompassHeading. Android : orientation absolue (alpha, bêta, gamma) convertie en direction
 * de l'axe de la caméra. Renvoie la fonction qui arrête le suivi.
 */
export function suivreCap(surCap: (capDeg: number) => void): () => void {
  const ecouter = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
    if (typeof ios === 'number' && !Number.isNaN(ios)) return surCap(ios)
    if (!e.absolute || e.alpha === null || e.beta === null || e.gamma === null) return
    surCap(capCamera(e.alpha, e.beta, e.gamma))
  }
  window.addEventListener('deviceorientationabsolute', ecouter as EventListener)
  window.addEventListener('deviceorientation', ecouter)
  return () => {
    window.removeEventListener('deviceorientationabsolute', ecouter as EventListener)
    window.removeEventListener('deviceorientation', ecouter)
  }
}

/** Direction (repère est-nord) de l'axe arrière du téléphone, à partir des angles W3C (Z-X'-Y''). */
export function capCamera(alphaDeg: number, betaDeg: number, gammaDeg: number): number {
  const rad = Math.PI / 180
  const [ca, sa] = [Math.cos(alphaDeg * rad), Math.sin(alphaDeg * rad)]
  const sb = Math.sin(betaDeg * rad)
  const [cg, sg] = [Math.cos(gammaDeg * rad), Math.sin(gammaDeg * rad)]
  // Vecteur -Z du téléphone exprimé dans le repère terrestre (x = est, y = nord) ; seule sa
  // projection horizontale compte pour le cap.
  const est = -ca * sg - sa * sb * cg
  const nord = -sa * sg + ca * sb * cg
  return ((Math.atan2(est, nord) / rad) % 360 + 360) % 360
}
