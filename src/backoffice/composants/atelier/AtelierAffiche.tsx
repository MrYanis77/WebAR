// Atelier de l'affiche : tout ce qui règle l'animation qui sort de l'affiche, au même endroit — modèle 3D,
// position, rotation, taille, rendu et fichier. D'un côté la vue 3D (l'affiche au mur, le modèle et ses
// poignées), de l'autre le panneau d'outils. Utilisé dans la création d'affiche, le formulaire
// d'animation et l'atelier d'un fichier.
import { useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import { RAYON_AFFICHE_M, REGLAGE_AFFICHE_RA_DEFAUT } from '../../../commun/constantes'
import { Icone } from '../../../commun/Icone'
import { useEtat } from '../../../commun/store'
import type { Affiche, Animation, ReglageAfficheRA, Reglages3D } from '../../../commun/types'
import { useSession } from '../../session'
import { ChoixAffiche, useAffichesProposees } from '../ChoixAffiche'
import { dimensionsAffiche, limiterDecalage, metres, reculMur, type Decalage } from '../sceneApercu'
import {
  ChoixModele,
  Curseur,
  OngletsOutils,
  SansModele,
  SectionFichier,
  SectionRendu,
  SectionRotation,
  TitreOutil,
  useAutresAnimationsDuModele,
  virgule,
  type Outil,
} from './OutilsAtelier'
import { TAILLE_AFFICHE, VueAffiche3D } from './VueAffiche3D'

const AUCUN_DECALAGE: Decalage = { x: 0, y: 0, z: 0 }
const TAILLES_RAPIDES = [0.5, 1, 1.5, 2, 3]

/** Libellé d'un déplacement sur un axe : « 1,20 m à droite », « aucun ». */
function sens(v: number, positif: string, negatif: string) {
  if (Math.abs(v) < 0.005) return 'aucun'
  return `${metres(Math.abs(v))} ${v > 0 ? positif : negatif}`
}

export default function AtelierAffiche({
  animation,
  onAnimation,
  reglages3d,
  onReglages3d,
  affiche,
  entete,
  desactive,
  choixModele = true,
  compact,
  erreurModele,
  outilInitial = 'position',
}: {
  /** Animation en cours d'édition : modèle, clip, lecture et réglage sur l'affiche. */
  animation: Animation
  onAnimation: (p: Partial<Animation>) => void
  /** Réglages du modèle en cours d'édition (rotation, rendu), appliqués en direct. */
  reglages3d: Reglages3D
  onReglages3d: (r: Reglages3D) => void
  /** Affiche montrée au mur (création d'affiche) ; absente : choix parmi les affiches, ou gabarit. */
  affiche?: Affiche
  /** Contenu en tête du panneau (choix de l'animation, titre…). */
  entete?: ReactNode
  desactive?: boolean
  /** Choix du modèle dans le panneau (absent quand le modèle est fixé : atelier d'un fichier). */
  choixModele?: boolean
  /** Vue au-dessus du panneau (formulaire étroit). */
  compact?: boolean
  erreurModele?: boolean
  outilInitial?: Outil
}) {
  const etat = useEtat()
  const session = useSession()
  const [outil, setOutil] = useState<Outil>(outilInitial)
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  const { liees, autres } = useAffichesProposees([animation.id || undefined])
  const [afficheId, setAfficheId] = useState(() => liees[0]?.id ?? '')
  const [formatGabarit, setFormatGabarit] = useState('A3')
  const montree = affiche ?? liees.find((x) => x.id === afficheId) ?? autres.find((x) => x.id === afficheId)
  const geo = dimensionsAffiche(montree, formatGabarit)

  const fichier = etat.fichiers.find((f) => f.id === animation.modeleId)
  const autresAnimations = useAutresAnimationsDuModele(animation.modeleId, animation.id || undefined)
  // Rotation et rendu sont des réglages du fichier : seul son propriétaire (ou un agent) les modifie.
  const modeleVerrouille = desactive || !fichier || (session.role !== 'AGENT' && fichier.proprietaireId !== session.partenaireId)

  const reglage = animation.reglageAffiche ?? REGLAGE_AFFICHE_RA_DEFAUT
  const majReglage = (r: ReglageAfficheRA) => onAnimation({ reglageAffiche: r })
  const decalage = reglage.decalage ?? AUCUN_DECALAGE
  const distance = Math.hypot(decalage.x, decalage.y, decalage.z)
  const recul = reculMur(reglage.position, geo.hauteurCible)
  const deplacer = (d: Decalage) => majReglage({ ...reglage, decalage: limiterDecalage(d, recul) })
  const dims = dimsUnite && fichier ? dimsUnite.clone().multiplyScalar(geo.hauteurCible * reglage.taille) : null

  const axe = (cle: keyof Decalage, libelle: string, positif: string, negatif: string, min: number) => (
    <Curseur libelle={libelle} valeur={decalage[cle]} min={min} max={RAYON_AFFICHE_M} pas={0.01} onChange={(v) => deplacer({ ...decalage, [cle]: v })} affichage={sens(decalage[cle], positif, negatif)} desactive={desactive || !fichier} />
  )

  return (
    <div className={`atelier-integre ${compact ? 'pile' : ''}`}>
      <div className="atelier-integre-vue">
        <VueAffiche3D
          affiche={montree}
          format={geo.format}
          geo={geo}
          modeleUrl={fichier?.url}
          clipIndice={animation.clipIndice}
          lecture={animation.lecture}
          reglages3d={reglages3d}
          reglage={reglage}
          outil={outil}
          onOutil={setOutil}
          onReglage={majReglage}
          onRotation={(rotation) => !modeleVerrouille && onReglages3d({ ...reglages3d, rotation })}
          onDimensions={setDimsUnite}
          desactive={desactive}
        />
      </div>
      <aside className="panneau-atelier" aria-label="Réglages de l’animation">
        {entete}
        {!affiche && (
          <ChoixAffiche liees={liees} autres={autres} affiche={montree} onAffiche={setAfficheId} formatGabarit={formatGabarit} onFormatGabarit={setFormatGabarit} libelleLiees="Affiches qui utilisent cette animation" />
        )}
        {choixModele && <ChoixModele animation={animation} onChange={onAnimation} desactive={desactive} erreur={erreurModele} dossierPrioritaire={etat.fichiers.find((f) => f.id === montree?.imageId)?.dossier} />}
        <OngletsOutils outil={outil} onOutil={setOutil} outils={['position', 'rotation', 'taille', 'rendu', 'fichier']} />
        <div className="contenu-outil" role="tabpanel">
          {outil === 'position' && (
            <div className="section-outil">
              <TitreOutil titre="Point de départ" consigne="Là où le modèle apparaît quand le visiteur scanne l’affiche." />
              <div className="choix-type compact">
                {(['devant', 'dessus'] as const).map((p) => (
                  <button key={p} type="button" className={reglage.position === p ? 'actif' : ''} aria-pressed={reglage.position === p} onClick={() => majReglage({ ...reglage, position: p })} disabled={desactive}>
                    <Icone nom={p === 'devant' ? 'affiche' : 'haut'} taille={18} />
                    <strong>{p === 'devant' ? 'Devant l’affiche' : 'Au-dessus'}</strong>
                    <small>{p === 'devant' ? 'Il sort de l’affiche, face au visiteur' : 'Il se pose sur le bord haut'}</small>
                  </button>
                ))}
              </div>
              <TitreOutil
                titre="Déplacement"
                consigne={`Autour de l’affiche, dans un rayon de ${RAYON_AFFICHE_M} m.`}
                action={
                  <button type="button" className="btn btn-texte petit" onClick={() => majReglage({ ...reglage, decalage: { ...AUCUN_DECALAGE } })} disabled={desactive || distance < 0.005}>
                    <Icone nom="relancer" taille={13} /> Au départ
                  </button>
                }
              />
              {axe('x', 'Gauche / droite', 'à droite', 'à gauche', -RAYON_AFFICHE_M)}
              {axe('y', 'Bas / haut', 'plus haut', 'plus bas', -RAYON_AFFICHE_M)}
              {axe('z', 'Mur / visiteur', 'vers le visiteur', 'vers le mur', recul)}
              <small className="aide-champ">
                {distance < 0.005 ? 'Le modèle est à sa position de départ.' : `À ${metres(distance)} du départ, sur ${RAYON_AFFICHE_M} m possibles (le visiteur scanne l’affiche entre 0,5 et 3 m).`}
              </small>
            </div>
          )}
          {outil === 'rotation' &&
            (fichier ? (
              <SectionRotation rotation={reglages3d.rotation} onChange={(rotation) => onReglages3d({ ...reglages3d, rotation })} desactive={modeleVerrouille} partage={autresAnimations.length} />
            ) : (
              <SansModele />
            ))}
          {outil === 'taille' && (
            <div className="section-outil">
              <TitreOutil titre="Taille du modèle" consigne="Sa plus grande dimension, par rapport à la hauteur de l’affiche imprimée." />
              <Curseur
                libelle="Taille"
                valeur={reglage.taille}
                min={TAILLE_AFFICHE.min}
                max={TAILLE_AFFICHE.max}
                pas={0.05}
                onChange={(v) => majReglage({ ...reglage, taille: v })}
                affichage={`${virgule(reglage.taille)} × la hauteur`}
                desactive={desactive}
              />
              <div className="boutons-rapides" role="group" aria-label="Tailles rapides">
                {TAILLES_RAPIDES.map((t) => (
                  <button key={t} type="button" className={reglage.taille === t ? 'actif' : ''} onClick={() => majReglage({ ...reglage, taille: t })} disabled={desactive}>
                    {virgule(t)} ×
                  </button>
                ))}
              </div>
              {dims ? (
                <p className="resume-taille">
                  Sur une affiche {geo.format} ({metres(geo.pageH)} de haut), le modèle mesure <b>L {metres(dims.x)}</b> · <b>H {metres(dims.y)}</b> · <b>P {metres(dims.z)}</b>.
                </p>
              ) : (
                !fichier && <SansModele />
              )}
            </div>
          )}
          {outil === 'rendu' && (fichier ? <SectionRendu reglages={reglages3d} onChange={onReglages3d} desactive={modeleVerrouille} /> : <SansModele />)}
          {outil === 'fichier' && (fichier ? <SectionFichier key={fichier.id} fichier={fichier} desactive={modeleVerrouille} /> : <SansModele />)}
        </div>
      </aside>
    </div>
  )
}
