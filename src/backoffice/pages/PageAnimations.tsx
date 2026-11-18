import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D, MODELE_3D_MAX_MO, PLACEMENT_LIEU_DEFAUT, REGLAGE_AFFICHE_RA_DEFAUT } from '../../commun/constantes'
import { EditeurPlacement3D } from '../composants/EditeurPlacement3D'
import { EditeurPlacementAffiche } from '../composants/EditeurPlacementAffiche'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { animationActive, attendreControle, basculerAnimation, enregistrerAnimation, importerFichier, nomProprietaire, supprimerAnimation, useEtat, validerFichier } from '../../commun/store'
import type { Animation, Declencheur, PlacementGps, TypeAnimation } from '../../commun/types'
const Atelier3D = lazy(() => import('../composants/Atelier3D'))
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, EnTetePage, formaterDate, formaterPoids, Interrupteur, maintenantLocal, Onglets, Recherche, Tiroir, useToast, Vide } from '../ui'

type Filtre = 'toutes' | 'actives' | 'programmees' | 'brouillons' | 'archivees'

function etatAnimation(a: Animation): { cle: Filtre; libelle: string; statut: string } {
  const now = Date.now()
  if (a.statut === 'SUSPENDUE' || a.statut === 'RETIREE') return { cle: 'archivees', libelle: a.statut === 'SUSPENDUE' ? 'Suspendue' : 'Retirée', statut: a.statut }
  if (a.statut === 'BROUILLON') return { cle: 'brouillons', libelle: 'Brouillon', statut: 'BROUILLON' }
  if (a.fin && new Date(a.fin).getTime() < now) return { cle: 'archivees', libelle: 'Expirée', statut: 'RETIREE' }
  if (animationActive(a)) return { cle: 'actives', libelle: 'Active', statut: 'PUBLIEE' }
  return { cle: 'programmees', libelle: 'Programmée', statut: 'EN_COURS' }
}

const versLocal = (iso?: string) => (iso ? iso.slice(0, 16) : '')

export default function PageAnimations() {
  const etat = useEtat()
  const session = useSession()
  const toast = useToast()
  const agent = session.role === 'AGENT'
  const [filtre, setFiltre] = useState<Filtre>('toutes')
  const [texte, setTexte] = useState('')
  const [type, setType] = useState<'tous' | TypeAnimation>('tous')
  const [edition, setEdition] = useState<Animation | null>(null)
  const [aSupprimer, setASupprimer] = useState<Animation | null>(null)
  const autorise = peutCreer(etat, session)

  const visibles = etat.animations.filter((a) => agent || a.proprietaireId === session.partenaireId)
  const liste = visibles
    .filter((a) => filtre === 'toutes' || etatAnimation(a).cle === filtre)
    .filter((a) => type === 'tous' || a.type === type)
    .filter((a) => a.titre.toLowerCase().includes(texte.toLowerCase()))
  const compte = (f: Filtre) => visibles.filter((a) => etatAnimation(a).cle === f).length

  /** Brouillon d'une nouvelle animation : identifiant vide tant que l'API ne l'a pas créée. */
  function nouvelle() {
    setEdition({
      id: '',
      proprietaireId: proprietaireDe(session),
      titre: '',
      type: agent ? 'LIEU' : 'AFFICHE',
      lieuId: agent ? etat.lieux[0]?.id : undefined,
      declencheur: agent ? 'MONUMENT' : 'AFFICHE',
      dureeS: agent ? 300 : 15,
      debut: maintenantLocal(),
      statut: 'BROUILLON',
      transcription: { fr: '', en: '', de: '' },
      lancements: 0,
      modifieLe: maintenantLocal(),
    })
  }

  return (
    <>
      <EnTetePage
        titre="Gestion des animations"
        description="Importez, planifiez et publiez vos expériences immersives. Elles s’activent et se désactivent automatiquement selon leurs dates."
        actions={
          <button type="button" className="btn btn-primaire" onClick={nouvelle} disabled={!autorise}>
            <Icone nom="plus" taille={16} />
            Nouvelle animation
          </button>
        }
      />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { id: 'toutes', libelle: 'Toutes', compte: visibles.length },
              { id: 'actives', libelle: 'Actives', compte: compte('actives') },
              { id: 'programmees', libelle: 'Programmées', compte: compte('programmees') },
              { id: 'brouillons', libelle: 'Brouillons', compte: compte('brouillons') },
              { id: 'archivees', libelle: 'Archivées', compte: compte('archivees') },
            ]}
          />
          <div className="outils-droite">
            <Recherche valeur={texte} onChange={setTexte} />
            <label className="select-compact">
              <Icone nom="filtre" taille={15} />
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type d’animation">
                <option value="tous">Tous les types</option>
                <option value="LIEU">Animations de lieu</option>
                <option value="AFFICHE">Animations d’affiche</option>
              </select>
            </label>
          </div>
        </div>

        {liste.length === 0 ? (
          <Vide icone="couches" titre="Aucune animation" texte="Aucune animation ne correspond à ces filtres." />
        ) : (
          <div className="grille-animations">
            {liste.map((a) => {
              const lieu = etat.lieux.find((l) => l.id === a.lieuId)
              const modele = etat.fichiers.find((f) => f.id === a.modeleId)
              const e = etatAnimation(a)
              const image = lieu?.image
              const verrou = a.statut === 'SUSPENDUE' || a.statut === 'RETIREE'
              return (
                <article key={a.id} className="carte-animation">
                  <div className={`apercu-animation ${image ? '' : 'sans-image'}`}>
                    {image ? <img src={image} alt="" /> : <Icone nom={a.type === 'AFFICHE' ? 'affiche' : 'cube'} taille={40} />}
                    <BadgeStatut statut={e.statut} libelle={e.libelle} />
                    <span className="type-animation">{a.type === 'LIEU' ? 'Lieu' : 'Affiche'}</span>
                  </div>
                  <div className="corps-animation">
                    <div className="titre-animation">
                      <div>
                        <h3>{a.titre}</h3>
                        <p>
                          <Icone nom="pin" taille={13} />
                          {lieu?.nom ?? 'Ancrée sur l’affiche'}
                          {agent && a.proprietaireId !== 'ville' && ` · ${nomProprietaire(etat, a.proprietaireId)}`}
                        </p>
                      </div>
                      <Interrupteur
                        actif={a.statut === 'PUBLIEE'}
                        desactive={verrou}
                        libelle={a.statut === 'PUBLIEE' ? 'Désactiver' : 'Activer'}
                        onChange={() => {
                          basculerAnimation(a.id)
                            .then(() => toast.afficher(a.statut === 'PUBLIEE' ? `« ${a.titre} » désactivée` : `« ${a.titre} » activée`))
                            .catch((err) => toast.afficher(messageErreur(err)))
                        }}
                      />
                    </div>
                    <div className="ligne-fichier">
                      <span>
                        <Icone nom="cube" taille={14} />
                        {modele ? `Modèle 3D · ${formaterPoids(modele.tailleOctets)}` : 'Aucun modèle'}
                      </span>
                      {modele && <BadgeStatut statut={modele.statutControle} libelle={modele.statutControle === 'CONFORME' ? 'Validé' : undefined} />}
                    </div>
                    <div className="pied-carte">
                      <span>
                        <Icone nom="calendrier" taille={13} />
                        {formaterDate(a.debut)} — {a.fin ? formaterDate(a.fin) : 'permanente'}
                      </span>
                      <div className="actions-carte">
                        <button type="button" className="supprimer" onClick={() => setASupprimer(a)} disabled={!agent && verrou} aria-label={`Supprimer ${a.titre}`} title="Supprimer">
                          <Icone nom="poubelle" taille={14} />
                        </button>
                        <button type="button" onClick={() => setEdition(a)} disabled={!agent && verrou}>
                          <Icone nom="crayon" taille={13} /> Modifier
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <div className="zone-import">
          <span>
            <Icone nom="import" taille={20} />
          </span>
          <div>
            <strong>Importer un nouveau modèle</strong>
            <p>GLB (glTF 2.0) et sons MP3/AAC. Contrôle automatique du format, du poids et de la complexité.</p>
          </div>
          <Link to="/backoffice/fichiers" className="btn btn-secondaire">
            Choisir un fichier
          </Link>
        </div>
      </div>
      {edition && (
        <EditeurAnimation
          animation={edition}
          onFermer={() => setEdition(null)}
          onSupprimer={edition.id ? () => setASupprimer(edition) : undefined}
          onEnregistrer={async (a, publier) => {
            await enregistrerAnimation(a, publier)
            setEdition(null)
            toast.afficher(`Animation « ${a.titre} » enregistrée${publier ? ' et activée' : ''}`)
          }}
        />
      )}
      <DialogueSuppression
        cible={aSupprimer?.titre ?? null}
        description={`L’animation ne sera plus proposée aux visiteurs. Les affiches qui l’utilisent doivent d’abord en changer. La suppression reste inscrite au journal.`}
        onFermer={() => setASupprimer(null)}
        onConfirmer={async () => {
          const r = await supprimerAnimation(aSupprimer!.id)
          if (r.ok) {
            setEdition(null)
            toast.afficher(`Animation « ${aSupprimer!.titre} » supprimée`)
          }
          return r
        }}
      />
      {toast.element}
    </>
  )
}

/**
 * Formulaire d'une animation, en étapes numérotées : 1. type et lieu, 2. modèle 3D et son (réglages
 * dans l'atelier 3D), 3. placement (autour du bâtiment en 3D, ou par rapport à l'affiche), 4. diffusion,
 * 5. accessibilité. `lieuImpose` : ouvert depuis un monument, l'animation lui est rattachée.
 */
export function EditeurAnimation({
  animation,
  lieuImpose,
  onFermer,
  onEnregistrer,
  onSupprimer,
}: {
  lieuImpose?: boolean
  animation: Animation
  onFermer: () => void
  /** Envoi à l'API ; une erreur (validation zod, droits, fichier non conforme) est affichée dans le tiroir. */
  onEnregistrer: (a: Animation, publier: boolean) => Promise<void>
  onSupprimer?: () => void
}) {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  const [a, setA] = useState<Animation>(animation)
  const [langue, setLangue] = useState<'fr' | 'en' | 'de'>('fr')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreurServeur, setErreurServeur] = useState<string | null>(null)
  /** Import en cours depuis le formulaire : type de fichier et progression de l'envoi (0 à 1). */
  const [importEnCours, setImportEnCours] = useState<{ type: 'MODELE_3D' | 'SON'; progression: number; etape: string } | null>(null)
  const [erreurImport, setErreurImport] = useState<string | null>(null)
  const maj = (p: Partial<Animation>) => setA((x) => ({ ...x, ...p }))
  /** Modèle ouvert dans l'atelier 3D depuis ce formulaire. */
  const [atelier, setAtelier] = useState(false)

  /**
   * Import direct d'un modèle GLB (ou d'un son) depuis le formulaire : envoi à l'API, contrôle
   * automatique (glTF-Validator, triangles, animations / ffprobe), puis validation et sélection.
   * L'aperçu 3D détaillé reste disponible dans « Fichiers 3D & sons ».
   */
  async function importerDepuisFormulaire(fichier: File, type: 'MODELE_3D' | 'SON') {
    setErreurImport(null)
    const ext = fichier.name.split('.').pop()?.toLowerCase() ?? ''
    if (type === 'MODELE_3D' && ext !== 'glb') return setErreurImport('Le modèle 3D doit être un fichier GLB (glTF 2.0 binaire).')
    if (type === 'SON' && !['mp3', 'm4a', 'aac'].includes(ext)) return setErreurImport('Le son doit être un fichier MP3 ou AAC (M4A).')
    if (type === 'MODELE_3D' && fichier.size > MODELE_3D_MAX_MO * 1_000_000)
      return setErreurImport(`Fichier de ${formaterPoids(fichier.size)} : ${MODELE_3D_MAX_MO} Mo maximum pour un modèle 3D.`)
    try {
      setImportEnCours({ type, progression: 0, etape: 'Envoi' })
      const cree = await importerFichier(fichier, a.type, (progression) => setImportEnCours({ type, progression, etape: 'Envoi' }))
      setImportEnCours({ type, progression: 1, etape: 'Contrôle automatique' })
      const controle = await attendreControle(cree.id, 5 * 60_000)
      if (controle.statutControle === 'REFUSE') throw new Error(`« ${fichier.name} » refusé : ${controle.raisonRefus ?? 'fichier non conforme'}.`)
      if (controle.statutControle !== 'CONFORME') await validerFichier(cree.id)
      if (type === 'MODELE_3D') maj({ modeleId: cree.id, clipIndice: undefined })
      else maj({ sonId: cree.id })
    } catch (e) {
      setErreurImport(messageErreur(e))
    } finally {
      setImportEnCours(null)
    }
  }

  /** Bouton « Importer » associé à une liste de fichiers (input caché). */
  const boutonImport = (type: 'MODELE_3D' | 'SON') => (
    <label className={`bouton-import-champ ${importEnCours ? 'inactif' : ''}`}>
      {importEnCours?.type === type ? (
        <>
          <span className="spinner" /> {importEnCours.etape}
          {importEnCours.etape === 'Envoi' ? ` ${Math.round(importEnCours.progression * 100)} %` : '…'}
        </>
      ) : (
        <>
          <Icone nom="import" taille={14} /> {type === 'MODELE_3D' ? 'Importer un GLB' : 'Importer un son'}
        </>
      )}
      <input
        type="file"
        hidden
        disabled={!!importEnCours}
        accept={type === 'MODELE_3D' ? '.glb,model/gltf-binary' : '.mp3,.m4a,.aac,audio/*'}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importerDepuisFormulaire(f, type)
          e.target.value = ''
        }}
      />
    </label>
  )

  const fichiers = useMemo(
    () => etat.fichiers.filter((f) => f.statutControle === 'CONFORME' && (agent || f.proprietaireId === session.partenaireId)),
    [etat.fichiers, agent, session.partenaireId],
  )
  const modeles = fichiers.filter((f) => f.type === 'MODELE_3D')
  const clipsModele = etat.fichiers.find((f) => f.id === a.modeleId)?.clips ?? []
  const sons = fichiers.filter((f) => f.type === 'SON')
  const budget = BUDGETS_3D[a.type]
  const poids = (etat.fichiers.find((f) => f.id === a.modeleId)?.tailleOctets ?? 0) + (etat.fichiers.find((f) => f.id === a.sonId)?.tailleOctets ?? 0)
  const tri = etat.fichiers.find((f) => f.id === a.modeleId)?.nbTriangles ?? 0
  const lieuChoisi = etat.lieux.find((l) => l.id === a.lieuId)
  // Modèle dessiné sur la carte de placement, avec ses réglages de l'atelier 3D.
  const fichierModele = etat.fichiers.find((f) => f.id === a.modeleId)
  const modeleCarte = useMemo(
    () => (fichierModele ? { modeleUrl: fichierModele.url, reglages3d: fichierModele.reglages3d, clipIndice: a.clipIndice, lecture: a.lecture } : undefined),
    [fichierModele, a.clipIndice, a.lecture],
  )

  const erreurs = {
    titre: !a.titre.trim(),
    lieu: a.type === 'LIEU' && !a.lieuId,
    modele: !a.modeleId,
    // Animation d'affiche : la fin est obligatoire (une affiche a toujours une fin) ; elle suit la sortie.
    dates: (a.type === 'AFFICHE' && !a.fin) || (!!a.fin && a.fin <= a.debut),
    budget: poids > budget.poidsMo * 1_000_000 || tri > budget.triangles,
    // Transcription du son (BNF-11) : seulement s'il y a un son à transcrire.
    transcription: !!a.sonId && !a.transcription.fr.trim(),
  }
  /** Affiches qui font surgir cette animation (une animation de lieu peut aussi sortir d'une affiche). */
  const affichesLiees = a.id ? etat.affiches.filter((x) => x.animationAfficheId === a.id) : []
  const [placementAffiche, setPlacementAffiche] = useState(affichesLiees.length > 0)
  const valide = !Object.values(erreurs).some(Boolean)

  async function enregistrer(publier: boolean) {
    setTente(true)
    setErreurServeur(null)
    if (!valide) return
    setEnvoi(true)
    try {
      await onEnregistrer(a, publier)
    } catch (e) {
      setErreurServeur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Tiroir
      ouvert
      large
      titre={animation.titre ? `Modifier « ${animation.titre} »` : a.type === 'LIEU' ? 'Nouvelle animation de monument' : 'Nouvelle animation d’affiche'}
      sousTitre="Suivez les étapes : modèle, placement, diffusion. Rien n’est visible des visiteurs avant « Enregistrer et activer »."
      onFermer={onFermer}
      pied={
        <>
          {onSupprimer && (
            <button type="button" className="btn btn-texte-danger" onClick={onSupprimer}>
              <Icone nom="poubelle" taille={15} /> Supprimer
            </button>
          )}
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-secondaire" onClick={() => enregistrer(false)} disabled={envoi}>
            Enregistrer
          </button>
          <button type="button" className="btn btn-primaire" onClick={() => enregistrer(true)} disabled={envoi}>
            Enregistrer et activer
          </button>
        </>
      }
    >
      <div className="formulaire-bo formulaire-etapes">
        <section className="etape-formulaire">
          <h3>
            <span>1</span> Animation
          </h3>
          <label className={`champ ${tente && erreurs.titre ? 'erreur' : ''}`}>
            <span className="etiquette">Titre</span>
            <input value={a.titre} onChange={(e) => maj({ titre: e.target.value })} maxLength={120} placeholder={a.type === 'LIEU' ? 'Ex. La légende des lumières' : 'Ex. Le traîneau du marché de Noël'} />
          </label>
          {!lieuImpose && (
            <div className="choix-type">
              {(['LIEU', 'AFFICHE'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={a.type === t ? 'actif' : ''}
                  disabled={t === 'LIEU' && !agent}
                  onClick={() => maj({ type: t, declencheur: t === 'AFFICHE' ? 'AFFICHE' : 'MONUMENT', lieuId: t === 'LIEU' ? (a.lieuId ?? etat.lieux[0]?.id) : undefined })}
                >
                  <Icone nom={t === 'LIEU' ? 'pin' : 'affiche'} taille={18} />
                  <strong>{t === 'LIEU' ? 'Animation de monument' : 'Animation d’affiche'}</strong>
                  <small>{t === 'LIEU' ? 'Grande animation placée autour d’un bâtiment' : 'Courte, elle surgit de l’affiche scannée'}</small>
                  {t === 'LIEU' && !agent && <em>Réservé aux agents</em>}
                </button>
              ))}
            </div>
          )}
          {a.type === 'LIEU' && (
            <div className="grille-champs">
              <label className={`champ ${tente && erreurs.lieu ? 'erreur' : ''}`}>
                <span className="etiquette">Monument</span>
                <select value={a.lieuId ?? ''} onChange={(e) => maj({ lieuId: e.target.value, placement: undefined })} disabled={lieuImpose}>
                  {etat.lieux.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                      {l.actif ? '' : ' (masqué)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="champ">
                <span className="etiquette">Lancement</span>
                <select value={a.declencheur} onChange={(e) => maj({ declencheur: e.target.value as Declencheur })}>
                  <option value="MONUMENT">Automatique dès que le visiteur arrive dans le rayon</option>
                  <option value="MANUEL">Le visiteur appuie sur « Lancer » dans le rayon</option>
                </select>
              </label>
            </div>
          )}
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>2</span> Modèle 3D et son
          </h3>
          {erreurImport && (
            <p className="erreur-acces" role="alert">
              <Icone nom="alerte" taille={15} />
              {erreurImport}
            </p>
          )}
          <div className="grille-champs">
            <label className={`champ ${tente && erreurs.modele ? 'erreur' : ''}`}>
              <span className="etiquette">
                Modèle 3D {boutonImport('MODELE_3D')}
              </span>
              <select value={a.modeleId ?? ''} onChange={(e) => maj({ modeleId: e.target.value || undefined, clipIndice: undefined })}>
                <option value="">Choisir un modèle conforme…</option>
                {modeles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nomOriginal} · {formaterPoids(f.tailleOctets)}
                    {f.clips?.length ? ` · ${f.clips.length} animation${f.clips.length > 1 ? 's' : ''}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              <span className="etiquette">
                Son <small>Facultatif</small> {boutonImport('SON')}
              </span>
              <select value={a.sonId ?? ''} onChange={(e) => maj({ sonId: e.target.value || undefined })}>
                <option value="">Aucun son</option>
                {sons.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nomOriginal} · {f.dureeS} s
                  </option>
                ))}
              </select>
            </label>
            {clipsModele.length > 0 && (
              <>
                <label className="champ">
                  <span className="etiquette">
                    Animation du modèle <small>Intégrée au fichier GLB</small>
                  </span>
                  <select value={a.clipIndice ?? ''} onChange={(e) => maj({ clipIndice: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">Toutes les animations ensemble</option>
                    {clipsModele.map((c, i) => (
                      <option key={`${i}-${c.nom}`} value={c.indice ?? i}>
                        {c.nom} · {c.dureeS.toString().replace('.', ',')} s
                      </option>
                    ))}
                  </select>
                </label>
                <label className="champ">
                  <span className="etiquette">Lecture</span>
                  <select value={a.lecture ?? 'BOUCLE'} onChange={(e) => maj({ lecture: e.target.value as 'BOUCLE' | 'UNE_FOIS' })}>
                    <option value="BOUCLE">En boucle pendant la durée de l’animation</option>
                    <option value="UNE_FOIS">Une seule fois</option>
                  </select>
                </label>
              </>
            )}
          </div>
          {fichierModele && (
            <div className="ouvrir-atelier">
              <div>
                <strong>Orientation, ancrage, vitesse, luminosité, optimisation</strong>
                <small>
                  Redressez le modèle s’il est couché ou tourné, allégez-le si besoin, en le voyant {a.type === 'AFFICHE' ? 'sur l’affiche' : 'au monument'}. La taille se règle à l’étape 3.
                </small>
              </div>
              <button type="button" className="btn btn-secondaire" onClick={() => setAtelier(true)}>
                <Icone nom="reglages" taille={15} /> Régler dans l’atelier 3D
              </button>
            </div>
          )}
          <div className={`budget ${erreurs.budget ? 'depasse' : ''}`}>
            <small>Budget {a.type === 'AFFICHE' ? 'animation d’affiche' : 'animation de monument'}</small>
            <div>
              <span>
                {formaterPoids(poids)} / {budget.poidsMo} Mo
              </span>
              <span>
                {tri.toLocaleString('fr-FR')} / {budget.triangles.toLocaleString('fr-FR')} triangles
              </span>
            </div>
          </div>
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>3</span> {a.type === 'LIEU' ? 'Placement autour du bâtiment' : 'Placement sur l’affiche'}
          </h3>
          {a.type === 'LIEU' && lieuChoisi && <PositionEspace placement={a.placement} lieu={lieuChoisi} modele={modeleCarte} onChange={(placement) => maj({ placement })} />}
          {a.type === 'LIEU' && !lieuChoisi && <p className="aide">Choisissez d’abord le monument.</p>}
          {a.type === 'LIEU' && (
            <details className="placement-sur-affiche" open={placementAffiche} onToggle={(e) => setPlacementAffiche(e.currentTarget.open)}>
              <summary>
                Quand elle sort d’une affiche
                <small>
                  {affichesLiees.length
                    ? `utilisée par ${affichesLiees.length} affiche${affichesLiees.length > 1 ? 's' : ''} : ${affichesLiees.map((x) => `« ${x.nom} »`).join(', ')}`
                    : 'si une affiche la choisit comme animation'}
                </small>
              </summary>
              {placementAffiche && (
                <EditeurPlacementAffiche reglage={a.reglageAffiche ?? REGLAGE_AFFICHE_RA_DEFAUT} modele={modeleCarte} animationId={a.id || undefined} onChange={(reglageAffiche) => maj({ reglageAffiche })} />
              )}
            </details>
          )}
          {a.type === 'AFFICHE' && (
            <EditeurPlacementAffiche reglage={a.reglageAffiche ?? REGLAGE_AFFICHE_RA_DEFAUT} modele={modeleCarte} animationId={a.id || undefined} onChange={(reglageAffiche) => maj({ reglageAffiche })} />
          )}
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>4</span> Diffusion
          </h3>
          <div className="grille-champs">
            <label className="champ">
              <span className="etiquette">Durée de l’animation (secondes)</span>
              <input type="number" min={5} max={1800} value={a.dureeS} onChange={(e) => maj({ dureeS: Number(e.target.value) })} />
            </label>
            <span />
            <label className="champ">
              <span className="etiquette">Date et heure de sortie</span>
              <input type="datetime-local" value={versLocal(a.debut)} onChange={(e) => maj({ debut: `${e.target.value}:00` })} />
            </label>
            <label className={`champ ${tente && erreurs.dates ? 'erreur' : ''}`}>
              <span className="etiquette">
                Fin <small>{a.type === 'LIEU' ? 'Vide = permanente' : 'Obligatoire'}</small>
              </span>
              <input type="datetime-local" value={versLocal(a.fin)} onChange={(e) => maj({ fin: e.target.value ? `${e.target.value}:00` : undefined })} />
              {tente && erreurs.dates && <span className="message-erreur">{!a.fin ? 'Indiquez la date de fin de l’animation d’affiche.' : 'La fin doit être postérieure à la sortie.'}</span>}
            </label>
          </div>
        </section>

        <section className={`etape-formulaire transcriptions ${tente && erreurs.transcription ? 'erreur' : ''}`}>
          <h3>
            <span>5</span> Transcription du son <small>{a.sonId ? 'accessibilité, FR obligatoire' : 'facultative : aucun son choisi'}</small>
          </h3>
          <Onglets
            valeur={langue}
            onChange={setLangue}
            options={[
              { id: 'fr', libelle: `Français${a.transcription.fr ? ' ✓' : ''}` },
              { id: 'en', libelle: `English${a.transcription.en ? ' ✓' : ''}` },
              { id: 'de', libelle: `Deutsch${a.transcription.de ? ' ✓' : ''}` },
            ]}
          />
          <textarea
            value={a.transcription[langue]}
            onChange={(e) => maj({ transcription: { ...a.transcription, [langue]: e.target.value } })}
            rows={3}
            placeholder="Décrivez les sons et la narration pour les personnes sourdes ou malentendantes…"
          />
        </section>
        {tente && !valide && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurs.budget
              ? 'Les fichiers dépassent le budget 3D de ce type d’animation : allégez le modèle dans l’atelier 3D.'
              : `À compléter : ${[erreurs.titre && 'titre (1)', erreurs.lieu && 'monument (1)', erreurs.modele && 'modèle 3D (2)', erreurs.dates && 'dates (4)', erreurs.transcription && 'transcription française du son (5)'].filter(Boolean).join(', ')}.`}
          </p>
        )}
        {erreurServeur && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurServeur}
          </p>
        )}
      </div>
      {atelier && fichierModele && (
        <Suspense fallback={null}>
          <Atelier3D key={fichierModele.id} fichier={fichierModele} animation={a} onReglageAffiche={(reglageAffiche) => maj({ reglageAffiche })} onFermer={() => setAtelier(false)} />
        </Suspense>
      )}
    </Tiroir>
  )
}

/**
 * Placement en 3D d'une animation de lieu : le modèle est dessiné sur une carte satellite avec les
 * bâtiments en relief ; on le place où l'on veut autour du bâtiment (position, hauteur, orientation,
 * taille). Le téléphone du visiteur le pose à cet endroit (GPS + boussole, repère SLAM) dès qu'il est
 * dans le rayon du monument.
 */
function PositionEspace({
  placement,
  lieu,
  modele,
  onChange,
}: {
  placement?: PlacementGps
  lieu: { nom: string; latitude: number; longitude: number; rayonM: number }
  modele?: Pick<Animation, 'modeleUrl' | 'reglages3d' | 'clipIndice' | 'lecture'>
  onChange: (p: PlacementGps | undefined) => void
}) {
  // Nouvelle position personnalisée : posée au sol, à côté du point du lieu, face au sud.
  const nouveau: PlacementGps = { latitude: lieu.latitude, longitude: lieu.longitude, hauteurM: 0, tailleM: PLACEMENT_LIEU_DEFAUT.tailleM, orientationDeg: 180 }
  return (
    <fieldset className="position-espace">
      <legend>Placement de l’animation autour du bâtiment (3D)</legend>
      <label className="case-a-cocher">
        <input type="checkbox" checked={!!placement} onChange={(e) => onChange(e.target.checked ? nouveau : undefined)} />
        Placer l’animation moi-même
        <small>
          Sinon : au-dessus du point du lieu « {lieu.nom} », à {PLACEMENT_LIEU_DEFAUT.hauteurM} m de haut, {PLACEMENT_LIEU_DEFAUT.tailleM} m de taille, face au visiteur.
        </small>
      </label>
      {placement && <EditeurPlacement3D placement={placement} lieu={lieu} modele={modele} onChange={onChange} />}
      <small className="aide-champ">Sur le téléphone, la précision dépend du GPS et de la boussole (quelques mètres).</small>
    </fieldset>
  )
}
