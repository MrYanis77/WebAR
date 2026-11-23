// Atelier 3D d'un fichier (page « Fichiers 3D & sons ») : les mêmes outils que dans la création d'affiche
// et de monument — Position, Rotation, Taille, Rendu, Fichier — dans trois vues :
//  · Studio : le modèle seul, à une taille de référence (12 m pour un monument, 1,5 × une affiche A3),
//    à côté d'une silhouette de 1,75 m ; on le redresse, on règle son rendu, on l'allège.
//  · Sur une affiche : l'atelier de l'affiche, pour une animation qui utilise ce modèle (position, taille).
//  · Au monument : l'atelier du monument, pour une animation de monument qui utilise ce modèle.
// La rotation et le rendu sont des réglages du fichier (toutes ses animations) ; la position et la taille
// appartiennent à chaque animation. « Enregistrer » enregistre les deux.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { NOM_ANIMATION_COMBINEE, PLACEMENT_LIEU_DEFAUT, REGLAGE_AFFICHE_RA_DEFAUT } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { enregistrerAnimation, useEtat } from '../../commun/store'
import type { Animation, Fichier, Reglages3D } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime, type Eclairage } from '../../visiteur/ra/contenu3d'
import { useSession } from '../session'
import { maintenantLocal } from '../ui'
import { normaliserAngle, OngletsOutils, SectionFichier, SectionRendu, SectionRotation, TitreOutil, useReglagesModele, type Outil } from './atelier/OutilsAtelier'
import { cadrerCamera, LIBELLES_VUES, libererScene, metres, silhouette, type VueCamera } from './sceneApercu'

const AtelierAffiche = lazy(() => import('./atelier/AtelierAffiche'))
const AtelierMonument = lazy(() => import('./atelier/AtelierMonument'))

type Decor = 'studio' | 'affiche' | 'monument'
const RAD = Math.PI / 180

/** Taille (plus grande dimension, en mètres) du modèle dans le studio, selon son usage. */
const TAILLE_REFERENCE = { LIEU: PLACEMENT_LIEU_DEFAUT.tailleM, AFFICHE: 0.42 * REGLAGE_AFFICHE_RA_DEFAUT.taille } as const

const LIBELLES_DECORS: Record<Decor, { libelle: string; icone: 'cube' | 'affiche' | 'pin' }> = {
  studio: { libelle: 'Studio', icone: 'cube' },
  affiche: { libelle: 'Sur une affiche', icone: 'affiche' },
  monument: { libelle: 'Au monument', icone: 'pin' },
}

export default function Atelier3D({ fichier, onFermer }: { fichier: Fichier; onFermer: () => void }) {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  const modele = useReglagesModele(fichier)
  const [decor, setDecor] = useState<Decor>(fichier.usage === 'LIEU' ? 'monument' : 'affiche')
  const [outil, setOutil] = useState<Outil>('rotation')
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null)

  // ------------------------------------------------------------ animations qui utilisent ce modèle
  const animations = useMemo(() => etat.animations.filter((x) => x.modeleId === fichier.id), [etat.animations, fichier.id])
  const modifiable = (x: Animation) => (agent || x.proprietaireId === session.partenaireId) && x.statut !== 'SUSPENDUE' && x.statut !== 'RETIREE'
  /** Placements modifiés dans l'atelier, par animation (enregistrés avec « Enregistrer »). */
  const [brouillons, setBrouillons] = useState<Record<string, Animation>>({})
  const version = (x: Animation) => brouillons[x.id] ?? x
  /** Animation fictive pour l'aperçu quand aucune animation n'utilise le modèle (rien n'est enregistré). */
  const apercuVide = (type: Animation['type'], lieuId?: string): Animation => ({
    id: '',
    proprietaireId: '',
    titre: 'Aperçu',
    type,
    lieuId,
    modeleId: fichier.id,
    declencheur: type === 'AFFICHE' ? 'AFFICHE' : 'MONUMENT',
    dureeS: 15,
    debut: maintenantLocal(),
    statut: 'BROUILLON',
    transcription: { fr: '', en: '', de: '' },
    lancements: 0,
    modifieLe: maintenantLocal(),
  })

  // Sur une affiche : animations d'affiche d'abord, puis animations de monument (elles peuvent sortir d'une affiche).
  const surAffiche = [...animations.filter((x) => x.type === 'AFFICHE'), ...animations.filter((x) => x.type === 'LIEU')]
  const [afficheAnimId, setAfficheAnimId] = useState(() => surAffiche[0]?.id ?? '')
  const [apercuAffiche, setApercuAffiche] = useState(() => apercuVide('AFFICHE'))
  const animAffiche = surAffiche.find((x) => x.id === afficheAnimId)
  const courantAffiche = animAffiche ? version(animAffiche) : apercuAffiche

  // Au monument : animations de monument, ou position par défaut d'un lieu.
  const auMonument = animations.filter((x) => x.type === 'LIEU' && etat.lieux.some((l) => l.id === x.lieuId))
  const [monumentCle, setMonumentCle] = useState(() => auMonument[0]?.id ?? (etat.lieux[0] ? `lieu:${etat.lieux[0].id}` : ''))
  const animMonument = auMonument.find((x) => x.id === monumentCle)
  const lieuApercu = monumentCle.startsWith('lieu:') ? monumentCle.slice(5) : undefined
  const [apercusMonument, setApercusMonument] = useState<Record<string, Animation>>({})
  const courantMonument = animMonument ? version(animMonument) : lieuApercu ? (apercusMonument[lieuApercu] ?? apercuVide('LIEU', lieuApercu)) : undefined
  const lieuMonument = etat.lieux.find((l) => l.id === courantMonument?.lieuId)

  /** Modifie l'animation montrée (brouillon) ; sans animation, l'aperçu seulement. */
  function majAnimation(cible: Animation | undefined, p: Partial<Animation>) {
    if (!cible?.id) {
      if (decor === 'affiche') setApercuAffiche((x) => ({ ...x, ...p }))
      else if (lieuApercu) setApercusMonument((m) => ({ ...m, [lieuApercu]: { ...(m[lieuApercu] ?? apercuVide('LIEU', lieuApercu)), ...p } }))
      return
    }
    if (!modifiable(cible)) return
    setBrouillons((b) => ({ ...b, [cible.id]: { ...version(cible), ...p } }))
  }

  const nbModifiees = Object.keys(brouillons).length
  const modifie = modele.modifie || nbModifiees > 0
  const modeleVerrouille = !agent && fichier.proprietaireId !== session.partenaireId

  async function enregistrer() {
    setEnvoi(true)
    setRetour(null)
    try {
      if (!modeleVerrouille) await modele.enregistrer()
      for (const b of Object.values(brouillons)) await enregistrerAnimation(b, false)
      setBrouillons({})
      setRetour({ ok: true, texte: `Enregistré${nbModifiees ? ` : réglages du modèle et ${nbModifiees} animation${nbModifiees > 1 ? 's' : ''}` : ' : les réglages du modèle valent pour toutes ses animations'}.` })
    } catch (e) {
      setRetour({ ok: false, texte: messageErreur(e) })
    } finally {
      setEnvoi(false)
    }
  }

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFermer])

  const libelleAnim = (x: Animation) => {
    const lieu = etat.lieux.find((l) => l.id === x.lieuId)
    return `${x.titre}${x.type === 'LIEU' ? ` — ${lieu?.nomCourt ?? 'monument'}` : ''}${brouillons[x.id] ? ' (modifiée)' : ''}${modifiable(x) ? '' : ' (lecture seule)'}`
  }
  const noteAnimation = (x: Animation | undefined) =>
    !x?.id ? (
      <p className="note-partage">
        <Icone nom="info" taille={14} /> Aperçu seulement : aucune animation {decor === 'affiche' ? 'd’affiche' : 'de ce monument'} n’utilise ce modèle, la position et la taille ne sont pas enregistrées.
      </p>
    ) : !modifiable(x) ? (
      <p className="note-partage">
        <Icone nom="cadenas" taille={14} /> Animation d’un autre compte ou suspendue : position et taille en lecture seule.
      </p>
    ) : (
      <p className="note-partage">
        <Icone nom="info" taille={14} /> La position et la taille sont celles de cette animation ; rotation et rendu valent pour tout le modèle.
      </p>
    )

  return createPortal(
    <div className="atelier-3d" role="dialog" aria-modal="true" aria-label={`Atelier 3D — ${fichier.nomOriginal}`}>
      <header className="atelier-tete">
        <div>
          <h2>
            <Icone nom="cube" taille={20} /> Atelier 3D
          </h2>
          <p>
            {fichier.nomOriginal} · {fichier.usage === 'LIEU' ? 'animation de monument' : 'animation d’affiche'}
            {animations.length ? ` · ${animations.length} animation${animations.length > 1 ? 's' : ''}` : ' · aucune animation'}
          </p>
        </div>
        <div className="choix-decor-atelier" role="tablist" aria-label="Vue de l’atelier">
          {(['studio', 'affiche', 'monument'] as const).map((d) => (
            <button key={d} type="button" role="tab" aria-selected={decor === d} className={decor === d ? 'actif' : ''} onClick={() => setDecor(d)} disabled={d === 'monument' && !etat.lieux.length}>
              <Icone nom={LIBELLES_DECORS[d].icone} taille={15} /> {LIBELLES_DECORS[d].libelle}
            </button>
          ))}
        </div>
        <div className="atelier-actions">
          {retour && (
            <span className={`retour-atelier ${retour.ok ? 'ok' : 'ko'}`} role={retour.ok ? 'status' : 'alert'}>
              <Icone nom={retour.ok ? 'check' : 'alerte'} taille={14} /> {retour.texte}
            </span>
          )}
          <button
            type="button"
            className="btn btn-fantome"
            onClick={() => {
              modele.annuler()
              setBrouillons({})
            }}
            disabled={!modifie || envoi}
          >
            Annuler les modifications
          </button>
          <button type="button" className="btn btn-primaire" disabled={!modifie || envoi} onClick={() => void enregistrer()}>
            {envoi ? <span className="spinner" /> : <Icone nom="check" taille={15} />} Enregistrer
          </button>
          <button type="button" className="bo-icone" onClick={onFermer} aria-label="Fermer l’atelier">
            <Icone nom="fermer" taille={18} />
          </button>
        </div>
      </header>

      <div className="atelier-corps-modal">
        <Suspense
          fallback={
            <div className="atelier-chargement">
              <span className="spinner" /> Chargement…
            </div>
          }
        >
          {decor === 'studio' && (
            <div className="atelier-integre">
              <div className="atelier-integre-vue">
                <VueStudio fichier={fichier} reglages3d={modele.reglages} outil={outil} onRotation={(rotation) => !modeleVerrouille && modele.setReglages({ ...modele.reglages, rotation })} desactive={modeleVerrouille} />
              </div>
              <aside className="panneau-atelier">
                <OngletsOutils outil={outil} onOutil={setOutil} outils={['position', 'rotation', 'taille', 'rendu', 'fichier']} />
                <div className="contenu-outil" role="tabpanel">
                  {(outil === 'position' || outil === 'taille') && (
                    <div className="section-outil">
                      <TitreOutil
                        titre={outil === 'position' ? 'Position du modèle' : 'Taille du modèle'}
                        consigne={`${outil === 'position' ? 'La position' : 'La taille'} dépend de l’endroit où le modèle apparaît : réglez-la sur l’affiche ou au monument.`}
                      />
                      <div className="boutons-decor">
                        <button type="button" className="btn btn-secondaire" onClick={() => setDecor('affiche')}>
                          <Icone nom="affiche" taille={15} /> Sur une affiche
                        </button>
                        <button type="button" className="btn btn-secondaire" onClick={() => setDecor('monument')} disabled={!etat.lieux.length}>
                          <Icone nom="pin" taille={15} /> Au monument
                        </button>
                      </div>
                      <small className="aide-champ">Dans le studio, le modèle est montré à une taille de référence ({metres(TAILLE_REFERENCE[fichier.usage])}) à côté d’une silhouette de 1,75 m.</small>
                    </div>
                  )}
                  {outil === 'rotation' && <SectionRotation rotation={modele.reglages.rotation} onChange={(rotation) => modele.setReglages({ ...modele.reglages, rotation })} desactive={modeleVerrouille} partage={Math.max(0, animations.length - 1)} />}
                  {outil === 'rendu' && <SectionRendu reglages={modele.reglages} onChange={modele.setReglages} desactive={modeleVerrouille} />}
                  {outil === 'fichier' && <SectionFichier fichier={fichier} desactive={modeleVerrouille} />}
                </div>
              </aside>
            </div>
          )}

          {decor === 'affiche' && (
            <AtelierAffiche
              key={courantAffiche.id || 'apercu'}
              animation={courantAffiche}
              onAnimation={(p) => majAnimation(animAffiche, p)}
              reglages3d={modele.reglages}
              onReglages3d={modele.setReglages}
              choixModele={false}
              desactive={!!animAffiche && !modifiable(animAffiche)}
              entete={
                <div className="choix-animation">
                  <label className="champ">
                    <span className="etiquette">Animation réglée</span>
                    <select value={afficheAnimId} onChange={(e) => setAfficheAnimId(e.target.value)}>
                      {surAffiche.map((x) => (
                        <option key={x.id} value={x.id}>
                          {libelleAnim(x)}
                        </option>
                      ))}
                      <option value="">Aperçu sans animation</option>
                    </select>
                  </label>
                  {noteAnimation(animAffiche)}
                </div>
              }
            />
          )}

          {decor === 'monument' &&
            (courantMonument && lieuMonument ? (
              <AtelierMonument
                key={courantMonument.id || monumentCle}
                animation={courantMonument}
                onAnimation={(p) => majAnimation(animMonument, p)}
                reglages3d={modele.reglages}
                onReglages3d={modele.setReglages}
                lieu={lieuMonument}
                choixModele={false}
                desactive={!!animMonument && !modifiable(animMonument)}
                entete={
                  <div className="choix-animation">
                    <label className="champ">
                      <span className="etiquette">Monument</span>
                      <select value={monumentCle} onChange={(e) => setMonumentCle(e.target.value)}>
                        {auMonument.length > 0 && (
                          <optgroup label="Animations qui utilisent ce modèle">
                            {auMonument.map((x) => (
                              <option key={x.id} value={x.id}>
                                {libelleAnim(x)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Aperçu au monument">
                          {etat.lieux.map((l) => (
                            <option key={l.id} value={`lieu:${l.id}`}>
                              {l.nom}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>
                    {noteAnimation(animMonument)}
                  </div>
                }
              />
            ) : (
              <div className="atelier-chargement">Aucun monument enregistré : créez d’abord un monument.</div>
            ))}
        </Suspense>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Studio : le modèle seul à sa taille de référence, à côté d'une silhouette de 1,75 m, sur une grille
 * d'1 m. Anneaux pour le tourner (outil Rotation), vues 3D / face / côté / dessus, lecture des animations.
 */
function VueStudio({
  fichier,
  reglages3d,
  outil,
  onRotation,
  desactive,
}: {
  fichier: Fichier
  reglages3d: Reglages3D
  outil: Outil
  onRotation: (r: Reglages3D['rotation']) => void
  desactive?: boolean
}) {
  const [vue, setVue] = useState<VueCamera>('perspective')
  const [humain, setHumain] = useState(true)
  const [grille, setGrille] = useState(true)
  const [clips, setClips] = useState<string[]>([])
  const [clip, setClip] = useState<number | null>(null)
  const [pause, setPause] = useState(false)
  const [dims, setDims] = useState<THREE.Vector3 | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(0)
  const conteneur = useRef<HTMLDivElement>(null)
  const scene3d = useRef<{
    modele: ModeleAnime | null
    eclairage: Eclairage
    camera: THREE.PerspectiveCamera
    controles: OrbitControls
    poignees: TransformControls
    pivot: THREE.Object3D
    humain: THREE.Object3D
    grille: THREE.Object3D
    debut: THREE.Quaternion | null
  } | null>(null)
  const reglagesRef = useRef(reglages3d)
  reglagesRef.current = reglages3d
  const rappel = useRef(onRotation)
  rappel.current = onRotation
  const taille = TAILLE_REFERENCE[fichier.usage]

  function cadrer(v: VueCamera) {
    const s = scene3d.current
    if (!s?.modele) return
    const boite = s.modele.boiteMonde().expandByPoint(new THREE.Vector3(0, 0, 0)).expandByPoint(new THREE.Vector3(0, 1.75, 0))
    cadrerCamera(s.camera, s.controles, boite, v, 1.8)
  }

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
    const pivot = new THREE.Object3D()
    scene.add(grilleObj, humainObj, pivot)
    const poignees = new TransformControls(camera, renderer.domElement)
    poignees.setMode('rotate')
    poignees.setSpace('world')
    poignees.addEventListener('dragging-changed', (e) => {
      const glisse = (e as unknown as { value: boolean }).value
      controles.enabled = !glisse
      const s = scene3d.current
      if (!s) return
      pivot.quaternion.identity()
      const r = reglagesRef.current.rotation
      s.debut = glisse ? new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x * RAD, r.y * RAD, r.z * RAD)) : null
    })
    poignees.addEventListener('objectChange', () => {
      const s = scene3d.current
      if (!s?.debut) return
      const e = new THREE.Euler().setFromQuaternion(pivot.quaternion.clone().multiply(s.debut), 'XYZ')
      rappel.current({ x: normaliserAngle(e.x / RAD), y: normaliserAngle(e.y / RAD), z: normaliserAngle(e.z / RAD) })
    })
    scene.add(poignees.getHelper())
    scene3d.current = { modele: null, eclairage, camera, controles, poignees, pivot, humain: humainObj, grille: grilleObj, debut: null }
    let annule = false

    chargerGlb(fichier.url, renderer)
      .then((gltf) => {
        if (annule) return
        const m = new ModeleAnime(gltf, { reglages3d: reglagesRef.current })
        m.racine.scale.setScalar(taille)
        scene.add(m.racine)
        m.lancer()
        scene3d.current!.modele = m
        eclairage.regler(reglagesRef.current.luminosite)
        setClips(m.clips)
        setDims(m.dimensions().multiplyScalar(taille))
        setCharge((n) => n + 1)
      })
      .catch((e: Error) => !annule && setErreur(`Modèle illisible : ${e.message}`))

    let precedent = performance.now()
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - precedent) / 1000)
      precedent = t
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
    // La scène est recréée quand le fichier change (après optimisation ou restauration).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichier.url])

  useEffect(() => {
    const s = scene3d.current
    if (!s?.modele) return
    s.modele.appliquerReglages(reglages3d)
    s.eclairage.regler(reglages3d.luminosite)
    setDims(s.modele.dimensions().multiplyScalar(taille))
    if (!s.debut) s.modele.boiteMonde().getCenter(s.pivot.position)
  }, [reglages3d, charge, taille])

  useEffect(() => {
    if (charge) cadrer(vue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge])

  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    if (outil === 'rotation' && !desactive && s.modele) s.poignees.attach(s.pivot)
    else s.poignees.detach()
  }, [outil, desactive, charge])

  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.humain.visible = humain
    s.grille.visible = grille
  }, [humain, grille])
  useEffect(() => scene3d.current?.modele?.choisirClip(clip), [clip])
  useEffect(() => scene3d.current?.modele?.pause(pause), [pause])

  return (
    <div className="vue-atelier">
      <div className="atelier-canevas" ref={conteneur} />
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
        <button type="button" className={humain ? 'actif' : ''} aria-pressed={humain} onClick={() => setHumain(!humain)} title="Silhouette de 1,75 m">
          1,75 m
        </button>
        <button type="button" className={grille ? 'actif' : ''} aria-pressed={grille} onClick={() => setGrille(!grille)}>
          Grille
        </button>
      </div>
      {dims && (
        <div className="atelier-dimensions" aria-live="polite">
          <strong>Taille de référence pour l’aperçu</strong>
          <span>
            L {metres(dims.x)} · H {metres(dims.y)} · P {metres(dims.z)}
          </span>
          <small>La vraie taille se règle sur l’affiche ou au monument.</small>
        </div>
      )}
      {outil === 'rotation' && dims && !desactive && <p className="consigne-vue">Glissez un anneau pour faire tourner le modèle.</p>}
      {clips.length > 0 && (
        <div className="atelier-lecture">
          <button type="button" className="bo-icone" onClick={() => setPause(!pause)} aria-label={pause ? 'Lire' : 'Pause'}>
            <Icone nom={pause ? 'lecture' : 'pause'} taille={16} />
          </button>
          <select value={clip ?? ''} onChange={(e) => setClip(e.target.value === '' ? null : Number(e.target.value))} aria-label="Animation à prévisualiser">
            <option value="">Toutes les animations</option>
            {clips.map((c, i) =>
              c === NOM_ANIMATION_COMBINEE ? null : (
                <option key={`${i}-${c}`} value={i}>
                  {c || `Animation ${i + 1}`}
                </option>
              ),
            )}
          </select>
        </div>
      )}
      {(erreur || !dims) && (
        <div className="atelier-chargement">
          {erreur ?? (
            <>
              <span className="spinner" /> Chargement du modèle…
            </>
          )}
        </div>
      )}
    </div>
  )
}
