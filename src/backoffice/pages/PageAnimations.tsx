import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { animationActive, basculerAnimation, enregistrerAnimation, nomProprietaire, supprimerAnimation, useEtat } from '../../commun/store'
import type { Animation, Declencheur, TypeAnimation } from '../../commun/types'
import { SonEtDuree, useReglagesModele } from '../composants/atelier/OutilsAtelier'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, EnTetePage, formaterDate, formaterPoids, Interrupteur, maintenantLocal, Onglets, Recherche, Tiroir, useToast, Vide } from '../ui'

const AtelierAffiche = lazy(() => import('../composants/atelier/AtelierAffiche'))
const AtelierMonument = lazy(() => import('../composants/atelier/AtelierMonument'))

const chargementAtelier = (
  <div className="atelier-chargement statique">
    <span className="spinner" /> Ouverture de l’atelier…
  </div>
)

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
 * Formulaire d'une animation, en étapes numérotées : 1. type et lieu, 2. modèle et placement 3D (dans
 * l'atelier : position, rotation, taille, rendu, fichier — le même que dans la création d'affiche et de
 * monument), 3. son et accessibilité, 4. diffusion. `lieuImpose` : l'animation reste rattachée à son monument.
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
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreurServeur, setErreurServeur] = useState<string | null>(null)
  const maj = (p: Partial<Animation>) => setA((x) => ({ ...x, ...p }))
  const fichierModele = etat.fichiers.find((f) => f.id === a.modeleId)
  const modele = useReglagesModele(fichierModele)
  const lieuChoisi = etat.lieux.find((l) => l.id === a.lieuId)
  const budget = BUDGETS_3D[a.type]
  const poids = (fichierModele?.tailleOctets ?? 0) + (etat.fichiers.find((f) => f.id === a.sonId)?.tailleOctets ?? 0)
  const tri = fichierModele?.nbTriangles ?? 0

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
      if (fichierModele && (agent || fichierModele.proprietaireId === session.partenaireId)) await modele.enregistrer()
      await onEnregistrer(a, publier)
    } catch (e) {
      setErreurServeur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  const atelierCommun = { animation: a, onAnimation: maj, reglages3d: modele.reglages, onReglages3d: modele.setReglages, compact: true, erreurModele: tente && erreurs.modele }

  return (
    <Tiroir
      ouvert
      large
      titre={animation.titre ? `Modifier « ${animation.titre} »` : a.type === 'LIEU' ? 'Nouvelle animation de monument' : 'Nouvelle animation d’affiche'}
      sousTitre="Suivez les étapes : modèle et placement 3D, son, diffusion. Rien n’est visible des visiteurs avant « Enregistrer et activer »."
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
          {!lieuImpose && !a.id && (
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
          {affichesLiees.length > 0 && (
            <p className="note-partage">
              <Icone nom="affiche" taille={14} /> Sort de {affichesLiees.length > 1 ? 'ces affiches' : 'l’affiche'} :{' '}
              {affichesLiees.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ', '}
                  <Link to={`/backoffice/affiches/${x.id}`} state={{ etape: 3 }}>
                    « {x.nom} »
                  </Link>
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>2</span> {a.type === 'LIEU' ? 'Modèle et placement autour du bâtiment' : 'Modèle et placement sur l’affiche'}
          </h3>
          <p className="aide">Choisissez le modèle, puis réglez sa position, sa rotation et sa taille avec les outils de l’atelier.</p>
          <Suspense fallback={chargementAtelier}>
            {a.type === 'AFFICHE' && <AtelierAffiche {...atelierCommun} />}
            {a.type === 'LIEU' && lieuChoisi && <AtelierMonument {...atelierCommun} lieu={lieuChoisi} />}
          </Suspense>
          {a.type === 'LIEU' && !lieuChoisi && <p className="aide">Choisissez d’abord le monument.</p>}
          {a.type === 'LIEU' && a.modeleId && (
            <details className="details-etape" open={placementAffiche} onToggle={(e) => setPlacementAffiche(e.currentTarget.open)}>
              <summary>
                <Icone nom="affiche" taille={16} />
                <strong>Quand elle sort d’une affiche</strong>
                <small>{affichesLiees.length ? `utilisée par ${affichesLiees.length} affiche${affichesLiees.length > 1 ? 's' : ''}` : 'si une affiche la choisit comme animation'}</small>
              </summary>
              {placementAffiche && (
                <Suspense fallback={chargementAtelier}>
                  <AtelierAffiche {...atelierCommun} choixModele={false} />
                </Suspense>
              )}
            </details>
          )}
          {tente && erreurs.budget && (
            <p className="erreur-acces" role="alert">
              <Icone nom="alerte" taille={15} /> {formaterPoids(poids)} et {tri.toLocaleString('fr-FR')} triangles : au-delà du budget ({budget.poidsMo} Mo, {budget.triangles.toLocaleString('fr-FR')} triangles). Allégez le modèle avec l’outil « Fichier ».
            </p>
          )}
        </section>

        <section className={`etape-formulaire ${tente && erreurs.transcription ? 'erreur' : ''}`}>
          <h3>
            <span>3</span> Son et durée <small>{a.sonId ? 'transcription FR obligatoire' : 'son facultatif'}</small>
          </h3>
          <SonEtDuree animation={a} onChange={maj} tente={tente} />
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>4</span> Diffusion
          </h3>
          <div className="grille-champs">
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
        {tente && !valide && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurs.budget
              ? 'Les fichiers dépassent le budget 3D de ce type d’animation : allégez le modèle avec l’outil « Fichier » de l’atelier.'
              : `À compléter : ${[erreurs.titre && 'titre (1)', erreurs.lieu && 'monument (1)', erreurs.modele && 'modèle 3D (2)', erreurs.transcription && 'transcription française du son (3)', erreurs.dates && 'dates (4)'].filter(Boolean).join(', ')}.`}
          </p>
        )}
        {erreurServeur && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurServeur}
          </p>
        )}
      </div>
    </Tiroir>
  )
}
