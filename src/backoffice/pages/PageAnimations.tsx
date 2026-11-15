import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D, MODELE_3D_MAX_MO } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { animationActive, attendreControle, basculerAnimation, enregistrerAnimation, importerFichier, nomProprietaire, supprimerAnimation, useEtat, validerFichier } from '../../commun/store'
import type { Animation, Declencheur, TypeAnimation } from '../../commun/types'
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

function EditeurAnimation({
  animation,
  onFermer,
  onEnregistrer,
  onSupprimer,
}: {
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

  const erreurs = {
    titre: !a.titre.trim(),
    lieu: a.type === 'LIEU' && !a.lieuId,
    modele: !a.modeleId,
    dates: !!a.fin && a.fin <= a.debut,
    budget: poids > budget.poidsMo * 1_000_000 || tri > budget.triangles,
    transcription: !a.transcription.fr.trim(),
  }
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
      titre={animation.titre ? 'Modifier l’animation' : 'Nouvelle animation'}
      sousTitre="Paramétrez le lieu, le déclencheur, la durée et la période de diffusion."
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
      <div className="formulaire-bo">
        <label className={`champ ${tente && erreurs.titre ? 'erreur' : ''}`}>
          <span className="etiquette">Titre</span>
          <input value={a.titre} onChange={(e) => maj({ titre: e.target.value })} maxLength={120} placeholder="Ex. La légende des lumières" />
        </label>
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
              <strong>{t === 'LIEU' ? 'Animation de lieu' : 'Animation d’affiche'}</strong>
              <small>{t === 'LIEU' ? 'Grande animation ancrée sur un monument' : 'Courte, promotionnelle, sur l’affiche'}</small>
              {t === 'LIEU' && !agent && <em>Réservé aux agents</em>}
            </button>
          ))}
        </div>
        {erreurImport && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurImport}
          </p>
        )}
        <div className="grille-champs">
          {a.type === 'LIEU' && (
            <label className={`champ ${tente && erreurs.lieu ? 'erreur' : ''}`}>
              <span className="etiquette">Lieu</span>
              <select value={a.lieuId ?? ''} onChange={(e) => maj({ lieuId: e.target.value })}>
                {etat.lieux.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nom}
                    {l.actif ? '' : ' (inactif)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="champ">
            <span className="etiquette">Déclencheur</span>
            <select value={a.declencheur} onChange={(e) => maj({ declencheur: e.target.value as Declencheur })}>
              {a.type === 'AFFICHE' ? (
                <option value="AFFICHE">Reconnaissance de l’affiche</option>
              ) : (
                <>
                  <option value="MONUMENT">Reconnaissance du monument (+ secours GPS)</option>
                  <option value="MANUEL">Lancement manuel dans le rayon</option>
                </>
              )}
            </select>
          </label>
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
          <label className="champ">
            <span className="etiquette">Durée (secondes)</span>
            <input type="number" min={5} max={1800} value={a.dureeS} onChange={(e) => maj({ dureeS: Number(e.target.value) })} />
          </label>
          <div className={`budget ${erreurs.budget ? 'depasse' : ''}`}>
            <small>Budget {a.type === 'AFFICHE' ? 'animation d’affiche' : 'animation de lieu'}</small>
            <div>
              <span>
                {formaterPoids(poids)} / {budget.poidsMo} Mo
              </span>
              <span>
                {tri.toLocaleString('fr-FR')} / {budget.triangles.toLocaleString('fr-FR')} triangles
              </span>
            </div>
          </div>
          <label className="champ">
            <span className="etiquette">Date et heure de sortie</span>
            <input type="datetime-local" value={versLocal(a.debut)} onChange={(e) => maj({ debut: `${e.target.value}:00` })} />
          </label>
          <label className={`champ ${tente && erreurs.dates ? 'erreur' : ''}`}>
            <span className="etiquette">
              Fin <small>{a.type === 'LIEU' ? 'Vide = permanente' : 'Obligatoire'}</small>
            </span>
            <input type="datetime-local" value={versLocal(a.fin)} onChange={(e) => maj({ fin: e.target.value ? `${e.target.value}:00` : undefined })} />
            {tente && erreurs.dates && <span className="message-erreur">La fin doit être postérieure à la sortie.</span>}
          </label>
        </div>
        <fieldset className={`transcriptions ${tente && erreurs.transcription ? 'erreur' : ''}`}>
          <legend>Transcription du son (accessibilité, FR/EN/DE)</legend>
          <Onglets
            valeur={langue}
            onChange={setLangue}
            options={[
              { id: 'fr', libelle: 'Français' },
              { id: 'en', libelle: 'English' },
              { id: 'de', libelle: 'Deutsch' },
            ]}
          />
          <textarea
            value={a.transcription[langue]}
            onChange={(e) => maj({ transcription: { ...a.transcription, [langue]: e.target.value } })}
            rows={3}
            placeholder="Décrivez les sons et la narration pour les personnes sourdes ou malentendantes…"
          />
        </fieldset>
        {tente && !valide && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurs.budget ? 'Les fichiers dépassent le budget 3D de ce type d’animation.' : 'Complétez les champs signalés (titre, modèle, transcription française…).'}
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
