// Placement d'une animation d'affiche (étape 3 du formulaire), dans une vue 3D comme le studio de
// l'atelier : l'affiche imprimée au mur (affiche choisie ou gabarit au format voulu) et le modèle posé
// exactement comme dans l'application visiteur. Point de départ devant ou au-dessus de l'affiche, puis
// déplacement libre dans un rayon de 3 m (BNF-05) : poignées sur le modèle dans la vue, ou curseurs.
// Silhouette de 1,75 m, grille d'1 m et vues 3D / face / côté / dessus, comme le studio.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { RAYON_AFFICHE_M } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import type { Animation, ReglageAfficheRA } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime, type Eclairage } from '../../visiteur/ra/contenu3d'
import { ChoixAffiche, useAffichesProposees } from './ChoixAffiche'
import {
  cadrerCamera,
  creerDecorAffiche,
  dimensionsAffiche,
  LIBELLES_VUES,
  libererScene,
  limiterDecalage,
  metres,
  silhouette,
  type Decalage,
  type DecorAffiche,
  type VueCamera,
} from './sceneApercu'

const virgule = (v: number) => String(v).replace('.', ',')
const AUCUN_DECALAGE: Decalage = { x: 0, y: 0, z: 0 }

/** Libellé d'un déplacement sur un axe : « 1,20 m à droite », « au centre ». */
function sens(v: number, positif: string, negatif: string) {
  if (Math.abs(v) < 0.005) return 'aucun'
  return `${metres(Math.abs(v))} ${v > 0 ? positif : negatif}`
}

export function EditeurPlacementAffiche({
  reglage,
  onChange,
  modele,
  animationId,
}: {
  reglage: ReglageAfficheRA
  onChange: (r: ReglageAfficheRA) => void
  /** Modèle de l'animation (réglages de l'atelier 3D, clip, lecture) ; absent tant qu'aucun modèle n'est choisi. */
  modele?: Pick<Animation, 'modeleUrl' | 'reglages3d' | 'clipIndice' | 'lecture'>
  /** Animation éditée : les affiches qui l'utilisent sont proposées en premier. */
  animationId?: string
}) {
  const { liees, autres } = useAffichesProposees([animationId])
  const [afficheId, setAfficheId] = useState(() => liees[0]?.id ?? '')
  const [formatGabarit, setFormatGabarit] = useState('A3')
  const affiche = liees.find((x) => x.id === afficheId) ?? autres.find((x) => x.id === afficheId)
  const geo = dimensionsAffiche(affiche, formatGabarit)
  const { format, pageL, pageH } = geo
  const [vue, setVue] = useState<VueCamera>('perspective')
  const [humain, setHumain] = useState(true)
  const [grille, setGrille] = useState(true)
  const [poignees, setPoignees] = useState(true)
  /** Dimensions du modèle ramené à 1 unité (plus grande dimension), réglages de l'atelier appliqués. */
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  const [etatModele, setEtatModele] = useState<'chargement' | 'erreur' | null>(null)
  /** Compteur de chargements du modèle : déclenche la pose et le cadrage. */
  const [charge, setCharge] = useState(0)
  /** Recul possible depuis la position de départ jusqu'au mur (le modèle ne passe pas derrière l'affiche). */
  const [zMin, setZMin] = useState(-0.15)

  const decalage = reglage.decalage ?? AUCUN_DECALAGE
  const distance = Math.hypot(decalage.x, decalage.y, decalage.z)
  const deplacer = (d: Decalage) => onChange({ ...reglage, decalage: limiterDecalage(d, zMin) })

  const conteneur = useRef<HTMLDivElement>(null)
  const scene3d = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controles: OrbitControls
    poignees: TransformControls
    eclairage: Eclairage
    decor: DecorAffiche
    humain: THREE.Object3D
    modele: ModeleAnime | null
    /** Position de départ du modèle (sans le déplacement), dans la scène. */
    depart: THREE.Vector3
  } | null>(null)
  // Valeurs lues par les poignées pendant le glisser (hors du rendu React).
  const reglageRef = useRef(reglage)
  reglageRef.current = reglage
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const zMinRef = useRef(zMin)
  zMinRef.current = zMin

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
    decor.rayon.visible = true
    const humainObj = silhouette()
    scene.add(decor.groupe, humainObj)

    // Poignées de déplacement sur le modèle : flèches (un axe), carrés (un plan), centre (face à la caméra).
    const poigneesObj = new TransformControls(camera, renderer.domElement)
    poigneesObj.setSpace('world')
    poigneesObj.setSize(0.85)
    poigneesObj.addEventListener('dragging-changed', (e) => {
      controles.enabled = !(e as unknown as { value: boolean }).value
    })
    poigneesObj.addEventListener('objectChange', () => {
      const s = scene3d.current
      const racine = s?.modele?.racine
      if (!s || !racine) return
      const d = limiterDecalage({ x: racine.position.x - s.depart.x, y: racine.position.y - s.depart.y, z: racine.position.z - s.depart.z }, zMinRef.current)
      racine.position.set(s.depart.x + d.x, s.depart.y + d.y, s.depart.z + d.z)
      onChangeRef.current({ ...reglageRef.current, decalage: d })
    })
    scene.add(poigneesObj.getHelper())
    scene3d.current = { renderer, scene, camera, controles, poignees: poigneesObj, eclairage, decor, humain: humainObj, modele: null, depart: new THREE.Vector3() }

    // Dessinée seulement quand elle est à l'écran (le formulaire défile).
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
      poigneesObj.detach()
      poigneesObj.dispose()
      controles.dispose()
      scene3d.current?.modele?.liberer()
      eclairage.liberer()
      libererScene(scene)
      renderer.dispose()
      renderer.domElement.remove()
      scene3d.current = null
    }
  }, [])

  // Modèle de l'animation : rechargé quand il change, ou que ses réglages d'atelier, son clip ou sa lecture changent.
  useEffect(() => {
    const s = scene3d.current
    const url = modele?.modeleUrl
    if (!s || !url) {
      setDimsUnite(null)
      setEtatModele(null)
      return
    }
    let annule = false
    let instance: ModeleAnime | null = null
    setEtatModele('chargement')
    chargerGlb(url, s.renderer)
      .then((gltf) => {
        if (annule || scene3d.current !== s) return
        instance = new ModeleAnime(gltf, modele)
        s.scene.add(instance.racine)
        instance.lancer()
        s.eclairage.regler(instance.luminosite)
        s.modele = instance
        setDimsUnite(instance.dimensions())
        setEtatModele(null)
        setCharge((n) => n + 1)
      })
      .catch(() => !annule && setEtatModele('erreur'))
    return () => {
      annule = true
      if (instance) {
        if (s.poignees.object === instance.racine) s.poignees.detach()
        instance.liberer()
        if (s.modele === instance) s.modele = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modele?.modeleUrl, modele?.reglages3d, modele?.clipIndice, modele?.lecture])

  // Affiche à son format, modèle posé (calcul de l'application visiteur) : départ + déplacement.
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.decor.dimensionner(geo)
    s.humain.position.set(-(pageL / 2 + 0.6), 0, 0.3)
    s.decor.rayon.visible = !!s.modele
    if (!s.modele) return
    s.depart.copy(s.decor.poser(s.modele.racine, reglage))
    setZMin(-Math.round(s.depart.z * 100) / 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageL, pageH, geo.hauteurCible, reglage, charge])

  // Image de l'affiche avec son QR code, ou gabarit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scene3d.current?.decor.habiller(affiche, format), [affiche, format, pageL, pageH])

  // Cadrage : au chargement du modèle, au changement de point de départ ou de format d'affiche.
  useEffect(() => {
    cadrer(vue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, reglage.position, pageL, pageH])

  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.humain.visible = humain
    s.decor.grille.visible = grille
    if (poignees && s.modele) s.poignees.attach(s.modele.racine)
    else s.poignees.detach()
  }, [humain, grille, poignees, charge])

  const dims = dimsUnite && modele?.modeleUrl ? dimsUnite.clone().multiplyScalar(geo.hauteurCible * reglage.taille) : null
  const axe = (cle: keyof Decalage, libelle: string, positif: string, negatif: string, min: number) => (
    <label className="reglage-curseur">
      <span>
        {libelle} <b>{sens(decalage[cle], positif, negatif)}</b>
      </span>
      <input type="range" min={min} max={RAYON_AFFICHE_M} step={0.01} value={decalage[cle]} onChange={(e) => deplacer({ ...decalage, [cle]: Number(e.target.value) })} />
    </label>
  )

  return (
    <div className="placement-affiche">
      <ChoixAffiche
        liees={liees}
        autres={autres}
        affiche={affiche}
        onAffiche={setAfficheId}
        formatGabarit={formatGabarit}
        onFormatGabarit={setFormatGabarit}
        libelleLiees="Affiches qui utilisent cette animation"
      />
      <div className="vue-placement-affiche">
        <div className="atelier-canevas" ref={conteneur} role="img" aria-label="Aperçu 3D : l’affiche au mur et le modèle posé comme sur le téléphone du visiteur. Faites glisser les poignées pour déplacer le modèle." />
        <div className="atelier-outils-vue">
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
          <button type="button" className={poignees ? 'actif' : ''} aria-pressed={poignees} onClick={() => setPoignees(!poignees)} title="Poignées de déplacement sur le modèle" disabled={!dims}>
            Déplacer
          </button>
          <button type="button" className={humain ? 'actif' : ''} onClick={() => setHumain(!humain)} title="Silhouette de 1,75 m">
            Repère 1,75 m
          </button>
          <button type="button" className={grille ? 'actif' : ''} onClick={() => setGrille(!grille)}>
            Grille 1 m
          </button>
        </div>
        {dims && (
          <div className="atelier-dimensions" aria-live="polite">
            <strong>Modèle sur une affiche {format}</strong>
            <span>
              L {metres(dims.x)} · H {metres(dims.y)} · P {metres(dims.z)}
            </span>
            <small>
              {distance < 0.005 ? 'À sa position de départ' : `À ${metres(distance)} de sa position de départ`} · rayon de {RAYON_AFFICHE_M} m
            </small>
          </div>
        )}
        {(!modele?.modeleUrl || etatModele) && (
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
              'Choisissez un modèle 3D à l’étape 2 pour le voir sur l’affiche.'
            )}
          </p>
        )}
      </div>
      <div className="choix-type compact">
        {(['devant', 'dessus'] as const).map((p) => (
          <button key={p} type="button" className={reglage.position === p ? 'actif' : ''} aria-pressed={reglage.position === p} onClick={() => onChange({ ...reglage, position: p })}>
            <Icone nom={p === 'devant' ? 'affiche' : 'haut'} taille={18} />
            <strong>{p === 'devant' ? 'Devant l’affiche' : 'Au-dessus de l’affiche'}</strong>
            <small>{p === 'devant' ? 'Le modèle sort de l’affiche, face au visiteur' : 'Le modèle se pose sur le bord haut de l’affiche'}</small>
          </button>
        ))}
      </div>
      <label className="reglage-curseur">
        <span>
          Taille du modèle <b>{virgule(reglage.taille)} × la hauteur de l’affiche</b>
        </span>
        <input type="range" min={0.3} max={5} step={0.1} value={reglage.taille} onChange={(e) => onChange({ ...reglage, taille: Number(e.target.value) })} />
      </label>
      <fieldset className="deplacement-affiche">
        <legend>
          Déplacement autour de l’affiche <small>rayon de {RAYON_AFFICHE_M} m</small>
        </legend>
        {axe('x', 'Gauche / droite', 'à droite', 'à gauche', -RAYON_AFFICHE_M)}
        {axe('y', 'Bas / haut', 'plus haut', 'plus bas', -RAYON_AFFICHE_M)}
        {axe('z', 'Mur / visiteur', 'vers le visiteur', 'vers le mur', zMin)}
        <div className="pied-deplacement">
          <small className="aide-champ">
            {distance < 0.005 ? 'Le modèle est à sa position de départ.' : `À ${metres(distance)} de la position de départ, sur ${RAYON_AFFICHE_M} m possibles (le visiteur scanne l’affiche entre 0,5 et 3 m).`}
          </small>
          <button type="button" className="btn btn-texte" onClick={() => onChange({ ...reglage, decalage: { ...AUCUN_DECALAGE } })} disabled={distance < 0.005}>
            <Icone nom="relancer" taille={14} /> Remettre au départ
          </button>
        </div>
      </fieldset>
      <small className="aide-champ">
        Faites glisser les flèches du modèle dans la vue (ou les carrés pour un plan), tournez autour avec la souris, molette pour zoomer. Le modèle est posé comme sur le téléphone du visiteur, à l’échelle de l’affiche imprimée ; son
        orientation et son ancrage se règlent dans l’atelier 3D (étape 2).
      </small>
    </div>
  )
}
