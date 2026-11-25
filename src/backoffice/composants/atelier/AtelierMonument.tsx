// Atelier du monument : le « studio 3D » de l'animation d'un monument. D'un côté la carte (satellite,
// bâtiments en relief, modèle et poignées), de l'autre un seul panneau : les modèles de la scène (avec
// « + Ajouter un modèle »), trois outils — Déplacer, Tourner, Taille — et les réglages rares, repliés.
// Plus de parcours en 5 étapes (retours : « pas clair », « écran chargé »).
import { useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import { BUDGETS_3D, PLACEMENT_LIEU_DEFAUT } from '../../../commun/constantes'
import { distanceM } from '../../../commun/geo'
import { Icone } from '../../../commun/Icone'
import { useEtat } from '../../../commun/store'
import type { Animation, Lieu, PlacementGps, Reglages3D } from '../../../commun/types'
import { useSession } from '../../session'
import { metres } from '../sceneApercu'
import { Curseur, OUTILS_VUE, useAutresAnimationsDuModele, virgule, type Outil } from './OutilsAtelier'
import { OutilsStudio, ReglagesReplies, RotationStudio, SceneModeles, SectionSon, StudioRedimensionnable } from './StudioPanneau'
import { TAILLE_MONUMENT, VueMonument } from './VueMonument'

const TAILLES_RAPIDES = [2, 5, 12, 25, 50]
const CAPS: { libelle: string; cap: number }[] = [
  { libelle: 'Nord', cap: 0 },
  { libelle: 'Est', cap: 90 },
  { libelle: 'Sud', cap: 180 },
  { libelle: 'Ouest', cap: 270 },
]

/** Position d'une animation de monument sans placement personnalisé (comme l'application visiteur). */
export const placementParDefaut = (l: Pick<Lieu, 'latitude' | 'longitude'>): PlacementGps => ({ latitude: l.latitude, longitude: l.longitude, ...PLACEMENT_LIEU_DEFAUT })

export default function AtelierMonument({
  animation,
  onAnimation,
  reglages3d,
  onReglages3d,
  lieu,
  entete,
  desactive,
  choixModele = true,
  compact,
  erreurModele,
  outilInitial = 'position',
  son,
}: {
  animation: Animation
  onAnimation: (p: Partial<Animation>) => void
  reglages3d: Reglages3D
  onReglages3d: (r: Reglages3D) => void
  lieu: Pick<Lieu, 'nom' | 'latitude' | 'longitude' | 'rayonM'>
  entete?: ReactNode
  desactive?: boolean
  choixModele?: boolean
  compact?: boolean
  erreurModele?: boolean
  outilInitial?: Outil
  /** Son et durée de l'animation : section toujours visible du panneau (elle était repliée sous la carte). */
  son?: ReactNode
}) {
  const etat = useEtat()
  const session = useSession()
  const fichier = etat.fichiers.find((f) => f.id === animation.modeleId)
  const [outil, setOutil] = useState<Outil>(() => (OUTILS_VUE.includes(outilInitial) ? outilInitial : 'position'))
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  const autresAnimations = useAutresAnimationsDuModele(animation.modeleId, animation.id || undefined)
  const modeleVerrouille = desactive || !fichier || (session.role !== 'AGENT' && fichier.proprietaireId !== session.partenaireId)
  const budget = BUDGETS_3D[animation.type]
  const tropLourd = !!fichier && ((fichier.nbTriangles ?? 0) > budget.triangles || fichier.tailleOctets > budget.poidsMo * 1_000_000)

  const parDefaut = !animation.placement
  const placement = animation.placement ?? placementParDefaut(lieu)
  const maj = (p: Partial<PlacementGps>) => onAnimation({ placement: { ...placement, ...p } })
  const ecart = distanceM(lieu, placement)
  const horsRayon = ecart > lieu.rayonM
  const dims = dimsUnite && fichier ? dimsUnite.clone().multiplyScalar(placement.tailleM) : null
  const faceVisiteur = placement.orientationDeg === undefined

  return (
    <StudioRedimensionnable
      compact={compact}
      vue={
        <VueMonument
          lieu={lieu}
          placement={placement}
          onPlacement={(p) => onAnimation({ placement: p })}
          modeleUrl={fichier?.url}
          clipIndice={animation.clipIndice}
          lecture={animation.lecture}
          reglages3d={reglages3d}
          outil={fichier ? outil : 'rendu'}
          onOutil={setOutil}
          onDimensions={setDimsUnite}
          desactive={desactive}
        />
      }
    >
        {entete}
        {choixModele && <SceneModeles animation={animation} onAnimation={onAnimation} desactive={desactive} erreur={erreurModele} />}

        {fichier && (
          <>
            <OutilsStudio outil={outil} onOutil={setOutil} desactive={desactive} />

            <section className="studio-section corps-studio" aria-live="polite">
              {outil === 'position' && (
                <>
                  <p className={`etat-reglage ${horsRayon ? 'alerte' : ''}`}>
                    <Icone nom={horsRayon ? 'alerte' : 'pin'} taille={16} />
                    <span>
                      {parDefaut || ecart < 1 ? 'Sur le point du monument.' : `À ${metres(ecart)} du point du monument.`}
                      {horsRayon && ` Hors du rayon de ${lieu.rayonM} m : le visiteur risque de ne pas le voir.`}
                    </span>
                  </p>
                  <Curseur libelle="Hauteur au-dessus du sol" valeur={placement.hauteurM} min={0} max={80} pas={0.5} onChange={(v) => maj({ hauteurM: v })} affichage={`${virgule(placement.hauteurM)} m`} desactive={desactive} />
                  <div className="actions-reglage">
                    <button type="button" className="btn btn-secondaire petit" onClick={() => maj({ latitude: lieu.latitude, longitude: lieu.longitude })} disabled={desactive || ecart < 1}>
                      <Icone nom="pin" taille={14} /> Revenir sur le monument
                    </button>
                    <button type="button" className="btn btn-texte petit" onClick={() => onAnimation({ placement: undefined })} disabled={desactive || parDefaut}>
                      <Icone nom="relancer" taille={13} /> Par défaut
                    </button>
                  </div>
                  <details className="reglages-avances">
                    <summary>Coordonnées GPS précises</summary>
                    <div className="champs-coordonnees">
                      <label className="champ">
                        <span className="etiquette">Latitude</span>
                        <input type="number" step="0.000001" value={placement.latitude} onChange={(e) => maj({ latitude: Number(e.target.value) })} disabled={desactive} />
                      </label>
                      <label className="champ">
                        <span className="etiquette">Longitude</span>
                        <input type="number" step="0.000001" value={placement.longitude} onChange={(e) => maj({ longitude: Number(e.target.value) })} disabled={desactive} />
                      </label>
                    </div>
                  </details>
                </>
              )}

              {outil === 'rotation' && (
                <>
                  <label className="case case-mise-en-avant">
                    <input type="checkbox" checked={faceVisiteur} onChange={(e) => maj({ orientationDeg: e.target.checked ? undefined : 180 })} disabled={desactive} />
                    <span>
                      <strong>Toujours face au visiteur</strong>
                      <small>Conseillé : il se tourne vers chaque personne.</small>
                    </span>
                  </label>
                  {!faceVisiteur && (
                    <>
                      <Curseur
                        libelle="Direction de l’avant"
                        valeur={placement.orientationDeg ?? 180}
                        min={0}
                        max={359}
                        pas={1}
                        onChange={(v) => maj({ orientationDeg: v })}
                        affichage={`${placement.orientationDeg}°`}
                        desactive={desactive}
                      />
                      <div className="boutons-rapides" role="group" aria-label="Directions rapides">
                        {CAPS.map((c) => (
                          <button key={c.cap} type="button" className={placement.orientationDeg === c.cap ? 'actif' : ''} onClick={() => maj({ orientationDeg: c.cap })} disabled={desactive}>
                            {c.libelle}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <details className="reglages-avances" open={reglages3d.rotation.x !== 0 || reglages3d.rotation.z !== 0}>
                    <summary>Le modèle est couché ou penché ?</summary>
                    <RotationStudio rotation={reglages3d.rotation} onChange={(rotation) => onReglages3d({ ...reglages3d, rotation })} desactive={modeleVerrouille} partage={autresAnimations.length} />
                  </details>
                </>
              )}

              {outil === 'taille' && (
                <>
                  <Curseur
                    libelle="Taille (plus grande dimension)"
                    valeur={Math.log10(placement.tailleM)}
                    min={Math.log10(TAILLE_MONUMENT.min)}
                    max={Math.log10(TAILLE_MONUMENT.max)}
                    pas={0.01}
                    onChange={(v) => maj({ tailleM: Number((10 ** v).toFixed(1)) })}
                    affichage={`${virgule(placement.tailleM)} m`}
                    desactive={desactive}
                  />
                  <div className="boutons-rapides" role="group" aria-label="Tailles rapides">
                    {TAILLES_RAPIDES.map((t) => (
                      <button key={t} type="button" className={placement.tailleM === t ? 'actif' : ''} onClick={() => maj({ tailleM: t })} disabled={desactive}>
                        {t} m
                      </button>
                    ))}
                  </div>
                  {dims && (
                    <p className="resume-taille">
                      <b>{metres(dims.x)}</b> × <b>{metres(dims.y)}</b> × <b>{metres(dims.z)}</b> · un étage ≈ 3 m.
                    </p>
                  )}
                </>
              )}
            </section>
          </>
        )}
        {son && <SectionSon>{son}</SectionSon>}
        {fichier && (
          <>
            <ReglagesReplies
              fichier={fichier}
              reglages3d={reglages3d}
              onReglages3d={onReglages3d}
              desactive={modeleVerrouille}
              tropLourd={tropLourd}
              ouvrir={outilInitial}
              avant={
                <p className="note-partage">
                  <Icone nom="ampoule" taille={15} /> Pour le voir en vrai : publiez, puis allez sur place avec un téléphone (rayon de {lieu.rayonM} m).
                </p>
              }
            />
          </>
        )}
    </StudioRedimensionnable>
  )
}
