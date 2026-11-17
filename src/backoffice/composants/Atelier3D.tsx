// Atelier 3D : gestion complète d'un modèle GLB dans le back-office.
//  - Visionneuse Three.js orbitable : le modèle est montré à une taille de référence (12 m pour un
//    monument, 1,5 × une affiche A3 pour une affiche), à côté d'une silhouette de 1,75 m ; grille d'1 m,
//    vues face / côté / dessus. La taille réelle ne se règle pas ici mais au placement de l'animation
//    (par rapport à l'affiche, ou en mètres autour du monument) : un seul réglage de taille.
//  - Réglages non destructifs (enregistrés en base, appliqués partout par Three.js) : rotation,
//    ancrage au sol ou au centre, décalage vertical, vitesse des animations, luminosité.
//  - Animations intégrées : choix du clip à prévisualiser, lecture / pause.
//  - Optimisation par le serveur (glTF-Transform) : textures, simplification, compression Meshopt ;
//    mesures avant / après, original conservé et restaurable.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { BUDGETS_3D, NOM_ANIMATION_COMBINEE, OPTIMISATION_DEFAUT, PLACEMENT_LIEU_DEFAUT, REGLAGE_AFFICHE_RA_DEFAUT, REGLAGES_3D_DEFAUT } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { enregistrerReglages3D, optimiserModele, restaurerModele } from '../../commun/store'
import type { Fichier, MesureModele, ParametresOptimisation, Reglages3D } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime, reglagesComplets, type Eclairage } from '../../visiteur/ra/contenu3d'
import { formaterPoids } from '../ui'

type Vue = 'perspective' | 'face' | 'cote' | 'dessus'

/** Taille (plus grande dimension, en mètres) du modèle dans l'aperçu, selon son usage. */
const TAILLE_REFERENCE = { LIEU: PLACEMENT_LIEU_DEFAUT.tailleM, AFFICHE: 0.42 * REGLAGE_AFFICHE_RA_DEFAUT.taille } as const

/** Dimensions affichées : modèle ramené à 1 unité, multiplié par sa taille de référence. */
const mesurer = (m: ModeleAnime) => m.dimensions().multiplyScalar(m.racine.scale.x)

const metres = (v: number) => (v >= 10 ? `${v.toFixed(1)} m` : v >= 1 ? `${v.toFixed(2)} m` : `${Math.round(v * 100)} cm`).replace('.', ',')
const egaux = (a: Reglages3D, b: Reglages3D) => JSON.stringify(a) === JSON.stringify(b)

/** Silhouette humaine simplifiée de 1,75 m (repère d'échelle). */
function silhouette(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, transparent: true, opacity: 0.55, roughness: 0.8 })
  const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.95, 4, 12), mat)
  corps.position.y = 0.2 + 0.95 / 2 + 0.05
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat)
  tete.position.y = 1.63
  g.add(corps, tete)
  return g
}

export default function Atelier3D({ fichier, onFermer }: { fichier: Fichier; onFermer: () => void }) {
  const initial = useMemo(() => reglagesComplets(fichier.reglages3d), [fichier.reglages3d])
  const [r, setR] = useState<Reglages3D>(initial)
  const [dims, setDims] = useState<THREE.Vector3 | null>(null)
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

  const conteneur = useRef<HTMLDivElement>(null)
  const scene3d = useRef<{
    modele: ModeleAnime | null
    eclairage: Eclairage
    camera: THREE.PerspectiveCamera
    controles: OrbitControls
    humain: THREE.Object3D
    grille: THREE.Object3D
  } | null>(null)
  const reglagesRef = useRef(r)
  reglagesRef.current = r

  const modifie = !egaux(r, initial)
  const budget = BUDGETS_3D[fichier.usage]
  const maj = (p: Partial<Reglages3D>) => setR((x) => ({ ...x, ...p }))
  const majRotation = (axe: 'x' | 'y' | 'z', v: number) => setR((x) => ({ ...x, rotation: { ...x.rotation, [axe]: ((((v + 180) % 360) + 360) % 360) - 180 } }))

  /** Cadre la caméra sur le modèle (et la silhouette) selon la vue demandée. */
  function cadrer(v: Vue) {
    const s = scene3d.current
    if (!s?.modele) return
    const d = mesurer(s.modele)
    const rayon = Math.max(d.x, d.y, d.z, 1.8) * 0.75
    const cible = new THREE.Vector3(0, Math.max(d.y, 1.75) / 2, 0)
    const distance = rayon / Math.sin((s.camera.fov * Math.PI) / 360)
    const dir = v === 'face' ? new THREE.Vector3(0, 0, 1) : v === 'cote' ? new THREE.Vector3(1, 0, 0) : v === 'dessus' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.8, 0.45, 1)
    s.camera.position.copy(cible).addScaledVector(dir.normalize(), distance)
    s.camera.near = distance / 100
    s.camera.far = distance * 100
    s.camera.updateProjectionMatrix()
    s.controles.target.copy(cible)
    s.controles.update()
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
    scene.add(grilleObj, humainObj)
    scene3d.current = { modele: null, eclairage, camera, controles, humain: humainObj, grille: grilleObj }
    let annule = false

    chargerGlb(fichier.url, renderer)
      .then((gltf) => {
        if (annule) return
        const modele = new ModeleAnime(gltf, { reglages3d: reglagesRef.current })
        modele.racine.scale.setScalar(TAILLE_REFERENCE[fichier.usage])
        scene.add(modele.racine)
        modele.lancer()
        modele.choisirClip(null)
        scene3d.current!.modele = modele
        eclairage.regler(reglagesRef.current.luminosite)
        setClips(modele.clips)
        setDims(mesurer(modele))
        cadrer('perspective')
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
      controles.dispose()
      scene3d.current?.modele?.liberer()
      eclairage.liberer()
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
    setDims(mesurer(s.modele))
  }, [r])

  useEffect(() => {
    if (scene3d.current) {
      scene3d.current.humain.visible = humain
      scene3d.current.grille.visible = grille
    }
  }, [humain, grille])
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
                {{ perspective: '3D', face: 'Face', cote: 'Côté', dessus: 'Dessus' }[v]}
              </button>
            ))}
            <span className="separateur" />
            <button type="button" className={humain ? 'actif' : ''} onClick={() => setHumain(!humain)} title="Silhouette de 1,75 m">
              Repère 1,75 m
            </button>
            <button type="button" className={grille ? 'actif' : ''} onClick={() => setGrille(!grille)}>
              Grille 1 m
            </button>
          </div>
          {dims && (
            <div className="atelier-dimensions" aria-live="polite">
              <strong>Taille de référence pour l’aperçu</strong>
              <span>
                L {metres(dims.x)} · H {metres(dims.y)} · P {metres(dims.z)}
              </span>
              <small>
                {fichier.usage === 'LIEU'
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
          {!dims && !erreur && (
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
