import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { genererStatistiques, VILLE_ID } from '../../commun/donnees'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { animationActive, publiable, reglePublication, useEtat } from '../../commun/store'
import { proprietaireDe, signalementsDuPartenaire, useSession } from '../session'
import { BadgeStatut, CarteStat, EnTetePage, formaterDate, GraphiqueLignes, Legende, Panneau } from '../ui'

export default function PageTableauDeBord() {
  const etat = useEtat()
  const session = useSession()
  const navigate = useNavigate()
  const [jours, setJours] = useState(30)
  const agent = session.role === 'AGENT'
  const proprio = proprietaireDe(session)
  const facteur = agent ? 1 : 0.07

  const stats = useMemo(() => genererStatistiques(jours).map((p) => ({ ...p, scans: Math.round(p.scans * facteur), lancements: Math.round(p.lancements * facteur) })), [jours, facteur])
  const precedent = useMemo(() => genererStatistiques(jours * 2).slice(0, jours), [jours])
  const totalScans = stats.reduce((s, p) => s + p.scans, 0)
  const totalLanc = stats.reduce((s, p) => s + p.lancements, 0)
  const evol = (a: number, b: number) => `${a >= b ? '+' : ''}${(((a - b) / Math.max(1, b)) * 100).toFixed(1).replace('.', ',')} %`
  const scansPrec = precedent.reduce((s, p) => s + p.scans, 0) * facteur
  const lancPrec = precedent.reduce((s, p) => s + p.lancements, 0) * facteur

  const animations = etat.animations.filter((a) => agent || a.proprietaireId === proprio)
  const affiches = etat.affiches.filter((a) => agent || a.proprietaireId === proprio)
  const actives = animations.filter((a) => animationActive(a)).length
  const pas = Math.max(1, Math.floor(stats.length / 5))
  const etiquettes = stats.filter((_, i) => i % pas === 0).map((p) => formaterDate(p.jour, { day: 'numeric', month: 'short' }))

  const signalementsEnAttente = agent ? etat.signalements.filter((s) => s.statut !== 'TRAITE') : signalementsDuPartenaire(etat, session.partenaireId).filter((s) => s.statut !== 'TRAITE')
  const comptes = etat.partenaires.filter((p) => p.statut === 'EN_ATTENTE')
  const zones = etat.affiches.filter((a) => a.proprietaireId !== VILLE_ID && (!a.zoneId || a.zoneProposeeId))
  const dans30j = Date.now() + 30 * 86_400_000
  const expirent = animations.filter((a) => a.statut === 'PUBLIEE' && a.fin && new Date(a.fin).getTime() < dans30j && new Date(a.fin).getTime() > Date.now())
  const reexamens = etat.decisions.filter((d) => d.reexamenDemande)
  const partenaire = etat.partenaires.find((p) => p.id === session.partenaireId)

  return (
    <>
      <EnTetePage
        titre={`Bonjour ${session.nom.split(' ')[0]},`}
        description={agent ? 'Voici ce qui se passe à Montbéliard aujourd’hui.' : 'Suivez vos affiches, vos animations et leurs signalements.'}
        actions={
          <button type="button" className="btn btn-primaire" onClick={() => navigate('/backoffice/affiches/nouvelle')}>
            <Icone nom="plus" taille={16} />
            Nouvelle affiche
          </button>
        }
      />
      <div className="bo-defilement">
        <div className="filtre-periode">
          <h2>Vue d’ensemble</h2>
          <label className="select-compact">
            <Icone nom="calendrier" taille={15} />
            <select value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période">
              <option value={7}>7 derniers jours</option>
              <option value={30}>30 derniers jours</option>
              <option value={90}>90 derniers jours</option>
            </select>
          </label>
        </div>
        <div className="grille-stats">
          <CarteStat libelle={agent ? 'Scans d’affiches' : 'Scans de mes affiches'} valeur={totalScans.toLocaleString('fr-FR')} evolution={evol(totalScans, scansPrec)} icone="scan" note={`ces ${jours} derniers jours`} />
          <CarteStat libelle="Expériences lancées" valeur={totalLanc.toLocaleString('fr-FR')} evolution={evol(totalLanc, lancPrec)} icone="appareil" note={`ces ${jours} derniers jours`} />
          <CarteStat libelle="Taux d’engagement" valeur={`${((totalLanc / Math.max(1, totalScans)) * 100).toFixed(1).replace('.', ',')} %`} icone="graphique" note="lancements / scans" />
          <CarteStat libelle="Animations actives" valeur={String(actives)} icone="couches" note={`sur ${animations.length} animation${animations.length > 1 ? 's' : ''}`} />
        </div>

        <div className="grille-tableau">
          <Panneau titre="Activité des expériences" sousTitre="Scans et lancements RA (statistiques anonymes)" action={<Legende elements={[{ nom: 'Scans', couleur: 'wine' }, { nom: 'Lancements', couleur: 'cyan' }]} />}>
            <GraphiqueLignes
              series={[
                { nom: 'Scans', couleur: 'wine', valeurs: stats.map((p) => p.scans) },
                { nom: 'Lancements', couleur: 'cyan', valeurs: stats.map((p) => p.lancements) },
              ]}
              etiquettes={etiquettes}
            />
          </Panneau>

          {agent ? (
            <Panneau titre="À traiter" action={<Link to="/backoffice/signalements" className="lien-panneau">Tout voir <Icone nom="droite" taille={14} /></Link>}>
              <ul className="liste-alertes">
                <li>
                  <span className="icone-alerte wine"><Icone nom="drapeau" taille={16} /></span>
                  <div>
                    <strong>{signalementsEnAttente.length} signalement{signalementsEnAttente.length > 1 ? 's' : ''} en attente</strong>
                    <p>À examiner sous 5 minutes après réception</p>
                  </div>
                  <Link to="/backoffice/signalements" aria-label="Voir les signalements"><Icone nom="droite" taille={16} /></Link>
                </li>
                <li>
                  <span className="icone-alerte amber"><Icone nom="utilisateurs" taille={16} /></span>
                  <div>
                    <strong>{comptes.length} compte{comptes.length > 1 ? 's' : ''} à vérifier</strong>
                    <p>{comptes.map((c) => c.nomStructure).join(', ') || 'Aucune inscription en attente'}</p>
                  </div>
                  <Link to="/backoffice/partenaires" aria-label="Voir les comptes"><Icone nom="droite" taille={16} /></Link>
                </li>
                <li>
                  <span className="icone-alerte cyan"><Icone nom="zone" taille={16} /></span>
                  <div>
                    <strong>{zones.length} zone{zones.length > 1 ? 's' : ''} d’affichage à attribuer</strong>
                    <p>Affiches de partenaires bloquées à l’export</p>
                  </div>
                  <Link to="/backoffice/lieux?onglet=attributions" aria-label="Voir les attributions"><Icone nom="droite" taille={16} /></Link>
                </li>
                {expirent.length > 0 && (
                  <li>
                    <span className="icone-alerte cyan"><Icone nom="horloge" taille={16} /></span>
                    <div>
                      <strong>Animation bientôt expirée</strong>
                      <p>{expirent[0].titre} — fin le {formaterDate(expirent[0].fin!, { day: 'numeric', month: 'long' })}</p>
                    </div>
                    <Link to="/backoffice/animations" aria-label="Voir les animations"><Icone nom="droite" taille={16} /></Link>
                  </li>
                )}
                {reexamens.length > 0 && (
                  <li>
                    <span className="icone-alerte amber"><Icone nom="historique" taille={16} /></span>
                    <div>
                      <strong>{reexamens.length} demande{reexamens.length > 1 ? 's' : ''} de réexamen</strong>
                      <p>Réponse des partenaires à une décision</p>
                    </div>
                    <Link to="/backoffice/moderation" aria-label="Voir la modération"><Icone nom="droite" taille={16} /></Link>
                  </li>
                )}
              </ul>
            </Panneau>
          ) : (
            <Panneau titre="Avant de publier" sousTitre="Conditions de votre compte">
              <ul className="liste-conditions">
                <li className={partenaire?.statut === 'VERIFIE' ? 'ok' : ''}>
                  <Icone nom={partenaire?.statut === 'VERIFIE' ? 'check' : 'horloge'} taille={15} /> Compte vérifié par la mairie
                </li>
                <li className={partenaire?.charteAccepteeLe ? 'ok' : ''}>
                  <Icone nom={partenaire?.charteAccepteeLe ? 'check' : 'fermer'} taille={15} /> Charte d’utilisation acceptée
                  {!partenaire?.charteAccepteeLe && <Link to="/backoffice/charte">Accepter</Link>}
                </li>
                <li className={affiches.every((a) => reglePublication(etat, a).fichiersConformes) ? 'ok' : ''}>
                  <Icone nom="cube" taille={15} /> Fichiers contrôlés et conformes
                </li>
                <li className={affiches.every((a) => a.zoneId) ? 'ok' : ''}>
                  <Icone nom="zone" taille={15} /> Zones attribuées par la mairie ({affiches.filter((a) => a.zoneId).length}/{affiches.length})
                </li>
              </ul>
              <Link to="/backoffice/mes-signalements" className="lien-panneau bas">
                {signalementsEnAttente.length} signalement{signalementsEnAttente.length > 1 ? 's' : ''} en cours sur vos contenus <Icone nom="droite" taille={14} />
              </Link>
            </Panneau>
          )}
        </div>

        <Panneau
          titre={agent ? 'Animations récentes' : 'Mes affiches'}
          action={
            <Link to={agent ? '/backoffice/animations' : '/backoffice/affiches'} className="lien-panneau">
              {agent ? 'Voir toutes les animations' : 'Voir toutes mes affiches'} <Icone nom="droite" taille={14} />
            </Link>
          }
          className="marge-haut"
        >
          <div className="table-defilante">
            {agent ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Animation</th>
                    <th>Lieu</th>
                    <th>Statut</th>
                    <th>Période</th>
                    <th>Lancements</th>
                  </tr>
                </thead>
                <tbody>
                  {[...animations]
                    .sort((a, b) => b.modifieLe.localeCompare(a.modifieLe))
                    .slice(0, 5)
                    .map((a) => {
                      const lieu = etat.lieux.find((l) => l.id === a.lieuId)
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="cellule-titre">
                              <span className="vignette">{imageLieu(lieu?.image) ? <img src={imageLieu(lieu?.image)} alt="" /> : <Icone nom={a.type === 'AFFICHE' ? 'affiche' : 'cube'} taille={16} />}</span>
                              <div>
                                <strong>{a.titre}</strong>
                                <small>{a.type === 'LIEU' ? 'Animation de lieu' : 'Animation d’affiche'}</small>
                              </div>
                            </div>
                          </td>
                          <td>{lieu?.nom ?? '—'}</td>
                          <td>
                            <BadgeStatut statut={animationActive(a) ? 'PUBLIEE' : a.statut} libelle={animationActive(a) ? 'Active' : a.statut === 'PUBLIEE' ? 'Programmée' : undefined} />
                          </td>
                          <td>
                            {formaterDate(a.debut, { day: '2-digit', month: 'short' })} — {a.fin ? formaterDate(a.fin, { day: '2-digit', month: 'short' }) : 'permanente'}
                          </td>
                          <td>{a.lancements.toLocaleString('fr-FR')}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Affiche</th>
                    <th>Statut</th>
                    <th>Conditions</th>
                    <th>Zone</th>
                    <th>Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {affiches.map((a) => {
                    const c = reglePublication(etat, a)
                    const n = Object.values(c).filter(Boolean).length
                    return (
                      <tr key={a.id} className="ligne-cliquable" onClick={() => navigate(`/backoffice/affiches/${a.id}`)}>
                        <td>
                          <strong>{a.nom}</strong>
                        </td>
                        <td>
                          <BadgeStatut statut={a.statut} />
                        </td>
                        <td>
                          <span className={`pill ${publiable(c) ? 'pill-green' : 'pill-amber'}`}>{n}/4</span>
                        </td>
                        <td>{etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? 'Proposition en attente' : 'Non attribuée')}</td>
                        <td>{a.scans.toLocaleString('fr-FR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Panneau>
      </div>
    </>
  )
}
