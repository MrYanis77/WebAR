import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { animationActive, basculerAnimation, enregistrerAnimation, nomProprietaire, uid, useEtat } from '../../commun/store'
import type { Animation, Declencheur, TypeAnimation } from '../../commun/types'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, EnTetePage, formaterDate, formaterPoids, Interrupteur, Onglets, Recherche, Tiroir, useToast, Vide } from '../ui'

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
  const autorise = peutCreer(etat, session)

  const visibles = etat.animations.filter((a) => agent || a.proprietaireId === session.partenaireId)
  const liste = visibles
    .filter((a) => filtre === 'toutes' || etatAnimation(a).cle === filtre)
    .filter((a) => type === 'tous' || a.type === type)
    .filter((a) => a.titre.toLowerCase().includes(texte.toLowerCase()))
  const compte = (f: Filtre) => visibles.filter((a) => etatAnimation(a).cle === f).length

  function nouvelle() {
    setEdition({
      id: uid('anim'),
      proprietaireId: proprietaireDe(session),
      titre: '',
      type: agent ? 'LIEU' : 'AFFICHE',
      lieuId: agent ? etat.lieux[0]?.id : undefined,
      declencheur: agent ? 'MONUMENT' : 'AFFICHE',
      dureeS: agent ? 300 : 15,
      debut: new Date().toISOString().slice(0, 16) + ':00',
      statut: 'BROUILLON',
      transcription: { fr: '', en: '', de: '' },
      lancements: 0,
      modifieLe: new Date().toISOString().slice(0, 19),
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
              const image = imageLieu(lieu?.image)
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
                          toast.afficher(a.statut === 'PUBLIEE' ? `« ${a.titre} » désactivée` : `« ${a.titre} » activée`)
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
                      <button type="button" onClick={() => setEdition(a)} disabled={verrou}>
                        Modifier <Icone nom="droite" taille={13} />
                      </button>
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
          onEnregistrer={(a) => {
            enregistrerAnimation(a)
            setEdition(null)
            toast.afficher(`Animation « ${a.titre} » enregistrée`)
          }}
        />
      )}
      {toast.element}
    </>
  )
}

function EditeurAnimation({ animation, onFermer, onEnregistrer }: { animation: Animation; onFermer: () => void; onEnregistrer: (a: Animation) => void }) {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  const [a, setA] = useState<Animation>(animation)
  const [langue, setLangue] = useState<'fr' | 'en' | 'de'>('fr')
  const [tente, setTente] = useState(false)
  const maj = (p: Partial<Animation>) => setA({ ...a, ...p })

  const fichiers = useMemo(
    () => etat.fichiers.filter((f) => f.statutControle === 'CONFORME' && (agent || f.proprietaireId === session.partenaireId)),
    [etat.fichiers, agent, session.partenaireId],
  )
  const modeles = fichiers.filter((f) => f.type === 'MODELE_3D')
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

  function enregistrer(publier: boolean) {
    setTente(true)
    if (!valide) return
    onEnregistrer({ ...a, statut: publier ? 'PUBLIEE' : a.statut === 'PUBLIEE' ? 'PUBLIEE' : 'BROUILLON', modifieLe: new Date().toISOString().slice(0, 19) })
  }

  return (
    <Tiroir
      ouvert
      titre={animation.titre ? 'Modifier l’animation' : 'Nouvelle animation'}
      sousTitre="Paramétrez le lieu, le déclencheur, la durée et la période de diffusion."
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-secondaire" onClick={() => enregistrer(false)}>
            Enregistrer
          </button>
          <button type="button" className="btn btn-primaire" onClick={() => enregistrer(true)}>
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
            <span className="etiquette">Modèle 3D</span>
            <select value={a.modeleId ?? ''} onChange={(e) => maj({ modeleId: e.target.value || undefined })}>
              <option value="">Choisir un modèle conforme…</option>
              {modeles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nomOriginal} · {formaterPoids(f.tailleOctets)}
                </option>
              ))}
            </select>
          </label>
          <label className="champ">
            <span className="etiquette">
              Son <small>Facultatif</small>
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
      </div>
    </Tiroir>
  )
}
