// Atelier de l'affiche : le « studio 3D » de l'animation qui sort de l'affiche. D'un côté la vue 3D
// (l'affiche au mur, le modèle et ses poignées), de l'autre un seul panneau : les modèles de la scène
// (avec « + Ajouter un modèle »), trois outils — Déplacer, Tourner, Taille — et les réglages rares,
// repliés. Plus de parcours en 5 étapes (retours : « pas clair », « écran chargé »). Utilisé dans la
// création d'affiche, le formulaire d'animation et l'atelier d'un fichier.
import { useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import { BUDGETS_3D, RAYON_AFFICHE_M, REGLAGE_AFFICHE_RA_DEFAUT } from '../../../commun/constantes'
import { Icone } from '../../../commun/Icone'
import { useEtat } from '../../../commun/store'
import type { Affiche, Animation, ReglageAfficheRA, Reglages3D } from '../../../commun/types'
import { useSession } from '../../session'
import { ChoixAffiche, useAffichesProposees } from '../ChoixAffiche'
import { dimensionsAffiche, limiterDecalage, metres, reculMur, type Decalage } from '../sceneApercu'
import { Curseur, OUTILS_VUE, useAutresAnimationsDuModele, virgule, type Outil } from './OutilsAtelier'
import { OutilsStudio, ReglagesReplies, RotationStudio, SceneModeles, SectionSon, StudioRedimensionnable } from './StudioPanneau'
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
  sansQr,
  son,
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
  /** Affiche montrée sans son QR code (création d'affiche : il n'est placé qu'à l'étape suivante). */
  sansQr?: boolean
  /** Son et durée de l'animation : section toujours visible du panneau (elle était repliée sous la vue). */
  son?: ReactNode
}) {
  const etat = useEtat()
  const session = useSession()
  const fichier = etat.fichiers.find((f) => f.id === animation.modeleId)
  const [outil, setOutil] = useState<Outil>(() => (OUTILS_VUE.includes(outilInitial) ? outilInitial : 'position'))
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  const { liees, autres } = useAffichesProposees([animation.id || undefined])
  const [afficheId, setAfficheId] = useState(() => liees[0]?.id ?? '')
  const [formatGabarit, setFormatGabarit] = useState('A3')
  const montree = affiche ?? liees.find((x) => x.id === afficheId) ?? autres.find((x) => x.id === afficheId)
  const geo = dimensionsAffiche(montree, formatGabarit)

  const autresAnimations = useAutresAnimationsDuModele(animation.modeleId, animation.id || undefined)
  // Rotation et rendu sont des réglages du fichier : seul son propriétaire (ou un agent) les modifie.
  const modeleVerrouille = desactive || !fichier || (session.role !== 'AGENT' && fichier.proprietaireId !== session.partenaireId)
  // Réglages grisés tant que le modèle n'est pas chargé dans la vue.
  const modelePret = !!fichier && !!dimsUnite
  const bloque = desactive || !modelePret
  const budget = BUDGETS_3D[animation.type]
  const tropLourd = !!fichier && ((fichier.nbTriangles ?? 0) > budget.triangles || fichier.tailleOctets > budget.poidsMo * 1_000_000)

  const reglage = animation.reglageAffiche ?? REGLAGE_AFFICHE_RA_DEFAUT
  const majReglage = (r: ReglageAfficheRA) => onAnimation({ reglageAffiche: r })
  const decalage = reglage.decalage ?? AUCUN_DECALAGE
  const distance = Math.hypot(decalage.x, decalage.y, decalage.z)
  const recul = reculMur(reglage.position, geo.hauteurCible)
  const deplacer = (d: Decalage) => majReglage({ ...reglage, decalage: limiterDecalage(d, recul) })
  const dims = dimsUnite && fichier ? dimsUnite.clone().multiplyScalar(geo.hauteurCible * reglage.taille) : null

  const axe = (cle: keyof Decalage, libelle: string, positif: string, negatif: string, min: number) => (
    <Curseur libelle={libelle} valeur={decalage[cle]} min={min} max={RAYON_AFFICHE_M} pas={0.01} onChange={(v) => deplacer({ ...decalage, [cle]: v })} affichage={sens(decalage[cle], positif, negatif)} desactive={bloque} />
  )

  return (
    <StudioRedimensionnable
      compact={compact}
      vue={
        <VueAffiche3D
          affiche={montree}
          format={geo.format}
          geo={geo}
          modeleUrl={fichier?.url}
          clipIndice={animation.clipIndice}
          lecture={animation.lecture}
          reglages3d={reglages3d}
          reglage={reglage}
          outil={fichier ? outil : 'rendu'}
          onOutil={setOutil}
          onReglage={majReglage}
          onRotation={(rotation) => !modeleVerrouille && onReglages3d({ ...reglages3d, rotation })}
          onDimensions={setDimsUnite}
          desactive={desactive}
          sansQr={sansQr}
        />
      }
    >
        {entete}
        {!affiche && (
          <ChoixAffiche liees={liees} autres={autres} affiche={montree} onAffiche={setAfficheId} formatGabarit={formatGabarit} onFormatGabarit={setFormatGabarit} libelleLiees="Affiches qui utilisent cette animation" />
        )}
        {choixModele && (
          <SceneModeles animation={animation} onAnimation={onAnimation} desactive={desactive} erreur={erreurModele} dossierPrioritaire={etat.fichiers.find((f) => f.id === montree?.imageId)?.dossier} />
        )}

        {fichier && (
          <>
            <OutilsStudio outil={outil} onOutil={setOutil} desactive={bloque} chargement={!modelePret && !desactive} />

            <section className="studio-section corps-studio" aria-live="polite">
              {outil === 'position' && (
                <>
                  <div className="choix-type compact">
                    {(['devant', 'dessus'] as const).map((p) => (
                      <button key={p} type="button" className={reglage.position === p ? 'actif' : ''} aria-pressed={reglage.position === p} onClick={() => majReglage({ ...reglage, position: p })} disabled={bloque}>
                        <Icone nom={p === 'devant' ? 'affiche' : 'haut'} taille={18} />
                        <strong>{p === 'devant' ? 'Devant l’affiche' : 'Au-dessus'}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="actions-reglage">
                    <small className="aide-champ">{distance < 0.005 ? 'À sa position de départ.' : `Décalé de ${metres(distance)} (${RAYON_AFFICHE_M} m maximum).`}</small>
                    <button type="button" className="btn btn-texte petit" onClick={() => majReglage({ ...reglage, decalage: { ...AUCUN_DECALAGE } })} disabled={bloque || distance < 0.005}>
                      <Icone nom="relancer" taille={13} /> Recentrer
                    </button>
                  </div>
                  <details className="reglages-avances">
                    <summary>Réglage précis au curseur</summary>
                    {axe('x', 'Gauche / droite', 'à droite', 'à gauche', -RAYON_AFFICHE_M)}
                    {axe('y', 'Bas / haut', 'plus haut', 'plus bas', -RAYON_AFFICHE_M)}
                    {axe('z', 'Mur / visiteur', 'vers le visiteur', 'vers le mur', recul)}
                  </details>
                </>
              )}

              {outil === 'rotation' && (
                <RotationStudio rotation={reglages3d.rotation} onChange={(rotation) => onReglages3d({ ...reglages3d, rotation })} desactive={modeleVerrouille || !modelePret} partage={autresAnimations.length} />
              )}

              {outil === 'taille' && (
                <>
                  <Curseur
                    libelle="Taille (× hauteur de l’affiche)"
                    valeur={reglage.taille}
                    min={TAILLE_AFFICHE.min}
                    max={TAILLE_AFFICHE.max}
                    pas={0.05}
                    onChange={(v) => majReglage({ ...reglage, taille: v })}
                    affichage={`${virgule(reglage.taille)} ×`}
                    desactive={bloque}
                  />
                  <div className="boutons-rapides" role="group" aria-label="Tailles rapides">
                    {TAILLES_RAPIDES.map((t) => (
                      <button key={t} type="button" className={reglage.taille === t ? 'actif' : ''} onClick={() => majReglage({ ...reglage, taille: t })} disabled={bloque}>
                        {virgule(t)} ×
                      </button>
                    ))}
                  </div>
                  {dims && (
                    <p className="resume-taille">
                      Sur une affiche {geo.format} : <b>{metres(dims.x)}</b> × <b>{metres(dims.y)}</b> × <b>{metres(dims.z)}</b>.
                    </p>
                  )}
                </>
              )}
            </section>
          </>
        )}
        {son && <SectionSon>{son}</SectionSon>}
        {fichier && <ReglagesReplies fichier={fichier} reglages3d={reglages3d} onReglages3d={onReglages3d} desactive={modeleVerrouille || !modelePret} tropLourd={tropLourd} ouvrir={outilInitial} />}
    </StudioRedimensionnable>
  )
}
