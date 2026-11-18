// Atelier 3D : gestion complète d'un modèle GLB dans le back-office.
//  - Visionneuse orbitable, trois décors (vues face / côté / dessus dans chacun) :
//    · Studio (Three.js) : le modèle à une taille de référence (12 m pour un monument, 1,5 × une affiche
//      A3 pour une affiche), à côté d'une silhouette de 1,75 m ; grille d'1 m.
//    · Sur l'affiche (Three.js) : l'affiche imprimée (image et QR code, à son format) au mur, le modèle
//      posé comme dans l'application visiteur (devant ou au-dessus, taille en hauteurs d'affiche).
//    · Au monument (MapLibre) : carte satellite avec les bâtiments en relief, le modèle à son placement.
//    La taille réelle ne se règle pas ici mais au placement de l'animation (par rapport à l'affiche, ou
//    en mètres autour du monument) : un seul réglage de taille. Ouvert depuis le formulaire d'une
//    animation d'affiche, l'atelier modifie directement ce réglage (position et taille sur l'affiche).
//  - Réglages non destructifs (enregistrés en base, appliqués partout par Three.js) : rotation,
//    ancrage au sol ou au centre, décalage vertical, vitesse des animations, luminosité.
//  - Animations intégrées : choix du clip à prévisualiser, lecture / pause.
//  - Optimisation par le serveur (glTF-Transform) : textures, simplification, compression Meshopt ;
//    mesures avant / après, original conservé et restaurable.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { BUDGETS_3D, NOM_ANIMATION_COMBINEE, OPTIMISATION_DEFAUT, PLACEMENT_LIEU_DEFAUT, REGLAGE_AFFICHE_RA_DEFAUT, REGLAGES_3D_DEFAUT } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { enregistrerReglages3D, optimiserModele, restaurerModele, useEtat } from '../../commun/store'
import type { Animation, Fichier, Lieu, MesureModele, ParametresOptimisation, PlacementGps, ReglageAfficheRA, Reglages3D } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime, reglagesComplets, type Eclairage } from '../../visiteur/ra/contenu3d'
import { formaterPoids } from '../ui'
import { ChoixAffiche, useAffichesProposees } from './ChoixAffiche'
import type { ReglagesDirects } from './EditeurPlacement3D'
import { cadrerCamera, creerDecorAffiche, dimensionsAffiche, LIBELLES_VUES, libererScene, metres, silhouette, type DecorAffiche, type VueCamera } from './sceneApercu'

const ApercuMonument = lazy(() => import('./ApercuMonument'))

type Vue = VueCamera
type Decor = 'studio' | 'affiche' | 'monument'

/** Taille (plus grande dimension, en mètres) du modèle dans le studio, selon son usage. */
const TAILLE_REFERENCE = { LIEU: PLACEMENT_LIEU_DEFAUT.tailleM, AFFICHE: 0.42 * REGLAGE_AFFICHE_RA_DEFAUT.taille } as const

const virgule = (v: number) => String(v).replace('.', ',')
const egaux = (a: Reglages3D, b: Reglages3D) => JSON.stringify(a) === JSON.stringify(b)

/** Position d'une animation de lieu sans placement personnalisé (comme l'application visiteur). */
const placementDefaut = (l: Lieu): PlacementGps => ({ latitude: l.latitude, longitude: l.longitude, ...PLACEMENT_LIEU_DEFAUT })

/** Monument proposé pour l'aperçu : le placement d'une animation, ou la position par défaut du lieu. */
interface SituationMonument {
  cle: string
  lieu: Lieu
  placement: PlacementGps
  animation?: Animation
  /** Animation en cours d'édition (placement non encore enregistré). */
  edition?: boolean
}

export default function Atelier3D({
  fichier,
  animation,
  onReglageAffiche,
  onFermer,
}: {
  fichier: Fichier
  /** Animation en cours d'édition (atelier ouvert depuis son formulaire) : l'aperçu reprend son placement, même non enregistré. */
  animation?: Animation
  /** Modifie la position et la taille sur l'affiche de l'animation en cours d'édition. */
  onReglageAffiche?: (r: ReglageAfficheRA) => void
  onFermer: () => void
}) {
  const etat = useEtat()
  const initial = useMemo(() => reglagesComplets(fichier.reglages3d), [fichier.reglages3d])
  const [r, setR] = useState<Reglages3D>(initial)
  /** Dimensions du modèle ramené à 1 unité (plus grande dimension), réglages appliqués. */
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  /** Compteur de chargements du modèle (la scène est recréée après optimisation ou restauration). */
  const [charge, setCharge] = useState(0)
  const [clips, setClips] = useState<string[]>([])
  const [clip, setClip] = useState<number | null>(null)
  const [pause, setPause] = useState(false)
  const [humain, setHumain] = useState(true)
  const [grille, setGrille] = useState(true)
  const [vue, setVue] = useState<Vue>('perspective')
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState<'reglages' | 'optimisation' | 'restauration' | null>(null)
  const [opt, setOpt] = useState<ParametresOptimisation>(fichier.optimisation?.parametres ?? { ...OPTIMISATION_DEFAUT })

  /** Situation de l'animation : affiche ou monument. Le formulaire d'animation ouvre directement sur elle. */
  const situationType: 'affiche' | 'monument' = (animation?.type ?? fichier.usage) === 'AFFICHE' ? 'affiche' : 'monument'
  const [decor, setDecor] = useState<Decor>(animation ? situationType : 'studio')
  /** Demande de cadrage transmise à la carte du monument. */
  const [cadrage, setCadrage] = useState(0)

  // ------------------------------------------------------------ affiches et monuments proposés
  const animationsModele = useMemo(() => etat.animations.filter((x) => x.modeleId === fichier.id && x.id !== animation?.id), [etat.animations, fichier.id, animation?.id])

  /** Affiches avec image : d'abord celles dont l'animation utilise ce modèle. */
  const { liees: affichesLiees, autres: autresAffiches } = useAffichesProposees([...animationsModele.map((x) => x.id), animation?.id])
  const [afficheId, setAfficheId] = useState(() => affichesLiees[0]?.id ?? '')
  const [formatGabarit, setFormatGabarit] = useState('A3')
  const affiche = affichesLiees.find((x) => x.id === afficheId) ?? autresAffiches.find((x) => x.id === afficheId)
  const geoAffiche = dimensionsAffiche(affiche, formatGabarit)
  const { format, pageL: largeurAffiche, pageH: hauteurAffiche, hauteurCible } = geoAffiche

  // Réglage sur l'affiche : celui de l'animation en cours d'édition, sinon de l'animation de l'affiche
  // choisie (si elle utilise ce modèle), sinon d'une animation d'affiche qui utilise ce modèle.
  const animationAffiche =
    animation?.type === 'AFFICHE' ? animation : (animationsModele.find((x) => x.id === affiche?.animationAfficheId) ?? animationsModele.find((x) => x.type === 'AFFICHE'))
  const reglageAffiche = animationAffiche?.reglageAffiche ?? REGLAGE_AFFICHE_RA_DEFAUT
  const reglageModifiable = !!onReglageAffiche && animation?.type === 'AFFICHE'

  const situations = useMemo(() => {
    const liste: SituationMonument[] = []
    const depuis = (x: Animation, edition: boolean) => {
      const lieu = etat.lieux.find((l) => l.id === x.lieuId)
      if (lieu) liste.push({ cle: edition ? 'edition' : x.id, lieu, placement: x.placement ?? placementDefaut(lieu), animation: x, edition })
    }
    if (animation?.type === 'LIEU') depuis(animation, true)
    for (const x of animationsModele) if (x.type === 'LIEU') depuis(x, false)
    for (const l of etat.lieux) liste.push({ cle: `lieu:${l.id}`, lieu: l, placement: placementDefaut(l) })
    return liste
  }, [etat.lieux, animationsModele, animation])
  const [situationCle, setSituationCle] = useState(() => situations[0]?.cle ?? '')
  const situation = situations.find((s) => s.cle === situationCle) ?? situations[0]

  /** Échelle du modèle (plus grande dimension, en mètres) dans le décor affiché. */
  const echelle = decor === 'monument' ? (situation?.placement.tailleM ?? TAILLE_REFERENCE.LIEU) : decor === 'affiche' ? hauteurCible * reglageAffiche.taille : TAILLE_REFERENCE[fichier.usage]
  const dims = dimsUnite ? dimsUnite.clone().multiplyScalar(echelle) : null

  // ------------------------------------------------------------ scène Three.js (studio et affiche)
  const conteneur = useRef<HTMLDivElement>(null)
  const scene3d = useRef<{
    modele: ModeleAnime | null
    eclairage: Eclairage
    camera: THREE.PerspectiveCamera
    controles: OrbitControls
    humain: THREE.Object3D
    grille: THREE.Object3D
    decor: DecorAffiche
  } | null>(null)
  const reglagesRef = useRef(r)
  reglagesRef.current = r
  const clipRef = useRef(clip)
  clipRef.current = clip
  const pauseRef = useRef(pause)
  pauseRef.current = pause
  const decorRef = useRef(decor)
  decorRef.current = decor
  /** Réglages lus à chaque image par la carte du monument. */
  const lireDirect = useCallback((): ReglagesDirects => ({ reglages: reglagesRef.current, clip: clipRef.current, pause: pauseRef.current }), [])

  const modifie = !egaux(r, initial)
  const budget = BUDGETS_3D[fichier.usage]
  const maj = (p: Partial<Reglages3D>) => setR((x) => ({ ...x, ...p }))
  const majRotation = (axe: 'x' | 'y' | 'z', v: number) => setR((x) => ({ ...x, rotation: { ...x.rotation, [axe]: ((((v + 180) % 360) + 360) % 360) - 180 } }))

  /** Cadre la caméra sur le modèle (et l'affiche, ou la silhouette) selon la vue demandée. */
  function cadrer(v: Vue) {
    if (decor === 'monument') return setCadrage((n) => n + 1)
    const s = scene3d.current
    if (!s?.modele) return
    const boite = s.modele.boiteMonde()
    if (decor === 'affiche') boite.expandByObject(s.decor.affiche)
    else boite.expandByPoint(new THREE.Vector3(0, 0, 0)).expandByPoint(new THREE.Vector3(0, 1.75, 0))
    cadrerCamera(s.camera, s.controles, boite, v, decor === 'affiche' ? 0.5 : 1.8)
  }

  // Scène Three.js : créée une fois par fichier.
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
    const grilleObj = new THREE.GridHelper(40, 40, 0x7b1e2e, 0xbdb6a8)
    const humainObj = silhouette()
    humainObj.position.x = -1.2

    // Décor « sur l'affiche » (masqué dans le studio).
    const decorAffiche = creerDecorAffiche()
    decorAffiche.groupe.visible = false
    scene.add(grilleObj, humainObj, decorAffiche.groupe)
    scene3d.current = { modele: null, eclairage, camera, controles, humain: humainObj, grille: grilleObj, decor: decorAffiche }
    let annule = false

    chargerGlb(fichier.url, renderer)
      .then((gltf) => {
        if (annule) return
        const modele = new ModeleAnime(gltf, { reglages3d: reglagesRef.current })
        modele.racine.scale.setScalar(TAILLE_REFERENCE[fichier.usage])
        scene.add(modele.racine)
        modele.lancer()
        modele.choisirClip(clipRef.current)
        modele.pause(pauseRef.current)
        scene3d.current!.modele = modele
        eclairage.regler(reglagesRef.current.luminosite)
        setClips(modele.clips)
        setDimsUnite(modele.dimensions())
        setCharge((n) => n + 1)
      })
      .catch((e: Error) => !annule && setErreur(`Modèle illisible : ${e.message}`))

    let precedent = performance.now()
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - precedent) / 1000)
      precedent = t
      // Au monument, la carte prend le relais : la scène du studio n'est plus dessinée.
      if (decorRef.current === 'monument') return
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
      annule = true
      renderer.setAnimationLoop(null)
      observateur.disconnect()
      controles.dispose()
      scene3d.current?.modele?.liberer()
      eclairage.liberer()
      libererScene(scene)
      renderer.dispose()
      renderer.domElement.remove()
      scene3d.current = null
    }
    // La scène est recréée quand le fichier change (après optimisation ou restauration).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichier.url])

  // Réglages appliqués en direct.
  useEffect(() => {
    const s = scene3d.current
    if (!s?.modele) return
    s.modele.appliquerReglages(r)
    s.eclairage.regler(r.luminosite)
    setDimsUnite(s.modele.dimensions())
  }, [r])

  // Décor : affiche à son format au mur, modèle posé comme dans l'application visiteur.
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    const surAffiche = decor === 'affiche'
    s.decor.groupe.visible = surAffiche
    s.decor.dimensionner(geoAffiche)
    s.humain.position.set(surAffiche ? -(largeurAffiche / 2 + 0.6) : -1.2, 0, surAffiche ? 0.3 : 0)
    const racine = s.modele?.racine
    if (!racine) return
    if (surAffiche) s.decor.poser(racine, reglageAffiche)
    else {
      racine.position.set(0, 0, 0)
      racine.quaternion.identity()
      racine.scale.setScalar(TAILLE_REFERENCE[fichier.usage])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decor, largeurAffiche, hauteurAffiche, hauteurCible, reglageAffiche, charge, fichier.usage])

  // Cadrage au chargement du modèle et au changement de décor (la carte du monument se cadre seule).
  useEffect(() => {
    if (charge && decor !== 'monument') cadrer(vue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decor, charge])

  // Image de l'affiche choisie (avec son QR code), recadrée à son format d'impression ; gabarit sinon.
  useEffect(() => {
    if (decor === 'affiche') return scene3d.current?.decor.habiller(affiche, format)
  }, [decor, fichier.url, affiche, format, largeurAffiche, hauteurAffiche])

  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.humain.visible = humain
    s.grille.visible = grille && decor !== 'affiche'
    s.decor.grille.visible = grille
  }, [humain, grille, decor, fichier.url])
  useEffect(() => scene3d.current?.modele?.choisirClip(clip), [clip])
  useEffect(() => scene3d.current?.modele?.pause(pause), [pause])

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFermer])

  async function executer(type: NonNullable<typeof envoi>, action: () => Promise<unknown>, succes: string) {
    setEnvoi(type)
    setErreur(null)
    setMessage(null)
    try {
      await action()
      setMessage(succes)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  const o = fichier.optimisation
  const curseur = (libelle: string, valeur: number, min: number, max: number, pas: number, onChange: (v: number) => void, affichage: string) => (
    <label className="reglage-curseur">
      <span>
        {libelle} <b>{affichage}</b>
      </span>
      <input type="range" min={min} max={max} step={pas} value={valeur} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
  const libelleDecor = { studio: 'Studio', affiche: 'Sur l’affiche', monument: 'Au monument' } as const
  const libelleSituation = (s: SituationMonument) => (s.edition ? `${s.lieu.nom} — cette animation` : s.animation ? `${s.lieu.nom} — « ${s.animation.titre} »` : s.lieu.nom)

  return createPortal(
    <div className="atelier-3d" role="dialog" aria-modal="true" aria-label={`Atelier 3D — ${fichier.nomOriginal}`}>
      <header className="atelier-tete">
        <div>
          <h2>
            <Icone nom="cube" taille={20} /> Atelier 3D
          </h2>
          <p>
            {fichier.nomOriginal} · {fichier.usage === 'LIEU' ? 'animation de lieu' : 'animation d’affiche'}
          </p>
        </div>
        <div className="atelier-actions">
          <button type="button" className="btn btn-fantome" onClick={() => setR({ ...REGLAGES_3D_DEFAUT, rotation: { ...REGLAGES_3D_DEFAUT.rotation } })} disabled={egaux(r, reglagesComplets())}>
            Réinitialiser
          </button>
          <button type="button" className="btn btn-secondaire" onClick={() => setR(initial)} disabled={!modifie}>
            Annuler les modifications
          </button>
          <button type="button" className="btn btn-primaire" disabled={!modifie || !!envoi} onClick={() => executer('reglages', () => enregistrerReglages3D(fichier.id, r), 'Réglages enregistrés : ils s’appliquent à toutes les animations qui utilisent ce modèle.')}>
            {envoi === 'reglages' ? <span className="spinner" /> : <Icone nom="check" taille={15} />} Enregistrer
          </button>
          <button type="button" className="bo-icone" onClick={onFermer} aria-label="Fermer l’atelier">
            <Icone nom="fermer" taille={18} />
          </button>
        </div>
      </header>

      <div className="atelier-corps">
        <section className="atelier-vue">
          <div className="atelier-canevas" ref={conteneur} />
          {decor === 'monument' &&
            (situation ? (
              <Suspense
                fallback={
                  <div className="atelier-chargement">
                    <span className="spinner" /> Chargement de la carte…
                  </div>
                }
              >
                <ApercuMonument key={situation.lieu.id} modeleUrl={fichier.url} lieu={situation.lieu} placement={situation.placement} lireDirect={lireDirect} vue={vue} cadrage={cadrage} />
              </Suspense>
            ) : (
              <div className="atelier-chargement">Aucun monument enregistré : créez d’abord un lieu.</div>
            ))}
          <div className="atelier-outils-vue">
            <div className="choix-decor" role="group" aria-label="Décor de l’aperçu">
              {(['studio', situationType] as const).map((d) => (
                <button key={d} type="button" className={decor === d ? 'actif' : ''} aria-pressed={decor === d} onClick={() => setDecor(d)}>
                  <Icone nom={d === 'studio' ? 'cube' : d === 'affiche' ? 'affiche' : 'pin'} taille={14} /> {libelleDecor[d]}
                </button>
              ))}
            </div>
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
            {decor !== 'monument' && (
              <>
                <span className="separateur" />
                <button type="button" className={humain ? 'actif' : ''} onClick={() => setHumain(!humain)} title="Silhouette de 1,75 m">
                  Repère 1,75 m
                </button>
                <button type="button" className={grille ? 'actif' : ''} onClick={() => setGrille(!grille)}>
                  Grille 1 m
                </button>
              </>
            )}
          </div>
          {dims && (
            <div className="atelier-dimensions" aria-live="polite">
              <strong>{decor === 'studio' ? 'Taille de référence pour l’aperçu' : decor === 'affiche' ? `Taille sur une affiche ${format}` : 'Taille au monument'}</strong>
              <span>
                L {metres(dims.x)} · H {metres(dims.y)} · P {metres(dims.z)}
              </span>
              <small>
                {decor === 'monument'
                  ? 'La position, la hauteur et la taille se règlent au placement de l’animation, sur la carte.'
                  : decor === 'affiche'
                    ? reglageModifiable
                      ? 'Position et taille sur l’affiche : panneau « Aperçu sur l’affiche ».'
                      : 'La position et la taille se règlent dans l’animation, par rapport à la hauteur de l’affiche.'
                    : fichier.usage === 'LIEU'
                      ? 'La taille réelle se règle en mètres au placement de l’animation autour du monument.'
                      : 'La taille réelle se règle dans l’animation, par rapport à la hauteur de l’affiche.'}
              </small>
            </div>
          )}
          {clips.length > 0 && (
            <div className="atelier-lecture">
              <button type="button" className="bo-icone" onClick={() => setPause(!pause)} aria-label={pause ? 'Lire' : 'Pause'}>
                <Icone nom={pause ? 'lecture' : 'pause'} taille={16} />
              </button>
              <select value={clip ?? ''} onChange={(e) => setClip(e.target.value === '' ? null : Number(e.target.value))} aria-label="Animation à prévisualiser">
                <option value="">Toutes les animations</option>
                {clips.map((c, i) =>
                  // L'animation combinée (ajoutée pour <model-viewer>) double « Toutes les animations ».
                  c === NOM_ANIMATION_COMBINEE ? null : (
                    <option key={`${i}-${c}`} value={i}>
                      {c || `Animation ${i + 1}`}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
          {!dims && !erreur && decor !== 'monument' && (
            <div className="atelier-chargement">
              <span className="spinner" /> Chargement du modèle…
            </div>
          )}
        </section>

        <aside className="atelier-panneau">
          {(erreur || message) && (
            <p className={erreur ? 'erreur-acces' : 'note-ok'} role={erreur ? 'alert' : 'status'}>
              <Icone nom={erreur ? 'alerte' : 'check'} taille={15} />
              {erreur ?? message}
            </p>
          )}

          {decor === 'affiche' && (
            <fieldset>
              <legend>Aperçu sur l’affiche</legend>
              <ChoixAffiche liees={affichesLiees} autres={autresAffiches} affiche={affiche} onAffiche={setAfficheId} formatGabarit={formatGabarit} onFormatGabarit={setFormatGabarit} />
              {reglageModifiable ? (
                <>
                  <div className="choix-segment" role="group" aria-label="Position du modèle sur l’affiche">
                    <span>Position</span>
                    {(['devant', 'dessus'] as const).map((p) => (
                      <button key={p} type="button" className={reglageAffiche.position === p ? 'actif' : ''} aria-pressed={reglageAffiche.position === p} onClick={() => onReglageAffiche!({ ...reglageAffiche, position: p })}>
                        {p === 'devant' ? 'Devant l’affiche' : 'Au-dessus'}
                      </button>
                    ))}
                  </div>
                  {curseur('Taille du modèle', reglageAffiche.taille, 0.3, 5, 0.1, (v) => onReglageAffiche!({ ...reglageAffiche, taille: v }), `${virgule(reglageAffiche.taille)} × la hauteur`)}
                  <small className="aide-champ">Réglage de l’animation (étape 3) : il est conservé quand vous enregistrez l’animation.</small>
                </>
              ) : (
                <p className="resume-situation">
                  <span>
                    {reglageAffiche.position === 'devant' ? 'Devant l’affiche' : 'Au-dessus de l’affiche'}, {virgule(reglageAffiche.taille)} × sa hauteur
                    {reglageAffiche.decalage && Math.hypot(reglageAffiche.decalage.x, reglageAffiche.decalage.y, reglageAffiche.decalage.z) >= 0.005
                      ? `, déplacé de ${metres(Math.hypot(reglageAffiche.decalage.x, reglageAffiche.decalage.y, reglageAffiche.decalage.z))}`
                      : ''}
                  </span>
                  <small>
                    {animationAffiche
                      ? `Réglage de l’animation « ${animationAffiche.titre} », modifiable dans son formulaire (étape 3).`
                      : 'Réglage par défaut : la position et la taille se choisissent dans le formulaire de l’animation.'}
                  </small>
                </p>
              )}
            </fieldset>
          )}

          {decor === 'monument' && situation && (
            <fieldset>
              <legend>Aperçu au monument</legend>
              <label className="champ">
                <span className="etiquette">Monument</span>
                <select value={situation.cle} onChange={(e) => setSituationCle(e.target.value)}>
                  {situations.some((s) => s.animation) && (
                    <optgroup label="Placement d’une animation">
                      {situations
                        .filter((s) => s.animation)
                        .map((s) => (
                          <option key={s.cle} value={s.cle}>
                            {libelleSituation(s)}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <optgroup label="Position par défaut du lieu">
                    {situations
                      .filter((s) => !s.animation)
                      .map((s) => (
                        <option key={s.cle} value={s.cle}>
                          {libelleSituation(s)}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
              <p className="resume-situation">
                <span>
                  {virgule(situation.placement.tailleM)} m de taille · socle à {virgule(situation.placement.hauteurM)} m du sol ·{' '}
                  {situation.placement.orientationDeg === undefined ? 'face au visiteur' : `orienté à ${situation.placement.orientationDeg}°`}
                </span>
                <small>
                  {situation.edition
                    ? 'Placement de l’animation en cours (étape 3 du formulaire), même non enregistré.'
                    : situation.animation
                      ? `Placement de l’animation « ${situation.animation.titre} », modifiable dans son formulaire (étape 3).`
                      : 'Position par défaut : au-dessus du point du lieu, face au visiteur.'}
                </small>
              </p>
            </fieldset>
          )}

          <fieldset>
            <legend>Position du modèle</legend>
            {curseur('Décalage vertical', r.hauteur, -1, 1, 0.01, (v) => maj({ hauteur: v }), `${Math.round(r.hauteur * 100)} % de la taille`)}
            <div className="choix-segment" role="group" aria-label="Ancrage">
              <span>Point d’ancrage</span>
              {(['sol', 'centre'] as const).map((a) => (
                <button key={a} type="button" className={r.ancrage === a ? 'actif' : ''} onClick={() => maj({ ancrage: a })}>
                  {a === 'sol' ? 'Posé au sol' : 'Centre du modèle'}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Orientation</legend>
            {(['x', 'y', 'z'] as const).map((axe) => (
              <div key={axe} className="reglage-rotation">
                {curseur({ x: 'Inclinaison (X)', y: 'Rotation (Y)', z: 'Roulis (Z)' }[axe], r.rotation[axe], -180, 180, 1, (v) => majRotation(axe, v), `${r.rotation[axe]}°`)}
                <div className="boutons-rapides">
                  <button type="button" onClick={() => majRotation(axe, r.rotation[axe] - 90)} aria-label={`−90° sur ${axe}`}>
                    −90°
                  </button>
                  <button type="button" onClick={() => majRotation(axe, r.rotation[axe] + 90)} aria-label={`+90° sur ${axe}`}>
                    +90°
                  </button>
                </div>
              </div>
            ))}
            <small className="aide-champ">Un modèle exporté couché se redresse souvent avec −90° en X. La face avant regarde le visiteur (axe +Z).</small>
          </fieldset>

          <fieldset>
            <legend>Animation et lumière</legend>
            {curseur('Vitesse des animations', r.vitesse, 0.1, 4, 0.05, (v) => maj({ vitesse: v }), `× ${r.vitesse.toFixed(2).replace('.', ',')}`)}
            {curseur('Luminosité', r.luminosite, 0.1, 4, 0.05, (v) => maj({ luminosite: v }), `× ${r.luminosite.toFixed(2).replace('.', ',')}`)}
          </fieldset>

          <fieldset>
            <legend>Fichier et optimisation</legend>
            <ul className="mesures-modele">
              <Mesure libelle="Poids" valeur={formaterPoids(fichier.tailleOctets)} ok={fichier.tailleOctets <= budget.poidsMo * 1_000_000} />
              <Mesure libelle="Triangles" valeur={`${(fichier.nbTriangles ?? 0).toLocaleString('fr-FR')} / ${budget.triangles.toLocaleString('fr-FR')}`} ok={(fichier.nbTriangles ?? 0) <= budget.triangles} />
              <Mesure libelle="Textures" valeur={`${fichier.textureMaxPx ?? 0} px / ${budget.texturePx} px`} ok={(fichier.textureMaxPx ?? 0) <= budget.texturePx} />
              <Mesure libelle="Animations" valeur={String(fichier.clips?.length ?? 0)} ok />
            </ul>
            <label className="champ">
              <span className="etiquette">Textures</span>
              <select value={opt.textureMaxPx ?? ''} onChange={(e) => setOpt({ ...opt, textureMaxPx: e.target.value ? (Number(e.target.value) as ParametresOptimisation['textureMaxPx']) : null })}>
                <option value="">Taille conservée</option>
                {[2048, 1024, 512, 256].map((t) => (
                  <option key={t} value={t}>
                    {t} px maximum{t === budget.texturePx ? ' (budget)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="case">
              <input type="checkbox" checked={opt.webp} onChange={(e) => setOpt({ ...opt, webp: e.target.checked })} />
              Textures en WebP (plus légères)
            </label>
            {curseur('Simplification de la géométrie', opt.simplification, 0, 0.9, 0.05, (v) => setOpt({ ...opt, simplification: v }), opt.simplification ? `−${Math.round(opt.simplification * 100)} % de triangles` : 'aucune')}
            <label className="case">
              <input type="checkbox" checked={opt.compression} onChange={(e) => setOpt({ ...opt, compression: e.target.checked })} />
              Compression de la géométrie (Meshopt)
            </label>
            <button type="button" className="btn btn-primaire btn-bloc" disabled={!!envoi || o?.etat === 'EN_COURS'} onClick={() => executer('optimisation', () => optimiserModele(fichier.id, opt), 'Modèle optimisé. Vérifiez l’aperçu : l’original reste disponible.')}>
              {envoi === 'optimisation' || o?.etat === 'EN_COURS' ? (
                <>
                  <span className="spinner" /> Optimisation en cours…
                </>
              ) : (
                <>
                  <Icone nom="reglages" taille={15} /> Optimiser le modèle
                </>
              )}
            </button>
            {o?.etat === 'TERMINEE' && o.apres && <Comparaison avant={o.avant} apres={o.apres} />}
            {o?.etat === 'ECHEC' && (
              <p className="erreur-acces">
                <Icone nom="alerte" taille={15} /> Dernière optimisation échouée : {o.erreur}
              </p>
            )}
            {fichier.aOriginal && (
              <button type="button" className="btn btn-texte btn-bloc" disabled={!!envoi} onClick={() => executer('restauration', () => restaurerModele(fichier.id), 'Modèle d’origine restauré.')}>
                Restaurer le modèle d’origine
              </button>
            )}
            <small className="aide-champ">
              Le serveur nettoie le fichier, puis applique ces options avec glTF-Transform. La simplification peut abîmer les modèles animés par os : vérifiez l’aperçu.
            </small>
          </fieldset>
        </aside>
      </div>
    </div>,
    document.body,
  )
}

function Mesure({ libelle, valeur, ok }: { libelle: string; valeur: string; ok: boolean }) {
  return (
    <li className={ok ? 'ok' : 'ko'}>
      <Icone nom={ok ? 'check' : 'alerte'} taille={13} />
      <span>{libelle}</span>
      <b>{valeur}</b>
    </li>
  )
}

function Comparaison({ avant, apres }: { avant: MesureModele; apres: MesureModele }) {
  const gain = (a: number, b: number) => (a > 0 ? Math.round((1 - b / a) * 100) : 0)
  return (
    <table className="comparaison-optimisation">
      <thead>
        <tr>
          <th />
          <th>Original</th>
          <th>Optimisé</th>
          <th>Gain</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Poids</th>
          <td>{formaterPoids(avant.octets)}</td>
          <td>{formaterPoids(apres.octets)}</td>
          <td>−{gain(avant.octets, apres.octets)} %</td>
        </tr>
        <tr>
          <th>Triangles</th>
          <td>{avant.triangles.toLocaleString('fr-FR')}</td>
          <td>{apres.triangles.toLocaleString('fr-FR')}</td>
          <td>−{gain(avant.triangles, apres.triangles)} %</td>
        </tr>
        <tr>
          <th>Textures</th>
          <td>{avant.texturePx} px</td>
          <td>{apres.texturePx} px</td>
          <td />
        </tr>
      </tbody>
    </table>
  )
}
