import { useState } from 'react'
import { Link } from 'react-router'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { majScore, useEtat } from '../../commun/store'
import { EnTetePage, formaterDate, Panneau, useToast } from '../ui'

/** Saisie du score du match, affiché dans l'animation du stade (BF-52). */
export default function PageScore() {
  const etat = useEtat()
  const toast = useToast()
  const stade = etat.lieux.find((l) => l.id === 'stade')
  const [s, setS] = useState({
    equipeDomicile: stade?.equipeDomicile ?? 'FCSM',
    equipeExterieur: stade?.equipeExterieur ?? '',
    scoreDomicile: stade?.scoreDomicile ?? 0,
    scoreExterieur: stade?.scoreExterieur ?? 0,
    competition: stade?.competition ?? 'Championnat',
    minute: stade?.minute ?? '',
  })
  if (!stade) return null
  const compteur = (cle: 'scoreDomicile' | 'scoreExterieur', equipe: string, nomEquipe: 'equipeDomicile' | 'equipeExterieur') => (
    <div className="equipe">
      <input value={equipe} onChange={(e) => setS({ ...s, [nomEquipe]: e.target.value.toUpperCase().slice(0, 12) })} aria-label="Nom de l’équipe" />
      <div className="compteur-score">
        <button type="button" onClick={() => setS({ ...s, [cle]: Math.max(0, s[cle] - 1) })} aria-label={`Retirer un but à ${equipe}`}>
          <Icone nom="moins" taille={18} />
        </button>
        <strong>{s[cle]}</strong>
        <button type="button" onClick={() => setS({ ...s, [cle]: Math.min(99, s[cle] + 1) })} aria-label={`Ajouter un but à ${equipe}`}>
          <Icone nom="plus" taille={18} />
        </button>
      </div>
    </div>
  )

  return (
    <>
      <EnTetePage titre="Score du match" description="Le score saisi s’affiche en texte 3D dans l’animation du Stade Auguste-Bonal, sans recharger le modèle." />
      <div className="bo-defilement">
        <div className="grille-score">
          <Panneau titre="Saisie" sousTitre={stade.scoreMajLe ? `Dernière mise à jour : ${formaterDate(stade.scoreMajLe, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : undefined}>
            <div className="tableau-score">
              {compteur('scoreDomicile', s.equipeDomicile, 'equipeDomicile')}
              <span className="tiret">–</span>
              {compteur('scoreExterieur', s.equipeExterieur, 'equipeExterieur')}
            </div>
            <div className="grille-champs">
              <label className="champ">
                <span className="etiquette">Compétition</span>
                <input value={s.competition} onChange={(e) => setS({ ...s, competition: e.target.value })} />
              </label>
              <label className="champ">
                <span className="etiquette">État du match</span>
                <select value={s.minute} onChange={(e) => setS({ ...s, minute: e.target.value })}>
                  {['Avant-match', '45:00 · Mi-temps', '90:00 · Victoire', '90:00 · Match nul', '90:00 · Défaite', 'En cours'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="btn btn-primaire"
              onClick={() => {
                majScore('stade', s)
                toast.afficher('Score publié dans l’animation du stade')
              }}
            >
              <Icone nom="check" taille={16} /> Publier le score
            </button>
          </Panneau>
          <Panneau titre="Aperçu dans l’animation" sousTitre="Tel que vu par les visiteurs devant le stade">
            <div className="apercu-score" style={{ backgroundImage: `url(${imageLieu('stade')})` }}>
              <div className="score-ra statique">
                <span>{s.competition.toUpperCase()}</span>
                <div>
                  <b>{s.equipeDomicile}</b>
                  <strong>{s.scoreDomicile}</strong>
                  <i>–</i>
                  <strong>{s.scoreExterieur}</strong>
                  <b>{s.equipeExterieur}</b>
                </div>
                <small>{s.minute.toUpperCase()}</small>
              </div>
            </div>
            <Link to="/lieux/stade/ra" className="lien-panneau">
              Ouvrir l’animation du stade côté visiteur <Icone nom="droite" taille={14} />
            </Link>
          </Panneau>
        </div>
      </div>
      {toast.element}
    </>
  )
}
