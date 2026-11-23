// Vue 3D de l'atelier d'affiche : l'affiche imprimée au mur (l'affiche en cours, une autre affiche ou un
// gabarit), le modèle posé exactement comme dans l'application visiteur, et des poignées pour le
// déplacer (dans le rayon de 3 m, BNF-05), le tourner (rotation du modèle) ou l'agrandir (taille par
// rapport à la hauteur de l'affiche). Silhouette de 1,75 m, grille d'1 m, vues 3D / face / côté / dessus.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { RAYON_AFFICHE_M } from '../../../commun/constantes'
import { Icone } from '../../../commun/Icone'
import type { GeometrieAffiche } from '../../../commun/impression'
import type { Affiche, ReglageAfficheRA, Reglages3D } from '../../../commun/types'
import { chargerGlb, eclairer, ModeleAnime, type Eclairage } from '../../../visiteur/ra/contenu3d'
import { cadrerCamera, creerDecorAffiche, LIBELLES_VUES, libererScene, limiterDecalage, metres, reculMur, silhouette, type DecorAffiche, type VueCamera } from '../sceneApercu'
import { normaliserAngle, OUTILS_VUE, OutilsVue, type Outil } from './OutilsAtelier'

const RAD = Math.PI / 180
/** Bornes de la taille du modèle, en hauteurs d'affiche. */
export const TAILLE_AFFICHE = { min: 0.2, max: 5 } as const

const CONSIGNES: Partial<Record<Outil, string>> = {
  position: 'Glissez une flèche (un axe) ou un carré (un plan) pour déplacer le modèle.',
  rotation: 'Glissez un anneau pour faire tourner le modèle.',
  taille: 'Glissez le cube central ou une poignée pour agrandir ou réduire le modèle.',
}

export function VueAffiche3D({
  affiche,
  format,
  geo,
  modeleUrl,
  clipIndice,
  lecture,
  reglages3d,
  reglage,
  outil,
  onOutil,
  onReglage,
  onRotation,
  onDimensions,
  desactive,
}: {
  /** Affiche montrée au mur (image et QR code) ; absente : gabarit au format `format`. */
  affiche?: Affiche
  format: string
  geo: GeometrieAffiche
  modeleUrl?: string
  clipIndice?: number
  lecture?: 'BOUCLE' | 'UNE_FOIS'
  /** Réglages du modèle en cours d'édition, appliqués en direct. */
  reglages3d: Reglages3D
  reglage: ReglageAfficheRA
  outil: Outil
  onOutil: (o: Outil) => void
  onReglage: (r: ReglageAfficheRA) => void
  onRotation: (r: Reglages3D['rotation']) => void
  /** Dimensions du modèle ramené à 1 (plus grande dimension), rotation comprise ; null sans modèle. */
  onDimensions?: (d: THREE.Vector3 | null) => void
  desactive?: boolean
}) {
  const [vue, setVue] = useState<VueCamera>('perspective')
  const [humain, setHumain] = useState(true)
  const [grille, setGrille] = useState(true)
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  const [etatModele, setEtatModele] = useState<'chargement' | 'erreur' | null>(null)
  /** Compteur de chargements du modèle : déclenche la pose, le cadrage et les poignées. */
  const [charge, setCharge] = useState(0)

  const conteneur = useRef<HTMLDivElement>(null)
  const scene3d = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controles: OrbitControls
    poignees: TransformControls
    /** Repère des poignées « tourner » et « agrandir », au centre du modèle. */
    pivot: THREE.Object3D
    eclairage: Eclairage
    decor: DecorAffiche
    humain: THREE.Object3D
    modele: ModeleAnime | null
    /** Position de départ du modèle (sans le déplacement), dans la scène. */
    depart: THREE.Vector3
    /** Valeurs au début du glisser d'une poignée. */
    debut: { rotation: THREE.Quaternion; taille: number } | null
  } | null>(null)

  // Valeurs lues par les poignées pendant le glisser (hors du rendu React).
  const reglageRef = useRef(reglage)
  reglageRef.current = reglage
  const reglages3dRef = useRef(reglages3d)
  reglages3dRef.current = reglages3d
  const outilRef = useRef(outil)
  outilRef.current = outil
  const rappels = useRef({ onReglage, onRotation, onDimensions })
  rappels.current = { onReglage, onRotation, onDimensions }
  const recul = reculMur(reglage.position, geo.hauteurCible)
  const reculRef = useRef(recul)
  reculRef.current = recul

  /** Place le repère des poignées au centre du modèle. */
  function placerPivot() {
    const s = scene3d.current
    if (!s?.modele || s.debut) return
    s.modele.boiteMonde().getCenter(s.pivot.position)
  }

  /** Cadre la caméra sur l'affiche et le modèle ; vue de dessus : tout le rayon de 3 m. */
  function cadrer(v: VueCamera) {
    const s = scene3d.current
    if (!s) return
    const boite = new THREE.Box3().setFromObject(s.decor.affiche)
    if (s.modele) boite.union(s.modele.boiteMonde())
    if (v === 'dessus') boite.expandByPoint(new THREE.Vector3(-RAYON_AFFICHE_M, 0, 0)).expandByPoint(new THREE.Vector3(RAYON_AFFICHE_M, 0, RAYON_AFFICHE_M + s.depart.z))
    cadrerCamera(s.camera, s.controles, boite, v, 0.5)
  }

  // Scène Three.js : créée une fois.
  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeeeae2)
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / Math.max(1, el.clientHeight), 0.01, 1000)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true
    const eclairage = eclairer(scene, renderer)
    const decor = creerDecorAffiche()
    const humainObj = silhouette()
    const pivot = new THREE.Object3D()
    scene.add(decor.groupe, humainObj, pivot)

    // Poignées : flèches et carrés (déplacer), anneaux (tourner), cubes (agrandir).
    const poignees = new TransformControls(camera, renderer.domElement)
    poignees.setSpace('world')
    poignees.setSize(0.9)
    poignees.addEventListener('dragging-changed', (e) => {
      const glisse = (e as unknown as { value: boolean }).value
      controles.enabled = !glisse
      const s = scene3d.current
      if (!s) return
      pivot.quaternion.identity()
      pivot.scale.setScalar(1)
      if (glisse) {
        const r = reglages3dRef.current.rotation
        s.debut = { rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x * RAD, r.y * RAD, r.z * RAD)), taille: reglageRef.current.taille }
      } else {
        s.debut = null
        placerPivot()
      }
    })
    poignees.addEventListener('objectChange', () => {
      const s = scene3d.current
      const racine = s?.modele?.racine
      if (!s || !racine) return
      const mode = outilRef.current
      if (mode === 'position') {
        const d = limiterDecalage({ x: racine.position.x - s.depart.x, y: racine.position.y - s.depart.y, z: racine.position.z - s.depart.z }, reculRef.current)
        racine.position.set(s.depart.x + d.x, s.depart.y + d.y, s.depart.z + d.z)
        rappels.current.onReglage({ ...reglageRef.current, decalage: d })
      } else if (mode === 'rotation' && s.debut) {
        // Le modèle est face au mur (+Z) : une rotation du monde s'applique telle quelle à son orientation.
        const e = new THREE.Euler().setFromQuaternion(pivot.quaternion.clone().multiply(s.debut.rotation), 'XYZ')
        const r = { x: normaliserAngle(e.x / RAD), y: normaliserAngle(e.y / RAD), z: normaliserAngle(e.z / RAD) }
        const actuelle = reglages3dRef.current.rotation
        if (r.x !== actuelle.x || r.y !== actuelle.y || r.z !== actuelle.z) rappels.current.onRotation(r)
      } else if (mode === 'taille' && s.debut) {
        // Facteur de la poignée la plus tirée (un axe ou le cube central) : la taille reste uniforme.
        const facteur = [pivot.scale.x, pivot.scale.y, pivot.scale.z].reduce((a, b) => (Math.abs(Math.log(Math.max(b, 1e-3))) > Math.abs(Math.log(Math.max(a, 1e-3))) ? b : a), 1)
        const taille = THREE.MathUtils.clamp(Math.round(s.debut.taille * facteur * 20) / 20, TAILLE_AFFICHE.min, TAILLE_AFFICHE.max)
        if (taille !== reglageRef.current.taille) rappels.current.onReglage({ ...reglageRef.current, taille })
      }
    })
    scene.add(poignees.getHelper())
    scene3d.current = { renderer, scene, camera, controles, poignees, pivot, eclairage, decor, humain: humainObj, modele: null, depart: new THREE.Vector3(), debut: null }

    // Dessinée seulement quand elle est à l'écran (le formulaire peut défiler).
    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(el)
    let precedent = performance.now()
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - precedent) / 1000)
      precedent = t
      if (!visible) return
      scene3d.current?.modele?.mettreAJour(dt)
      controles.update()
      renderer.render(scene, camera)
    })
    const observateur = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight)
      camera.updateProjectionMatrix()
    })
    observateur.observe(el)
    return () => {
      renderer.setAnimationLoop(null)
      io.disconnect()
      observateur.disconnect()
      poignees.detach()
      poignees.dispose()
      controles.dispose()
      scene3d.current?.modele?.liberer()
      eclairage.liberer()
      libererScene(scene)
      renderer.dispose()
      renderer.domElement.remove()
      scene3d.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Modèle : rechargé quand le fichier, l'animation intégrée ou la lecture changent (les réglages s'appliquent en direct).
  useEffect(() => {
    const s = scene3d.current
    if (!s || !modeleUrl) {
      setDimsUnite(null)
      setEtatModele(null)
      rappels.current.onDimensions?.(null)
      return
    }
    let annule = false
    let instance: ModeleAnime | null = null
    setEtatModele('chargement')
    chargerGlb(modeleUrl, s.renderer)
      .then((gltf) => {
        if (annule || scene3d.current !== s) return
        instance = new ModeleAnime(gltf, { reglages3d: reglages3dRef.current, clipIndice, lecture })
        s.scene.add(instance.racine)
        instance.lancer()
        s.eclairage.regler(reglages3dRef.current.luminosite)
        s.modele = instance
        const d = instance.dimensions()
        setDimsUnite(d)
        rappels.current.onDimensions?.(d)
        setEtatModele(null)
        setCharge((n) => n + 1)
      })
      .catch(() => !annule && setEtatModele('erreur'))
    return () => {
      annule = true
      if (instance) {
        s.poignees.detach()
        instance.liberer()
        if (s.modele === instance) s.modele = null
      }
    }
  }, [modeleUrl, clipIndice, lecture])

  // Réglages du modèle (rotation, ancrage, vitesse, luminosité) appliqués en direct.
  useEffect(() => {
    const s = scene3d.current
    if (!s?.modele) return
    s.modele.appliquerReglages(reglages3d)
    s.eclairage.regler(reglages3d.luminosite)
    const d = s.modele.dimensions()
    setDimsUnite(d)
    rappels.current.onDimensions?.(d)
    placerPivot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglages3d, charge])

  // Affiche à son format, modèle posé (calcul de l'application visiteur) : départ + déplacement.
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.decor.dimensionner(geo)
    s.humain.position.set(-(geo.pageL / 2 + 0.6), 0, 0.3)
    s.decor.rayon.visible = !!s.modele
    if (!s.modele) return
    s.depart.copy(s.decor.poser(s.modele.racine, reglage))
    placerPivot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.pageL, geo.pageH, geo.hauteurCible, reglage, charge])

  // Image de l'affiche avec son QR code, ou gabarit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scene3d.current?.decor.habiller(affiche, format), [affiche, format, geo.pageL, geo.pageH])

  // Cadrage : au chargement du modèle, au changement de point de départ ou de format d'affiche.
  useEffect(() => {
    cadrer(vue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, reglage.position, geo.pageL, geo.pageH])

  // Poignées de l'outil choisi.
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    if (desactive || !s.modele || !OUTILS_VUE.includes(outil)) {
      s.poignees.detach()
      return
    }
    s.poignees.setMode(outil === 'position' ? 'translate' : outil === 'rotation' ? 'rotate' : 'scale')
    s.poignees.setSpace(outil === 'taille' ? 'local' : 'world')
    s.poignees.attach(outil === 'position' ? s.modele.racine : s.pivot)
  }, [outil, charge, desactive])

  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.humain.visible = humain
    s.decor.grille.visible = grille
  }, [humain, grille])

  const dims = dimsUnite && modeleUrl ? dimsUnite.clone().multiplyScalar(geo.hauteurCible * reglage.taille) : null
  const d = reglage.decalage
  const distance = d ? Math.hypot(d.x, d.y, d.z) : 0

  return (
    <div className="vue-atelier">
      <div className="atelier-canevas" ref={conteneur} role="img" aria-label="Aperçu 3D : l’affiche au mur et le modèle posé comme sur le téléphone du visiteur. Utilisez les poignées pour le déplacer, le tourner ou l’agrandir." />
      <div className="atelier-outils-vue">
        <OutilsVue outil={outil} onOutil={onOutil} desactive={desactive || !dims} />
        <span className="separateur" />
        {(['perspective', 'face', 'cote', 'dessus'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={vue === v ? 'actif' : ''}
            onClick={() => {
              setVue(v)
              cadrer(v)
            }}
          >
            {LIBELLES_VUES[v]}
          </button>
        ))}
        <span className="separateur" />
        <button type="button" className={humain ? 'actif' : ''} aria-pressed={humain} onClick={() => setHumain(!humain)} title="Silhouette de 1,75 m">
          1,75 m
        </button>
        <button type="button" className={grille ? 'actif' : ''} aria-pressed={grille} onClick={() => setGrille(!grille)} title="Grille d’1 m au sol">
          Grille
        </button>
      </div>
      {dims && (
        <div className="atelier-dimensions" aria-live="polite">
          <strong>Sur une affiche {format}</strong>
          <span>
            L {metres(dims.x)} · H {metres(dims.y)} · P {metres(dims.z)}
          </span>
          <small>{distance < 0.005 ? 'À sa position de départ' : `À ${metres(distance)} de sa position de départ`} · rayon de {RAYON_AFFICHE_M} m</small>
        </div>
      )}
      {dims && !desactive && CONSIGNES[outil] && <p className="consigne-vue">{CONSIGNES[outil]}</p>}
      {(!modeleUrl || etatModele) && (
        <p className="message-vue" role="status">
          {etatModele === 'chargement' ? (
            <>
              <span className="spinner" /> Chargement du modèle…
            </>
          ) : etatModele === 'erreur' ? (
            <>
              <Icone nom="alerte" taille={14} /> Modèle 3D illisible
            </>
          ) : (
            <>
              <Icone nom="cube" taille={14} /> Choisissez un modèle 3D pour le voir sur l’affiche.
            </>
          )}
        </p>
      )}
    </div>
  )
}
