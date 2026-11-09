import { useMemo, useState } from 'react'
import { Icone } from '../../commun/Icone'
import { decider, nomProprietaire, prendreEnCharge, useEtat } from '../../commun/store'
import type { ActionDecision, MotifSignalement, Signalement } from '../../commun/types'
import { BadgeStatut, DialogueMotif, EnTetePage, formaterDate, Onglets, Panneau, useToast, Vide } from '../ui'

export const LIBELLES_MOTIF: Record<MotifSignalement, string> = {
  ILLICITE: 'Contenu illicite',
  TROMPEUR: 'Contenu trompeur',
  CHOQUANT: 'Choquant ou inapproprié',
  PARTISAN: 'Contenu partisan',
  ATTEINTE_DROITS: 'Atteinte aux droits',
  AUTRE: 'Autre',
}

interface Groupe {
  cle: string
  type: 'AFFICHE' | 'ANIMATION'
  id: string
  nom: string
  proprietaireId: string
  statutContenu: string
  signalements: Signalement[]
  statut: 'NOUVEAU' | 'EN_COURS' | 'TRAITE'
}

/** File des signalements, regroupés par contenu avec compteur (BF-48), et décision motivée (BF-49). */
export default function PageSignalements() {
  const etat = useEtat()
  const toast = useToast()
  const [filtre, setFiltre] = useState<'a-traiter' | 'traites' | 'tous'>('a-traiter')
  const [selection, setSelection] = useState<string | null>(null)
  const [action, setAction] = useState<ActionDecision | null>(null)

  const groupes = useMemo<Groupe[]>(() => {
    const map = new Map<string, Groupe>()
    for (const s of etat.signalements) {
      const type = s.afficheId ? 'AFFICHE' : 'ANIMATION'
      const id = (s.afficheId ?? s.animationId)!
      const cle = `${type}-${id}`
      if (!map.has(cle)) {
        const c = type === 'AFFICHE' ? etat.affiches.find((a) => a.id === id) : etat.animations.find((a) => a.id === id)
        map.set(cle, {
          cle,
          type,
          id,
          nom: c ? ('nom' in c ? c.nom : c.titre) : 'Contenu supprimé',
          proprietaireId: c?.proprietaireId ?? '',
          statutContenu: c?.statut ?? 'RETIREE',
          signalements: [],
          statut: 'TRAITE',
        })
      }
      map.get(cle)!.signalements.push(s)
    }
    for (const g of map.values()) {
      g.signalements.sort((a, b) => b.creeLe.localeCompare(a.creeLe))
      g.statut = g.signalements.some((s) => s.statut === 'NOUVEAU') ? 'NOUVEAU' : g.signalements.some((s) => s.statut === 'EN_COURS') ? 'EN_COURS' : 'TRAITE'
    }
    return [...map.values()].sort((a, b) => b.signalements[0].creeLe.localeCompare(a.signalements[0].creeLe))
  }, [etat])

  const liste = groupes.filter((g) => filtre === 'tous' || (filtre === 'traites' ? g.statut === 'TRAITE' : g.statut !== 'TRAITE'))
  const courant = groupes.find((g) => g.cle === selection) ?? liste[0]
  const ouverts = courant?.signalements.filter((s) => s.statut !== 'TRAITE').map((s) => s.id) ?? []
  const historique = courant ? etat.decisions.filter((d) => d.contenuId === courant.id) : []

  const libelles: Record<ActionDecision, string> = { MAINTENIR: 'Maintenir le contenu', SUSPENDRE: 'Suspendre le contenu', SUPPRIMER: 'Supprimer le contenu', REACTIVER: 'Réactiver le contenu' }

  return (
    <>
      <EnTetePage titre="Signalements" description="Modérez les contenus signalés par les visiteurs. Les signalements sont anonymes ; le partenaire est notifié de chaque décision." />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { id: 'a-traiter', libelle: 'À traiter', compte: groupes.filter((g) => g.statut !== 'TRAITE').length },
              { id: 'traites', libelle: 'Traités', compte: groupes.filter((g) => g.statut === 'TRAITE').length },
              { id: 'tous', libelle: 'Tous', compte: groupes.length },
            ]}
          />
        </div>
        {liste.length === 0 ? (
          <Vide icone="drapeau" titre="Aucun signalement à traiter" texte="Les nouveaux signalements apparaissent ici en moins de 5 minutes." />
        ) : (
          <div className="grille-maitre-detail">
            <Panneau className="file">
              <ul className="file-signalements">
                {liste.map((g) => (
                  <li key={g.cle}>
                    <button type="button" className={courant?.cle === g.cle ? 'actif' : ''} onClick={() => setSelection(g.cle)}>
                      <span className={`compteur ${g.statut === 'NOUVEAU' ? 'nouveau' : ''}`}>{g.signalements.length}</span>
                      <div>
                        <strong>{g.nom}</strong>
                        <small>
                          {g.type === 'AFFICHE' ? 'Affiche' : 'Animation'} · {nomProprietaire(etat, g.proprietaireId)}
                        </small>
                        <small>
                          {LIBELLES_MOTIF[g.signalements[0].motif]} · {formaterDate(g.signalements[0].creeLe, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </div>
                      <BadgeStatut statut={g.statut} />
                    </button>
                  </li>
                ))}
              </ul>
            </Panneau>

            {courant && (
              <Panneau className="detail">
                <div className="detail-tete">
                  <div>
                    <span className="eyebrow">{courant.type === 'AFFICHE' ? 'Affiche' : 'Animation'}</span>
                    <h2>{courant.nom}</h2>
                    <p>
                      {nomProprietaire(etat, courant.proprietaireId)} · contenu <BadgeStatut statut={courant.statutContenu} />
                    </p>
                  </div>
                  {courant.statut === 'NOUVEAU' && (
                    <button type="button" className="btn btn-fantome" onClick={() => prendreEnCharge(ouverts)}>
                      Prendre en charge
                    </button>
                  )}
                </div>
                <p className="note-anonyme">
                  <Icone nom="bouclier" taille={14} /> Aucune information sur les auteurs n’est conservée. Le contenu reste diffusé pendant le traitement.
                </p>
                <ul className="liste-signalements">
                  {courant.signalements.map((s) => (
                    <li key={s.id}>
                      <div>
                        <span className="pill pill-wine">{LIBELLES_MOTIF[s.motif]}</span>
                        <small>{formaterDate(s.creeLe, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                        <BadgeStatut statut={s.statut} />
                      </div>
                      <p>{s.commentaire ? `« ${s.commentaire} »` : <em>Sans commentaire</em>}</p>
                    </li>
                  ))}
                </ul>
                {ouverts.length > 0 && (
                  <div className="decision">
                    <strong>Décision</strong>
                    <div className="boutons-decision">
                      <button type="button" className="btn btn-fantome" onClick={() => setAction('MAINTENIR')}>
                        <Icone nom="check" taille={15} /> Maintenir
                      </button>
                      <button type="button" className="btn btn-secondaire" onClick={() => setAction('SUSPENDRE')}>
                        <Icone nom="pause" taille={15} /> Suspendre
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => setAction('SUPPRIMER')}>
                        <Icone nom="poubelle" taille={15} /> Supprimer
                      </button>
                    </div>
                    <small>La suppression met fin immédiatement à la diffusion (moins de 5 min) ; la trace est conservée.</small>
                  </div>
                )}
                {historique.length > 0 && (
                  <div className="historique">
                    <strong>Historique des décisions</strong>
                    {historique.map((d) => (
                      <div key={d.id} className="entree-historique">
                        <span className="pill pill-ink">{d.action.toLowerCase()}</span>
                        <div>
                          <p>{d.motif}</p>
                          <small>
                            {d.agent} · {formaterDate(d.decideLe, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </small>
                          {d.reponsePartenaire && (
                            <p className="reponse">
                              Réponse du partenaire {d.reexamenDemande && <b>· réexamen demandé</b>} : « {d.reponsePartenaire} »
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panneau>
            )}
          </div>
        )}
      </div>
      <DialogueMotif
        ouvert={!!action}
        titre={action ? libelles[action] : ''}
        description={`${courant?.nom ?? ''} · ${ouverts.length} signalement(s) clôturé(s). Le partenaire reçoit la décision et son motif par mail et dans son espace.`}
        libelleConfirmer="Confirmer la décision"
        danger={action === 'SUPPRIMER'}
        suggestions={
          action === 'MAINTENIR'
            ? ['Contenu conforme à la charte après examen.']
            : action === 'SUSPENDRE'
              ? ['Informations trompeuses à corriger avant remise en ligne.', 'Son trop fort au démarrage, à corriger.']
              : ['Contenu manifestement illicite.', 'Atteinte avérée aux droits d’un tiers.']
        }
        onFermer={() => setAction(null)}
        onConfirmer={(motif) => {
          if (courant && action) {
            decider(courant.type, courant.id, action, motif, ouverts)
            toast.afficher(`Décision enregistrée — ${nomProprietaire(etat, courant.proprietaireId)} notifié par mail`)
          }
          setAction(null)
        }}
      />
      {toast.element}
    </>
  )
}
