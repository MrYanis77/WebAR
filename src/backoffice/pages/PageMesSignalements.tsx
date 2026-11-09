import { useState } from 'react'
import { Icone } from '../../commun/Icone'
import { repondreDecision, useEtat } from '../../commun/store'
import { signalementsDuPartenaire, useSession } from '../session'
import { BadgeStatut, EnTetePage, formaterDate, Panneau, useToast, Vide } from '../ui'
import { LIBELLES_MOTIF } from './PageSignalements'

/** Signalements reçus par le partenaire, en lecture seule (BF-50, BNF-25), et réponse aux décisions. */
export default function PageMesSignalements() {
  const etat = useEtat()
  const session = useSession()
  const toast = useToast()
  const [reponses, setReponses] = useState<Record<string, string>>({})
  const signalements = signalementsDuPartenaire(etat, session.partenaireId)
  const mesAffiches = new Set(etat.affiches.filter((a) => a.proprietaireId === session.partenaireId).map((a) => a.id))
  const mesAnims = new Set(etat.animations.filter((a) => a.proprietaireId === session.partenaireId).map((a) => a.id))
  const decisions = etat.decisions.filter(
    (d) =>
      (d.contenuType === 'AFFICHE' && mesAffiches.has(d.contenuId)) ||
      (d.contenuType === 'ANIMATION' && mesAnims.has(d.contenuId)) ||
      (d.contenuType === 'COMPTE' && d.contenuId === session.partenaireId),
  )
  const nomContenu = (afficheId?: string, animationId?: string) =>
    afficheId ? `Affiche « ${etat.affiches.find((a) => a.id === afficheId)?.nom} »` : `Animation « ${etat.animations.find((a) => a.id === animationId)?.titre} »`

  return (
    <>
      <EnTetePage titre="Signalements reçus" description="Signalements anonymes concernant vos contenus et décisions de la mairie. Vous pouvez répondre ou demander un réexamen." />
      <div className="bo-defilement">
        <p className="note-anonyme">
          <Icone nom="bouclier" taille={15} /> Lecture seule : vous ne pouvez ni modifier, ni clore, ni supprimer un signalement. L’identité des visiteurs n’est jamais connue.
        </p>
        <div className="grille-deux">
          <Panneau titre="Signalements" sousTitre={`${signalements.length} au total`}>
            {signalements.length === 0 ? (
              <Vide icone="drapeau" titre="Aucun signalement" texte="Aucun visiteur n’a signalé vos contenus." />
            ) : (
              <ul className="liste-signalements">
                {signalements.map((s) => (
                  <li key={s.id}>
                    <div>
                      <span className="pill pill-wine">{LIBELLES_MOTIF[s.motif]}</span>
                      <small>{formaterDate(s.creeLe, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                      <BadgeStatut statut={s.statut} />
                    </div>
                    <strong>{nomContenu(s.afficheId, s.animationId)}</strong>
                    <p>{s.commentaire ? `« ${s.commentaire} »` : <em>Sans commentaire</em>}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
          <Panneau titre="Décisions de la mairie">
            {decisions.length === 0 ? (
              <Vide icone="marteau" titre="Aucune décision" />
            ) : (
              <ul className="liste-decisions">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <div className="tete-decision">
                      <span className={`pill ${d.action === 'MAINTENIR' || d.action === 'REACTIVER' ? 'pill-green' : 'pill-wine'}`}>{d.action.toLowerCase()}</span>
                      <small>{formaterDate(d.decideLe, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <strong>{d.contenuType === 'COMPTE' ? 'Votre compte' : d.contenuType === 'AFFICHE' ? nomContenu(d.contenuId) : nomContenu(undefined, d.contenuId)}</strong>
                    <p>Motif : {d.motif}</p>
                    {d.reponsePartenaire ? (
                      <p className="reponse">
                        Votre réponse{d.reexamenDemande ? ' (réexamen demandé)' : ''} : « {d.reponsePartenaire} »
                      </p>
                    ) : (
                      <div className="repondre">
                        <textarea
                          rows={2}
                          maxLength={1000}
                          placeholder="Votre réponse à la mairie…"
                          value={reponses[d.id] ?? ''}
                          onChange={(e) => setReponses({ ...reponses, [d.id]: e.target.value })}
                        />
                        <div>
                          <button
                            type="button"
                            className="btn btn-fantome"
                            disabled={!reponses[d.id]?.trim()}
                            onClick={() => {
                              repondreDecision(d.id, reponses[d.id].trim(), false)
                              toast.afficher('Réponse envoyée à la mairie')
                            }}
                          >
                            Répondre
                          </button>
                          <button
                            type="button"
                            className="btn btn-primaire"
                            disabled={!reponses[d.id]?.trim()}
                            onClick={() => {
                              repondreDecision(d.id, reponses[d.id].trim(), true)
                              toast.afficher('Demande de réexamen envoyée')
                            }}
                          >
                            Demander un réexamen
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panneau>
        </div>
      </div>
      {toast.element}
    </>
  )
}
