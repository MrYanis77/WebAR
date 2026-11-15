import { useState } from 'react'
import { Icone } from '../../commun/Icone'
import { useStatistiques } from '../../commun/store'
import { useSession } from '../session'
import { Barres, CarteStat, EnTetePage, formaterDate, GraphiqueLignes, Legende, Panneau } from '../ui'

const DECLENCHEURS: Record<string, string> = {
  AFFICHE: 'Reconnaissance d’affiche',
  MONUMENT: 'Reconnaissance du monument',
  MANUEL: 'Lancement manuel (GPS)',
}

/**
 * Statistiques anonymes de scans et de lancements, par lieu et par animation (BF-28, BF-43).
 * Calculées par l'API à partir de la table « statistique » ; un partenaire ne voit que ses contenus.
 */
export default function PageStatistiques() {
  const session = useSession()
  const agent = session.role === 'AGENT'
  const [jours, setJours] = useState(30)
  const stats = useStatistiques(jours)
  const points = stats.data?.serie ?? []
  const scans = points.reduce((s, p) => s + p.scans, 0)
  const lanc = points.reduce((s, p) => s + p.lancements, 0)
  const pas = Math.max(1, Math.floor(points.length / 6))
  const pic = points.reduce<(typeof points)[number] | undefined>((m, p) => (!m || p.lancements + p.scans > m.lancements + m.scans ? p : m), undefined)
  const evolution = (actuel: number, precedent?: number) =>
    precedent ? `${actuel >= precedent ? '+' : ''}${Math.round(((actuel - precedent) / precedent) * 100)} % vs période précédente` : `sur ${jours} jours`
  const parDeclencheur = (stats.data?.parDeclencheur ?? []).filter((d) => agent || d.libelle === 'AFFICHE').map((d) => ({ libelle: DECLENCHEURS[d.libelle] ?? d.libelle, valeur: d.valeur }))

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
        {stats.isError && <p className="erreur-acces">Statistiques indisponibles : {(stats.error as Error).message}</p>}
        <p className="note-anonyme">
          <Icone nom="bouclier" taille={15} /> Données anonymes : ni cookie ni identifiant, horodatage arrondi à l’heure.
        </p>
        <div className="grille-stats">
          <CarteStat libelle="Scans de QR code" valeur={scans.toLocaleString('fr-FR')} icone="qr" note={evolution(scans, stats.data?.precedent.scans)} />
          <CarteStat libelle="Lancements d’animation" valeur={lanc.toLocaleString('fr-FR')} icone="appareil" note={evolution(lanc, stats.data?.precedent.lancements)} />
          <CarteStat libelle="Moyenne par jour" valeur={(Math.round((lanc / jours) * 10) / 10).toLocaleString('fr-FR')} icone="graphique" note="lancements" />
          <CarteStat
            libelle="Pic de fréquentation"
            valeur={pic && pic.lancements + pic.scans > 0 ? formaterDate(pic.jour, { day: 'numeric', month: 'short' }) : '—'}
            icone="etoile"
            note={pic && pic.lancements + pic.scans > 0 ? 'jour le plus actif' : 'aucune donnée'}
          />
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
              <Barres donnees={stats.data?.parLieu ?? []} />
            </Panneau>
          )}
          <Panneau titre="Par affiche" sousTitre={`Scans sur ${jours} jours`}>
            <Barres donnees={stats.data?.parAffiche ?? []} />
          </Panneau>
          <Panneau titre="Par animation" sousTitre={`Lancements sur ${jours} jours`}>
            <Barres donnees={(stats.data?.parAnimation ?? []).filter((a) => a.valeur > 0)} />
          </Panneau>
          <Panneau titre="Par déclencheur" sousTitre={`Lancements sur ${jours} jours`}>
            <Barres donnees={parDeclencheur} />
          </Panneau>
        </div>
      </div>
    </>
  )
}
