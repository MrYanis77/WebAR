import { useState } from 'react'
import { Icone } from '../../commun/Icone'
import { cloreReexamen, decider, deciderCompte, nomProprietaire, useEtat } from '../../commun/store'
import type { ActionDecision, Decision } from '../../commun/types'
import { BadgeStatut, DialogueMotif, EnTetePage, formaterDate, Onglets, Panneau, Recherche, useToast } from '../ui'

interface Cible {
  type: 'AFFICHE' | 'ANIMATION'
  id: string
  nom: string
  action: ActionDecision
}

/** Suspendre, réactiver ou retirer tout contenu à tout moment, avec motif (BF-44), et traiter les réexamens. */
export default function PageModeration() {
  const etat = useEtat()
  const toast = useToast()
  const [onglet, setOnglet] = useState<'affiches' | 'animations' | 'reexamens' | 'historique'>('affiches')
  const [texte, setTexte] = useState('')
  const [cible, setCible] = useState<Cible | null>(null)
  const [reexamen, setReexamen] = useState<{ d: Decision; accepte: boolean } | null>(null)

  const nbSignalements = (id: string) => etat.signalements.filter((s) => (s.afficheId ?? s.animationId) === id && s.statut !== 'TRAITE').length
  const lignes =
    onglet === 'affiches'
      ? etat.affiches.map((a) => ({ type: 'AFFICHE' as const, id: a.id, nom: a.nom, proprio: a.proprietaireId, statut: a.statut, maj: a.modifieLe }))
      : etat.animations.map((a) => ({ type: 'ANIMATION' as const, id: a.id, nom: a.titre, proprio: a.proprietaireId, statut: a.statut, maj: a.modifieLe }))
  const filtrees = lignes.filter((l) => `${l.nom} ${nomProprietaire(etat, l.proprio)}`.toLowerCase().includes(texte.toLowerCase()))
  const reexamens = etat.decisions.filter((d) => d.reexamenDemande)
  const nomContenu = (d: Decision) =>
    d.contenuType === 'COMPTE'
      ? `Compte ${nomProprietaire(etat, d.contenuId)}`
      : d.contenuType === 'AFFICHE'
        ? `Affiche « ${etat.affiches.find((a) => a.id === d.contenuId)?.nom} »`
        : `Animation « ${etat.animations.find((a) => a.id === d.contenuId)?.titre} »`

  return (
    <>
      <EnTetePage titre="Modération" description="Suspendez ou retirez à tout moment un contenu non conforme. Rien n’est effacé : le contenu passe au statut « retiré » et la décision est tracée." />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={onglet}
            onChange={setOnglet}
            options={[
              { id: 'affiches', libelle: 'Affiches', compte: etat.affiches.length },
              { id: 'animations', libelle: 'Animations', compte: etat.animations.length },
              { id: 'reexamens', libelle: 'Réexamens', compte: reexamens.length },
              { id: 'historique', libelle: 'Décisions', compte: etat.decisions.length },
            ]}
          />
          {(onglet === 'affiches' || onglet === 'animations') && <Recherche valeur={texte} onChange={setTexte} />}
        </div>

        {(onglet === 'affiches' || onglet === 'animations') && (
          <Panneau>
            <div className="table-defilante">
              <table className="table">
                <thead>
                  <tr>
                    <th>Contenu</th>
                    <th>Propriétaire</th>
                    <th>Statut</th>
                    <th>Signalements ouverts</th>
                    <th>Dernière modification</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrees.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.nom}</strong>
                      </td>
                      <td>{nomProprietaire(etat, l.proprio)}</td>
                      <td>
                        <BadgeStatut statut={l.statut} />
                      </td>
                      <td>{nbSignalements(l.id) > 0 ? <span className="pill pill-wine">{nbSignalements(l.id)}</span> : '—'}</td>
                      <td>{formaterDate(l.maj, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <div className="actions-ligne">
                          {l.statut === 'PUBLIEE' || l.statut === 'BROUILLON' ? (
                            <button type="button" className="btn btn-fantome petit" onClick={() => setCible({ type: l.type, id: l.id, nom: l.nom, action: 'SUSPENDRE' })}>
                              <Icone nom="pause" taille={13} /> Suspendre
                            </button>
                          ) : (
                            <button type="button" className="btn btn-secondaire petit" onClick={() => setCible({ type: l.type, id: l.id, nom: l.nom, action: 'REACTIVER' })}>
                              <Icone nom="relancer" taille={13} /> Réactiver
                            </button>
                          )}
                          {l.statut !== 'RETIREE' && (
                            <button type="button" className="btn btn-danger petit" onClick={() => setCible({ type: l.type, id: l.id, nom: l.nom, action: 'SUPPRIMER' })}>
                              <Icone nom="poubelle" taille={13} /> Retirer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panneau>
        )}

        {onglet === 'reexamens' && (
          <Panneau titre="Demandes de réexamen" sousTitre="Réponses des partenaires à une décision de la mairie">
            {reexamens.length === 0 ? (
              <p className="cellule-vide">Aucune demande en attente.</p>
            ) : (
              <ul className="liste-decisions">
                {reexamens.map((d) => (
                  <li key={d.id}>
                    <div className="tete-decision">
                      <span className="pill pill-wine">{d.action.toLowerCase()}</span>
                      <small>
                        Décision du {formaterDate(d.decideLe)} par {d.agent}
                      </small>
                    </div>
                    <strong>{nomContenu(d)}</strong>
                    <p>Motif initial : {d.motif}</p>
                    <p className="reponse">Réponse : « {d.reponsePartenaire} »</p>
                    <div className="actions-ligne">
                      <button type="button" className="btn btn-fantome petit" onClick={() => setReexamen({ d, accepte: false })}>
                        Maintenir la décision
                      </button>
                      <button type="button" className="btn btn-primaire petit" onClick={() => setReexamen({ d, accepte: true })}>
                        Lever la mesure
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        )}

        {onglet === 'historique' && (
          <Panneau>
            <div className="table-defilante">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Contenu</th>
                    <th>Action</th>
                    <th>Motif</th>
                    <th>Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {etat.decisions.map((d) => (
                    <tr key={d.id}>
                      <td>{formaterDate(d.decideLe, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{nomContenu(d)}</td>
                      <td>
                        <span className="pill pill-ink">{d.action.toLowerCase()}</span>
                      </td>
                      <td>{d.motif}</td>
                      <td>{d.agent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panneau>
        )}
      </div>

      <DialogueMotif
        ouvert={!!cible}
        titre={cible ? `${cible.action === 'SUSPENDRE' ? 'Suspendre' : cible.action === 'SUPPRIMER' ? 'Retirer' : 'Réactiver'} « ${cible.nom} »` : ''}
        description={cible?.action === 'REACTIVER' ? 'Le contenu sera de nouveau diffusé s’il respecte ses dates et ses conditions.' : 'La diffusion s’arrête en moins de 5 minutes. Le partenaire est notifié avec le motif et peut demander un réexamen.'}
        libelleConfirmer="Confirmer"
        danger={cible?.action === 'SUPPRIMER'}
        suggestions={cible?.action === 'REACTIVER' ? ['Corrections apportées par le partenaire.'] : ['Non-conformité à la charte (article 2).', 'Évolution des règles d’affichage de la Ville.']}
        onFermer={() => setCible(null)}
        onConfirmer={(motif) => {
          if (cible) {
            decider(cible.type, cible.id, cible.action, motif)
            toast.afficher('Décision enregistrée et notifiée')
          }
          setCible(null)
        }}
      />
      <DialogueMotif
        ouvert={!!reexamen}
        titre={reexamen?.accepte ? 'Lever la mesure' : 'Maintenir la décision'}
        description={reexamen ? nomContenu(reexamen.d) : ''}
        libelleConfirmer="Envoyer la réponse"
        onFermer={() => setReexamen(null)}
        onConfirmer={(motif) => {
          if (reexamen) {
            const { d, accepte } = reexamen
            if (accepte) {
              if (d.contenuType === 'COMPTE') deciderCompte(d.contenuId, 'VERIFIE', motif)
              else if (d.contenuType !== 'FICHIER') decider(d.contenuType, d.contenuId, 'REACTIVER', motif)
            }
            cloreReexamen(d.id, motif)
            toast.afficher('Réexamen clos — partenaire notifié')
          }
          setReexamen(null)
        }}
      />
      {toast.element}
    </>
  )
}
