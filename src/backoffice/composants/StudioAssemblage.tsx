// Studio d'assemblage : plusieurs modèles 3D réunis en un seul (par exemple logo · séparateur · logo
// pour une affiche de match). Chaque modèle est posé dans le studio avec ses réglages de l'atelier ; on le
// déplace et on le tourne avec les poignées, on règle sa taille en mètres, et ses animations intégrées
// jouent toutes ensemble. « Créer le modèle assemblé » envoie la place de chacun au serveur, qui produit
// un nouveau GLB (glTF-Transform) contrôlé comme un import.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { assemblerModeles, useEtat } from '../../commun/store'
import type { Fichier } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime, type Eclairage } from '../../visiteur/ra/contenu3d'
import { useSession } from '../session'
import { cadrerCamera, LIBELLES_VUES, libererScene, metres, silhouette, type VueCamera } from './sceneApercu'

interface Element {
  cle: string
  fichier: Fichier
  /** Plus grande dimension du modèle dans l'assemblage, en mètres. */
  taille: number
}

/** Espace laissé entre deux modèles posés côte à côte (mètres). */
const ECART_M = 0.1
const nomSansExtension = (f: Fichier) => f.nomOriginal.replace(/\.glb$/i, '')

export default function StudioAssemblage({
  depart,
  onFermer,
  onCree,
  scene,
}: {
  depart?: Fichier
  onFermer: () => void
  onCree: (f: Fichier, remplace: boolean) => void
  /**
   * Ouvert par « + Ajouter un modèle » dans le studio d'une affiche ou d'un monument : le modèle de
   * l'animation est déjà posé, on lui ajoute des modèles ; la validation crée toujours un nouveau modèle.
   */
  scene?: { usage: 'AFFICHE' | 'LIEU' }
}) {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  /** Modèles utilisables : contrôle terminé, non refusés, visibles par l'utilisateur. */
  const modeles = useMemo(
    () => etat.fichiers.filter((f) => f.type === 'MODELE_3D' && f.statutControle !== 'REFUSE' && (f.statutControle === 'CONFORME' || f.controleTermine) && (agent || f.proprietaireId === session.partenaireId)),
    [etat.fichiers, agent, session.partenaireId],
  )
  const [elements, setElements] = useState<Element[]>(() => (depart ? [{ cle: crypto.randomUUID(), fichier: depart, taille: 1 }] : []))
  const [selection, setSelection] = useState<string | null>(elements[0]?.cle ?? null)
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate')
  const [vue, setVue] = useState<VueCamera>('face')
  const [humain, setHumain] = useState(true)
  const [charges, setCharges] = useState(0)
  const [nom, setNom] = useState('')
  const [usage, setUsage] = useState<'AFFICHE' | 'LIEU'>(scene?.usage ?? depart?.usage ?? (agent ? 'LIEU' : 'AFFICHE'))
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const nomPropose = elements.map((e) => nomSansExtension(e.fichier)).join(' + ')

  const conteneur = useRef<HTMLDivElement>(null)
  const scene3d = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controles: OrbitControls
    poignees: TransformControls
    eclairage: Eclairage
    humain: THREE.Object3D
    instances: Map<string, ModeleAnime>
    /** Modèles en cours de chargement. */
    enCours: Set<string>
  } | null>(null)
  const elementsRef = useRef(elements)
  elementsRef.current = elements

  /** Cadre la caméra sur tous les modèles (et la silhouette). */
  function cadrer(v: VueCamera) {
    const s = scene3d.current
    if (!s) return
    const boite = new THREE.Box3().expandByPoint(new THREE.Vector3(0, 0, 0))
    for (const m of s.instances.values()) boite.union(m.boiteMonde())
    if (s.humain.visible) boite.expandByObject(s.humain)
    cadrerCamera(s.camera, s.controles, boite, v, 0.6)
  }

  /** Pose les modèles côte à côte de gauche à droite, au sol, centrés (ordre de la liste). */
  function aligner() {
    const s = scene3d.current
    if (!s) return
    const liste = elements.map((e) => s.instances.get(e.cle)).filter((m): m is ModeleAnime => !!m)
    const largeurs = liste.map((m) => m.boiteMonde().getSize(new THREE.Vector3()).x)
    const total = largeurs.reduce((a, b) => a + b, 0) + ECART_M * Math.max(0, liste.length - 1)
    let x = -total / 2
    liste.forEach((m, i) => {
      m.racine.position.set(0, 0, 0)
      const boite = m.boiteMonde()
      m.racine.position.set(x - boite.min.x, -boite.min.y, -(boite.min.z + boite.max.z) / 2)
      x += largeurs[i] + ECART_M
    })
    s.humain.position.set(-total / 2 - 0.6, 0, 0)
    cadrer(vue)
  }

  // Scène : créée une fois.
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
    const humainObj = silhouette()
    humainObj.position.x = -1.2
    scene.add(new THREE.GridHelper(20, 40, 0x7b1e2e, 0xbdb6a8), humainObj)
    const poignees = new TransformControls(camera, renderer.domElement)
    poignees.setSize(0.85)
    poignees.addEventListener('dragging-changed', (e) => {
      controles.enabled = !(e as unknown as { value: boolean }).value
    })
    scene.add(poignees.getHelper())
    scene3d.current = { renderer, scene, camera, controles, poignees, eclairage, humain: humainObj, instances: new Map(), enCours: new Set() }

    // Clic sur un modèle (sans glisser) : il devient le modèle sélectionné.
    let appui: { x: number; y: number } | null = null
    const bas = (e: PointerEvent) => (appui = { x: e.clientX, y: e.clientY })
    const haut = (e: PointerEvent) => {
      const s = scene3d.current
      if (!appui || !s || poignees.dragging || Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 4) return
      const r = renderer.domElement.getBoundingClientRect()
      const rayon = new THREE.Raycaster()
      rayon.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      let meilleur: { cle: string; distance: number } | null = null
      for (const [cle, m] of s.instances) {
        const touche = rayon.intersectObject(m.racine, true)[0]
        if (touche && (!meilleur || touche.distance < meilleur.distance)) meilleur = { cle, distance: touche.distance }
      }
      if (meilleur) setSelection(meilleur.cle)
    }
    renderer.domElement.addEventListener('pointerdown', bas)
    renderer.domElement.addEventListener('pointerup', haut)

    let precedent = performance.now()
    renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - precedent) / 1000)
      precedent = t
      for (const m of scene3d.current?.instances.values() ?? []) m.mettreAJour(dt)
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
      observateur.disconnect()
      renderer.domElement.removeEventListener('pointerdown', bas)
      renderer.domElement.removeEventListener('pointerup', haut)
      poignees.detach()
      poignees.dispose()
      controles.dispose()
      for (const m of scene3d.current?.instances.values() ?? []) m.liberer()
      eclairage.liberer()
      libererScene(scene)
      renderer.dispose()
      renderer.domElement.remove()
      scene3d.current = null
    }
  }, [])

  // Modèles ajoutés (chargés, posés à droite des autres) ou retirés.
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    for (const [cle, m] of s.instances) {
      if (elements.some((e) => e.cle === cle)) continue
      if (s.poignees.object === m.racine) s.poignees.detach()
      m.liberer()
      s.instances.delete(cle)
    }
    for (const e of elements) {
      if (s.instances.has(e.cle) || s.enCours.has(e.cle)) continue
      s.enCours.add(e.cle)
      chargerGlb(e.fichier.url, s.renderer)
        .then((gltf) => {
          s.enCours.delete(e.cle)
          // Retiré pendant le chargement, ou studio fermé.
          if (scene3d.current !== s || !elementsRef.current.some((x) => x.cle === e.cle)) return
          const m = new ModeleAnime(gltf, { reglages3d: e.fichier.reglages3d })
          m.racine.scale.setScalar(e.taille)
          // À droite des modèles déjà posés, au sol.
          const boiteAutres = new THREE.Box3()
          for (const autre of s.instances.values()) boiteAutres.union(autre.boiteMonde())
          s.scene.add(m.racine)
          m.lancer()
          m.choisirClip(null)
          const boite = m.boiteMonde()
          const x = boiteAutres.isEmpty() ? -(boite.min.x + boite.max.x) / 2 : boiteAutres.max.x + ECART_M - boite.min.x
          m.racine.position.set(x, -boite.min.y, -(boite.min.z + boite.max.z) / 2)
          s.instances.set(e.cle, m)
          s.eclairage.regler(m.luminosite)
          setCharges((n) => n + 1)
        })
        .catch((err: Error) => {
          s.enCours.delete(e.cle)
          if (scene3d.current === s) setErreur(`« ${e.fichier.nomOriginal} » illisible : ${err.message}`)
        })
    }
  }, [elements])

  // Taille de chaque modèle (le socle reste à la même hauteur).
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    for (const e of elements) {
      const m = s.instances.get(e.cle)
      if (!m || Math.abs(m.racine.scale.x - e.taille) < 1e-6) continue
      const avant = m.boiteMonde().min.y
      m.racine.scale.setScalar(e.taille)
      m.racine.position.y += avant - m.boiteMonde().min.y
    }
  }, [elements, charges])

  // Poignées sur le modèle sélectionné.
  useEffect(() => {
    const s = scene3d.current
    if (!s) return
    s.poignees.setMode(mode)
    const m = selection ? s.instances.get(selection) : null
    if (m) s.poignees.attach(m.racine)
    else s.poignees.detach()
  }, [selection, mode, charges])

  useEffect(() => {
    if (scene3d.current) scene3d.current.humain.visible = humain
  }, [humain])

  // Cadrage quand un modèle vient d'être chargé.
  useEffect(() => {
    if (charges) cadrer(vue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges])

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onFermer()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFermer, envoi])

  const tousCharges = elements.length > 0 && elements.every((e) => !!scene3d.current?.instances.get(e.cle))
  const selectionne = elements.find((e) => e.cle === selection)
  const majTaille = (cle: string, taille: number) => setElements((l) => l.map((e) => (e.cle === cle ? { ...e, taille } : e)))
  const deplacer = (cle: string, sens: -1 | 1) =>
    setElements((l) => {
      const i = l.findIndex((e) => e.cle === cle)
      const j = i + sens
      if (i < 0 || j < 0 || j >= l.length) return l
      const copie = [...l]
      ;[copie[i], copie[j]] = [copie[j], copie[i]]
      return copie
    })

  /** Animations qui utilisent le modèle de départ : elles suivent le modèle s'il est remplacé. */
  const animationsDepart = depart ? etat.animations.filter((a) => a.modeleId === depart.id) : []
  /** Le modèle de départ peut être modifié sur place (sinon seule une copie est possible). */
  const departModifiable = !scene && !!depart && (agent || depart.proprietaireId === session.partenaireId)
  const [choixEnregistrement, setChoixEnregistrement] = useState(false)
  const pret = tousCharges && (elements.length >= 2 || (departModifiable && elements.length >= 1))

  /** « Remplacer » : le modèle de départ prend le nouveau contenu ; sinon un nouveau fichier (copie). */
  async function creer(remplacer: boolean) {
    const s = scene3d.current
    if (!s || !pret) return
    setChoixEnregistrement(false)
    setEnvoi(true)
    setErreur(null)
    try {
      const f = await assemblerModeles({
        nom: (nom.trim() || (remplacer && depart ? nomSansExtension(depart) : nomPropose)).slice(0, 120),
        usage,
        elements: elements.map((e) => ({ fichierId: e.fichier.id, matrice: s.instances.get(e.cle)!.matriceScene().toArray() })),
        remplacerId: remplacer ? depart?.id : undefined,
      })
      onCree(f, remplacer)
    } catch (e) {
      setErreur(messageErreur(e))
      setEnvoi(false)
    }
  }

  const ajouter = (id: string) => {
    const f = modeles.find((x) => x.id === id)
    if (!f) return
    const cle = crypto.randomUUID()
    setElements((l) => [...l, { cle, fichier: f, taille: 1 }])
    setSelection(cle)
  }
  const choixAjout = (
    <label className="ajout-studio">
      <span className="icone-ajout" aria-hidden="true">
        <Icone nom="plus" taille={18} epaisseur={2.4} />
      </span>
      <select value="" onChange={(ev) => ajouter(ev.target.value)} disabled={elements.length >= 12 || envoi} aria-label="Ajouter un modèle à la scène">
        <option value="">Ajouter un modèle…</option>
        {modeles.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nomOriginal}
            {f.clips?.length ? ` · ${f.clips.length} animation${f.clips.length > 1 ? 's' : ''}` : ''}
          </option>
        ))}
      </select>
    </label>
  )

  return createPortal(
    <div className="atelier-3d studio-assemblage" role="dialog" aria-modal="true" aria-label={scene ? 'Ajouter des modèles à la scène' : 'Studio d’assemblage'}>
      <header className="atelier-tete">
        <div>
          <h2>
            <Icone nom="couches" taille={20} /> {scene ? 'Ajouter des modèles à la scène' : 'Studio d’assemblage'}
          </h2>
          <p>
            {scene
              ? `Ajoutez des modèles à côté de « ${depart ? nomSansExtension(depart) : 'votre modèle'} », placez-les, puis validez : ils apparaîtront ensemble.`
              : 'Réunissez plusieurs modèles 3D en un seul : chacun garde ses animations, qui jouent ensemble.'}
          </p>
        </div>
        <div className="atelier-actions">
          <button type="button" className="btn btn-fantome" onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          {departModifiable ? (
            // Parti d'un modèle existant : on demande s'il faut le modifier ou en enregistrer une copie.
            <button type="button" className="btn btn-primaire" onClick={() => setChoixEnregistrement(true)} disabled={envoi || !pret}>
              {envoi ? <span className="spinner" /> : <Icone nom="check" taille={15} />} Enregistrer…
            </button>
          ) : (
            <button type="button" className="btn btn-primaire" onClick={() => void creer(false)} disabled={envoi || !pret} title={elements.length < 2 ? 'Ajoutez au moins un autre modèle' : undefined}>
              {envoi ? <span className="spinner" /> : <Icone nom="check" taille={15} />} {scene ? 'Valider la scène' : 'Créer le modèle assemblé'}
            </button>
          )}
        </div>
      </header>

      <div className="atelier-corps">
        <section className="atelier-vue">
          <div className="atelier-canevas" ref={conteneur} />
          {/* Ici, seulement la caméra et les repères : les outils sont dans le panneau. */}
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
            <button type="button" className={humain ? 'actif' : ''} aria-pressed={humain} onClick={() => setHumain(!humain)} title="Silhouette d’une personne de 1,75 m, pour juger les tailles">
              <Icone nom="utilisateurs" taille={14} /> Personne 1,75 m
            </button>
          </div>
          {elements.length === 0 && <div className="atelier-chargement">Ajoutez un premier modèle avec « + » dans le panneau.</div>}
          {elements.length > 0 && !tousCharges && (
            <div className="atelier-chargement">
              <span className="spinner" /> Chargement des modèles…
            </div>
          )}
          {selectionne && tousCharges && (
            <p className="consigne-vue">{mode === 'translate' ? 'Glissez une flèche pour déplacer le modèle sélectionné.' : 'Glissez un anneau pour le faire tourner.'} Cliquez sur un modèle pour le sélectionner.</p>
          )}
        </section>

        <aside className="atelier-panneau panneau-studio">
          {erreur && (
            <p className="erreur-acces" role="alert">
              <Icone nom="alerte" taille={15} />
              {erreur}
            </p>
          )}

          <section className="studio-section" aria-label="Modèles de la scène">
            <h3 className="titre-studio">
              <Icone nom="cube" taille={16} /> Modèles de la scène <b>{elements.length}</b>
            </h3>
            {elements.length > 0 && (
              <ol className="liste-assemblage">
                {elements.map((e, i) => (
                  <li key={e.cle} className={e.cle === selection ? 'actif' : ''}>
                    <button type="button" className="nom-element" onClick={() => setSelection(e.cle)} aria-pressed={e.cle === selection}>
                      <Icone nom="cube" taille={14} />
                      <span>{nomSansExtension(e.fichier)}</span>
                      <small>{metres(e.taille)}</small>
                    </button>
                    <span className="boutons-rapides">
                      <button type="button" onClick={() => deplacer(e.cle, -1)} disabled={i === 0} aria-label={`Monter ${e.fichier.nomOriginal}`} title="Monter dans la liste">
                        <Icone nom="haut" taille={13} />
                      </button>
                      <button type="button" onClick={() => deplacer(e.cle, 1)} disabled={i === elements.length - 1} aria-label={`Descendre ${e.fichier.nomOriginal}`} title="Descendre dans la liste">
                        <Icone nom="bas" taille={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setElements((l) => l.filter((x) => x.cle !== e.cle))
                          if (selection === e.cle) setSelection(null)
                        }}
                        aria-label={`Retirer ${e.fichier.nomOriginal}`}
                        title="Retirer de la scène"
                      >
                        <Icone nom="poubelle" taille={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {choixAjout}
            {elements.length >= 2 && (
              <button type="button" className="btn btn-texte petit" onClick={aligner} disabled={!tousCharges}>
                <Icone nom="grille" taille={14} /> Aligner côte à côte
              </button>
            )}
          </section>

          {selectionne && (
            <section className="studio-section" aria-label={`Réglages de ${nomSansExtension(selectionne.fichier)}`}>
              <h3 className="titre-studio">
                <Icone nom="reglages" taille={16} /> {nomSansExtension(selectionne.fichier)}
              </h3>
              <div className="onglets-studio deux" role="tablist" aria-label="Outil">
                <button type="button" role="tab" aria-selected={mode === 'translate'} className={mode === 'translate' ? 'actif' : ''} onClick={() => setMode('translate')}>
                  <Icone nom="deplacer" taille={18} />
                  <span>Déplacer</span>
                </button>
                <button type="button" role="tab" aria-selected={mode === 'rotate'} className={mode === 'rotate' ? 'actif' : ''} onClick={() => setMode('rotate')}>
                  <Icone nom="pivoter" taille={18} />
                  <span>Tourner</span>
                </button>
              </div>
              <label className="reglage-curseur">
                <span>
                  Taille <b>{metres(selectionne.taille)}</b>
                </span>
                <input
                  type="range"
                  min={-1.3}
                  max={1.3}
                  step={0.01}
                  value={Math.log10(selectionne.taille)}
                  onChange={(ev) => majTaille(selectionne.cle, Number((10 ** Number(ev.target.value)).toFixed(2)))}
                />
              </label>
            </section>
          )}

          {!scene && (
            <details className="reglages-avances studio-section">
              <summary>{departModifiable ? 'Nom et usage du modèle' : 'Nom et usage du nouveau modèle'}</summary>
              <label className="champ">
                <span className="etiquette">Nom</span>
                <input value={nom} onChange={(ev) => setNom(ev.target.value)} placeholder={nomPropose || 'Nom du modèle assemblé'} maxLength={120} />
              </label>
              <label className="champ">
                <span className="etiquette">Usage</span>
                <select value={usage} onChange={(ev) => setUsage(ev.target.value as 'AFFICHE' | 'LIEU')} disabled={!agent}>
                  <option value="AFFICHE">Animation d’affiche (30 000 triangles max.)</option>
                  <option value="LIEU">Animation de lieu (100 000 triangles max.)</option>
                </select>
              </label>
            </details>
          )}
          <small className="aide-champ">
            {scene ? 'Les modèles réunis forment un nouveau modèle ; les originaux ne changent pas. La taille réelle se règle ensuite dans le studio.' : 'Le serveur crée un nouveau fichier GLB, contrôlé comme un import ; les modèles d’origine ne changent pas.'}
          </small>
        </aside>
      </div>
      {choixEnregistrement && depart && (
        <div className="voile-dialogue" role="presentation" onClick={() => setChoixEnregistrement(false)}>
          <div className="dialogue-choix" role="dialog" aria-modal="true" aria-labelledby="titre-choix-enregistrement" onClick={(e) => e.stopPropagation()}>
            <h3 id="titre-choix-enregistrement">Enregistrer les modifications</h3>
            <p>Vous avez modifié « {depart.nomOriginal} ». Que voulez-vous faire ?</p>
            <button type="button" className="choix-enregistrement" onClick={() => void creer(true)} autoFocus>
              <Icone nom="crayon" taille={20} />
              <span>
                <strong>Modifier le modèle</strong>
                <small>
                  « {depart.nomOriginal} » est remplacé
                  {animationsDepart.length
                    ? ` : ${animationsDepart.length} animation${animationsDepart.length > 1 ? 's l’utilisent' : ' l’utilise'} et ${animationsDepart.length > 1 ? 'sont mises' : 'est mise'} à jour.`
                    : '. Aucun fichier en plus dans la bibliothèque.'}
                </small>
              </span>
            </button>
            <button type="button" className="choix-enregistrement" onClick={() => void creer(false)}>
              <Icone nom="copie" taille={20} />
              <span>
                <strong>Enregistrer une copie</strong>
                <small>Un nouveau modèle « {(nom.trim() || nomPropose).slice(0, 60)} » est créé ; l’original ne change pas.</small>
              </span>
            </button>
            <button type="button" className="btn btn-fantome" onClick={() => setChoixEnregistrement(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
