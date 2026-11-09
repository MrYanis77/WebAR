import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icone } from '../../commun/Icone'
import { nomProprietaire, publiable, reglePublication, useEtat } from '../../commun/store'
import { ApercuAffiche, donneesAffiche } from '../composants/ApercuAffiche'
import { peutCreer, useSession } from '../session'
import { BadgeStatut, EnTetePage, formaterDate, Onglets, Recherche, Vide } from '../ui'

export default function PageAffiches() {
  const etat = useEtat()
  const session = useSession()
  const navigate = useNavigate()
  const agent = session.role === 'AGENT'
  const [filtre, setFiltre] = useState<'toutes' | 'publiees' | 'bloquees' | 'archivees'>('toutes')
  const [texte, setTexte] = useState('')

  const visibles = etat.affiches.filter((a) => agent || a.proprietaireId === session.partenaireId)
  const categorie = (a: (typeof visibles)[number]) =>
    a.statut === 'SUSPENDUE' || a.statut === 'RETIREE' || new Date(a.fin) < new Date() ? 'archivees' : a.statut === 'PUBLIEE' && publiable(reglePublication(etat, a)) ? 'publiees' : 'bloquees'
  const liste = visibles.filter((a) => filtre === 'toutes' || categorie(a) === filtre).filter((a) => a.nom.toLowerCase().includes(texte.toLowerCase()))

  return (
    <>
      <EnTetePage
        titre="Affiches"
        description="Créez et suivez tous vos supports de communication : un QR code unique par affiche, vers l’application uniquement."
        actions={
          <button type="button" className="btn btn-primaire" onClick={() => navigate('/backoffice/affiches/nouvelle')} disabled={!peutCreer(etat, session)}>
            <Icone nom="plus" taille={16} />
            Nouvelle affiche
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
              { id: 'publiees', libelle: 'Diffusées', compte: visibles.filter((a) => categorie(a) === 'publiees').length },
              { id: 'bloquees', libelle: 'À compléter', compte: visibles.filter((a) => categorie(a) === 'bloquees').length },
              { id: 'archivees', libelle: 'Archivées', compte: visibles.filter((a) => categorie(a) === 'archivees').length },
            ]}
          />
          <Recherche valeur={texte} onChange={setTexte} />
        </div>
        {liste.length === 0 ? (
          <Vide icone="affiche" titre="Aucune affiche" texte="Composez votre première affiche à partir d’un modèle de la Ville." />
        ) : (
          <div className="grille-affiches">
            {liste.map((a) => {
              const c = reglePublication(etat, a)
              const n = Object.values(c).filter(Boolean).length
              return (
                <article key={a.id} className="carte-affiche">
                  <button type="button" className="miniature-affiche" onClick={() => navigate(`/backoffice/affiches/${a.id}`)} aria-label={`Ouvrir ${a.nom}`}>
                    <ApercuAffiche d={donneesAffiche(etat, a)} echelle={0.62} />
                  </button>
                  <div className="infos-affiche">
                    <div className="ligne-badges">
                      <BadgeStatut statut={a.statut} />
                      <span className={`pill ${publiable(c) ? 'pill-green' : 'pill-amber'}`} title="Conditions de publication">
                        {n}/4 conditions
                      </span>
                    </div>
                    <h3>{a.nom}</h3>
                    <p>{agent ? nomProprietaire(etat, a.proprietaireId) : a.accroche}</p>
                    <dl>
                      <div>
                        <dt>Zone</dt>
                        <dd>{etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? 'Proposée, en attente' : 'Non attribuée')}</dd>
                      </div>
                      <div>
                        <dt>Période</dt>
                        <dd>
                          {formaterDate(a.debut, { day: '2-digit', month: 'short' })} → {formaterDate(a.fin, { day: '2-digit', month: 'short', year: 'numeric' })}
                        </dd>
                      </div>
                      <div>
                        <dt>Scans</dt>
                        <dd>{a.scans.toLocaleString('fr-FR')}</dd>
                      </div>
                    </dl>
                    <div className="actions-affiche">
                      <Link to={`/a/${a.codeQr}`} className="lien-panneau" title="Ouvre le parcours visiteur de cette affiche">
                        <Icone nom="qr" taille={14} /> Tester le QR
                      </Link>
                      <Link to={`/backoffice/affiches/${a.id}`} className="lien-panneau">
                        Ouvrir <Icone nom="droite" taille={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
