import { useState } from 'react'
import { Link } from 'react-router'
import { Icone } from '../../commun/Icone'
import { majScore, useEtat } from '../../commun/store'
import type { Lieu } from '../../commun/types'
import { EnTetePage, executer, formaterDate, Panneau, useToast, Vide } from '../ui'

const ETATS_MATCH = ['Avant-match', 'En cours', '45:00 · Mi-temps', '90:00 · Victoire', '90:00 · Match nul', '90:00 · Défaite']

/**
 * Saisie du score du match, affiché en texte 3D dans l'animation du lieu (BF-52).
 * Le lieu est choisi dans la liste : aucun stade n'est codé en dur.
 */
export default function PageScore() {
  const etat = useEtat()
  // Les lieux sportifs sont proposés en premier (catégorie « sport » ou score déjà saisi).
  const lieux = [...etat.lieux].sort((a, b) => Number(estSportif(b)) - Number(estSportif(a)))
  const [lieuId, setLieuId] = useState<string>('')
  const lieu = lieux.find((l) => l.id === lieuId) ?? lieux[0]

  if (!lieu)
    return (
      <>
        <EnTetePage titre="Score du match" description="Le score saisi s’affiche en texte 3D dans l’animation du lieu." />
        <div className="bo-defilement">
          <Vide icone="trophee" titre="Aucun lieu" texte="Créez d’abord le lieu (stade) dans « Lieux & zones »." />
        </div>
      </>
    )

  return (
    <>
      <EnTetePage titre="Score du match" description="Le score saisi s’affiche en texte 3D dans l’animation du lieu, sans recharger le modèle." />
      <div className="bo-defilement">
        <label className="select-compact choix-lieu-score">
          <Icone nom="pin" taille={15} />
          <select value={lieu.id} onChange={(e) => setLieuId(e.target.value)} aria-label="Lieu du match">
            {lieux.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </label>
        {/* Formulaire remonté à chaque changement de lieu, initialisé avec le score enregistré. */}
        <FormulaireScore key={lieu.id} lieu={lieu} />
      </div>
    </>
  )
}

const estSportif = (l: Lieu) => /sport|stade/i.test(l.categorie.fr) || l.equipeDomicile !== undefined

function FormulaireScore({ lieu }: { lieu: Lieu }) {
  const toast = useToast()
  const [envoi, setEnvoi] = useState(false)
  const [s, setS] = useState({
    equipeDomicile: lieu.equipeDomicile ?? '',
    equipeExterieur: lieu.equipeExterieur ?? '',
    scoreDomicile: lieu.scoreDomicile ?? 0,
    scoreExterieur: lieu.scoreExterieur ?? 0,
    competition: lieu.competition ?? '',
    minute: lieu.minute ?? ETATS_MATCH[0],
  })
  const valide = s.equipeDomicile.trim() && s.equipeExterieur.trim()

  const compteur = (cle: 'scoreDomicile' | 'scoreExterieur', equipe: string, nomEquipe: 'equipeDomicile' | 'equipeExterieur', libelle: string) => (
    <div className="equipe">
      <input value={equipe} placeholder={libelle} onChange={(e) => setS({ ...s, [nomEquipe]: e.target.value.toUpperCase().slice(0, 12) })} aria-label={`Nom de l’équipe ${libelle.toLowerCase()}`} />
      <div className="compteur-score">
        <button type="button" onClick={() => setS({ ...s, [cle]: Math.max(0, s[cle] - 1) })} aria-label={`Retirer un but à ${equipe || libelle}`}>
          <Icone nom="moins" taille={18} />
        </button>
        <strong>{s[cle]}</strong>
        <button type="button" onClick={() => setS({ ...s, [cle]: Math.min(99, s[cle] + 1) })} aria-label={`Ajouter un but à ${equipe || libelle}`}>
          <Icone nom="plus" taille={18} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="grille-score">
      <Panneau
        titre="Saisie"
        sousTitre={lieu.scoreMajLe ? `Dernière mise à jour : ${formaterDate(lieu.scoreMajLe, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Aucun score publié'}
      >
        <div className="tableau-score">
          {compteur('scoreDomicile', s.equipeDomicile, 'equipeDomicile', 'Domicile')}
          <span className="tiret">–</span>
          {compteur('scoreExterieur', s.equipeExterieur, 'equipeExterieur', 'Extérieur')}
        </div>
        <div className="grille-champs">
          <label className="champ">
            <span className="etiquette">Compétition</span>
            <input value={s.competition} onChange={(e) => setS({ ...s, competition: e.target.value })} maxLength={60} />
          </label>
          <label className="champ">
            <span className="etiquette">État du match</span>
            <select value={s.minute} onChange={(e) => setS({ ...s, minute: e.target.value })}>
              {ETATS_MATCH.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primaire"
          disabled={!valide || envoi}
          onClick={async () => {
            setEnvoi(true)
            await executer(toast, () => majScore(lieu.id, s), `Score publié dans l’animation de ${lieu.nomCourt || lieu.nom}`)
            setEnvoi(false)
          }}
        >
          <Icone nom="check" taille={16} /> Publier le score
        </button>
      </Panneau>
      <Panneau titre="Aperçu dans l’animation" sousTitre="Tel que vu par les visiteurs devant le lieu">
        <div className="apercu-score" style={lieu.image ? { backgroundImage: `url(${lieu.image})` } : undefined}>
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
        <Link to={`/lieux/${lieu.id}/ra`} className="lien-panneau">
          Ouvrir l’animation du lieu côté visiteur <Icone nom="droite" taille={14} />
        </Link>
      </Panneau>
      {toast.element}
    </div>
  )
}
