import { useMemo, useState } from 'react'
import { genererStatistiques } from '../../commun/donnees'
import { Icone } from '../../commun/Icone'
import { useEtat } from '../../commun/store'
import { useSession } from '../session'
import { Barres, CarteStat, EnTetePage, formaterDate, GraphiqueLignes, Legende, Panneau } from '../ui'

/** Statistiques anonymes de scans et de lancements, par lieu et par animation (BF-28, BF-43). */
export default function PageStatistiques() {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  const [jours, setJours] = useState(30)
  const facteur = agent ? 1 : 0.07
  const points = useMemo(() => genererStatistiques(jours).map((p) => ({ ...p, scans: Math.round(p.scans * facteur), lancements: Math.round(p.lancements * facteur) })), [jours, facteur])
  const affiches = etat.affiches.filter((a) => agent || a.proprietaireId === session.partenaireId)
  const animations = etat.animations.filter((a) => agent || a.proprietaireId === session.partenaireId)
  const scans = points.reduce((s, p) => s + p.scans, 0)
  const lanc = points.reduce((s, p) => s + p.lancements, 0)
  const pas = Math.max(1, Math.floor(points.length / 6))

  // Répartition des lancements par déclencheur (affiche, monument, manuel).
  const parDeclencheur = [
    { libelle: 'Reconnaissance d’affiche', valeur: Math.round(lanc * (agent ? 0.46 : 1)) },
    ...(agent
      ? [
          { libelle: 'Reconnaissance du monument', valeur: Math.round(lanc * 0.41) },
          { libelle: 'Lancement manuel (GPS)', valeur: Math.round(lanc * 0.13) },
        ]
      : []),
  ]

  function exporter() {
    const lignes = ['jour;scans;lancements', ...points.map((p) => `${p.jour};${p.scans};${p.lancements}`)]
    const url = URL.createObjectURL(new Blob([lignes.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const lien = document.createElement('a')
    lien.href = url
    lien.download = `statistiques-${jours}j.csv`
    lien.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <EnTetePage
        titre="Statistiques"
        description={agent ? 'Analysez l’usage des expériences sur le territoire.' : 'Fréquentation anonyme de vos affiches et animations.'}
        actions={
          <>
            <label className="select-compact">
              <Icone nom="calendrier" taille={15} />
              <select value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période">
                <option value={7}>7 jours</option>
                <option value={30}>30 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </label>
            <button type="button" className="btn btn-fantome" onClick={exporter}>
              <Icone nom="telecharger" taille={15} /> Export CSV
            </button>
          </>
        }
      />
      <div className="bo-defilement">
        <p className="note-anonyme">
          <Icone nom="bouclier" taille={15} /> Données anonymes : ni cookie ni identifiant, horodatage arrondi à l’heure.
        </p>
        <div className="grille-stats">
          <CarteStat libelle="Scans de QR code" valeur={scans.toLocaleString('fr-FR')} icone="qr" note={`sur ${jours} jours`} />
          <CarteStat libelle="Lancements d’animation" valeur={lanc.toLocaleString('fr-FR')} icone="appareil" note={`sur ${jours} jours`} />
          <CarteStat libelle="Moyenne par jour" valeur={Math.round(lanc / jours).toLocaleString('fr-FR')} icone="graphique" note="lancements" />
          <CarteStat libelle="Pic de fréquentation" valeur={formaterDate(points.reduce((m, p) => (p.lancements > m.lancements ? p : m), points[0]).jour, { day: 'numeric', month: 'short' })} icone="etoile" note="jour le plus actif" />
        </div>
        <Panneau titre="Évolution" sousTitre="Scans et lancements par jour" action={<Legende elements={[{ nom: 'Scans', couleur: 'wine' }, { nom: 'Lancements', couleur: 'cyan' }]} />} className="marge-haut">
          <GraphiqueLignes
            series={[
              { nom: 'Scans', couleur: 'wine', valeurs: points.map((p) => p.scans) },
              { nom: 'Lancements', couleur: 'cyan', valeurs: points.map((p) => p.lancements) },
            ]}
            etiquettes={points.filter((_, i) => i % pas === 0).map((p) => formaterDate(p.jour, { day: 'numeric', month: 'short' }))}
            hauteur={220}
          />
        </Panneau>
        <div className="grille-deux marge-haut">
          {agent && (
            <Panneau titre="Par lieu" sousTitre="Lancements cumulés des animations de lieu">
              <Barres
                donnees={etat.lieux.map((l) => ({
                  libelle: l.nomCourt,
                  valeur: etat.animations.filter((a) => a.lieuId === l.id).reduce((s, a) => s + a.lancements, 0),
                }))}
              />
            </Panneau>
          )}
          <Panneau titre="Par affiche" sousTitre="Scans cumulés depuis la publication">
            <Barres donnees={affiches.map((a) => ({ libelle: a.nom, valeur: a.scans }))} />
          </Panneau>
          <Panneau titre="Par animation" sousTitre="Lancements cumulés">
            <Barres donnees={animations.filter((a) => a.lancements > 0).map((a) => ({ libelle: a.titre, valeur: a.lancements }))} />
          </Panneau>
          <Panneau titre="Par déclencheur" sousTitre={`Lancements sur ${jours} jours`}>
            <Barres donnees={parDeclencheur} />
          </Panneau>
        </div>
      </div>
    </>
  )
}
