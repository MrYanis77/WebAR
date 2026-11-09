import { useMemo, useState } from 'react'
import { Icone } from '../../commun/Icone'
import { useEtat } from '../../commun/store'
import { EnTetePage, formaterDate, Panneau, Recherche } from '../ui'

const FAMILLES: Record<string, string[]> = {
  Comptes: ['INSCRIPTION', 'COMPTE_VERIFIE', 'COMPTE_REFUSE', 'SUSPENSION', 'REACTIVATION', 'CHARTE_ACCEPTEE', 'CONNEXION'],
  Contenus: ['CREATION', 'MODIFICATION', 'PUBLICATION', 'ACTIVATION', 'DESACTIVATION', 'IMPORT_FICHIER', 'LIEU_CREE', 'LIEU_MAJ', 'SCORE_MAJ'],
  Zones: ['ZONE_ATTRIBUEE', 'ZONE_PROPOSEE', 'ZONE_PROPOSEE_REFUSEE', 'ZONE_MAJ'],
  Modération: ['SIGNALEMENT', 'DECISION_MAINTENIR', 'DECISION_SUSPENDRE', 'DECISION_SUPPRIMER', 'DECISION_REACTIVER', 'REEXAMEN_DEMANDE', 'REPONSE_PARTENAIRE', 'REEXAMEN_CLOS'],
}

/** Journal horodaté de toutes les étapes, avec leur auteur, consultable par les agents (BNF-17). */
export default function PageJournal() {
  const etat = useEtat()
  const [texte, setTexte] = useState('')
  const [famille, setFamille] = useState('toutes')
  const [auteur, setAuteur] = useState('tous')
  const auteurs = useMemo(() => [...new Set(etat.journal.map((j) => j.auteur))].sort(), [etat.journal])
  const lignes = etat.journal
    .filter((j) => famille === 'toutes' || FAMILLES[famille]?.includes(j.action))
    .filter((j) => auteur === 'tous' || j.auteur === auteur)
    .filter((j) => `${j.action} ${j.objet} ${j.details ?? ''} ${j.auteur}`.toLowerCase().includes(texte.toLowerCase()))

  function exporter() {
    const csv = ['date;auteur;action;type;objet;details', ...lignes.map((j) => [j.date, j.auteur, j.action, j.objetType, j.objet, j.details ?? ''].map((v) => `"${v.replace(/"/g, '""')}"`).join(';'))]
    const url = URL.createObjectURL(new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'journal-actions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <EnTetePage
        titre="Journal des actions"
        description="Inscriptions, publications, zones, signalements, décisions, suspensions et retraits : chaque étape est horodatée avec son auteur."
        actions={
          <button type="button" className="btn btn-fantome" onClick={exporter}>
            <Icone nom="telecharger" taille={15} /> Export CSV
          </button>
        }
      />
      <div className="bo-defilement">
        <div className="barre-outils">
          <div className="outils-droite gauche">
            <Recherche valeur={texte} onChange={setTexte} />
            <label className="select-compact">
              <Icone nom="filtre" taille={15} />
              <select value={famille} onChange={(e) => setFamille(e.target.value)} aria-label="Famille d’actions">
                <option value="toutes">Toutes les actions</option>
                {Object.keys(FAMILLES).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="select-compact">
              <Icone nom="utilisateurs" taille={15} />
              <select value={auteur} onChange={(e) => setAuteur(e.target.value)} aria-label="Auteur">
                <option value="tous">Tous les auteurs</option>
                {auteurs.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          <span className="compte-lignes">{lignes.length} entrée(s)</span>
        </div>
        <Panneau>
          <div className="table-defilante">
            <table className="table journal">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Auteur</th>
                  <th>Action</th>
                  <th>Objet</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((j) => (
                  <tr key={j.id}>
                    <td className="horodatage">{formaterDate(j.date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td>{j.auteur === 'Visiteur anonyme' ? <em>Visiteur anonyme</em> : j.auteur}</td>
                    <td>
                      <code>{j.action}</code>
                    </td>
                    <td>
                      {j.objet}
                      <small>{j.objetType}</small>
                    </td>
                    <td>{j.details ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panneau>
      </div>
    </>
  )
}
