// Atelier du monument : tout ce qui règle l'animation 3D d'un monument, au même endroit — modèle 3D,
// position autour du bâtiment, rotation, taille, rendu et fichier. D'un côté la carte (satellite, bâtiments
// en relief, modèle et poignées), de l'autre le panneau d'outils : les mêmes que l'atelier de l'affiche.
import { useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import { PLACEMENT_LIEU_DEFAUT } from '../../../commun/constantes'
import { distanceM } from '../../../commun/geo'
import { Icone } from '../../../commun/Icone'
import { useEtat } from '../../../commun/store'
import type { Animation, Lieu, PlacementGps, Reglages3D } from '../../../commun/types'
import { useSession } from '../../session'
import { metres } from '../sceneApercu'
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
import { TAILLE_MONUMENT, VueMonument } from './VueMonument'

const TAILLES_RAPIDES = [2, 5, 12, 25, 50]

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
}) {
  const etat = useEtat()
  const session = useSession()
  const [outil, setOutil] = useState<Outil>(outilInitial)
  const [dimsUnite, setDimsUnite] = useState<THREE.Vector3 | null>(null)
  const fichier = etat.fichiers.find((f) => f.id === animation.modeleId)
  const autresAnimations = useAutresAnimationsDuModele(animation.modeleId, animation.id || undefined)
  const modeleVerrouille = desactive || !fichier || (session.role !== 'AGENT' && fichier.proprietaireId !== session.partenaireId)

  const parDefaut = !animation.placement
  const placement = animation.placement ?? placementParDefaut(lieu)
  const maj = (p: Partial<PlacementGps>) => onAnimation({ placement: { ...placement, ...p } })
  const ecart = distanceM(lieu, placement)
  const horsRayon = ecart > lieu.rayonM
  const dims = dimsUnite && fichier ? dimsUnite.clone().multiplyScalar(placement.tailleM) : null

  return (
    <div className={`atelier-integre ${compact ? 'pile' : ''}`}>
      <div className="atelier-integre-vue">
        <VueMonument
          lieu={lieu}
          placement={placement}
          onPlacement={(p) => onAnimation({ placement: p })}
          modeleUrl={fichier?.url}
          clipIndice={animation.clipIndice}
          lecture={animation.lecture}
          reglages3d={reglages3d}
          outil={outil}
          onOutil={setOutil}
          onDimensions={setDimsUnite}
          desactive={desactive}
        />
      </div>
      <aside className="panneau-atelier" aria-label="Réglages de l’animation">
        {entete}
        {choixModele && <ChoixModele animation={animation} onChange={onAnimation} desactive={desactive} erreur={erreurModele} />}
        <OngletsOutils outil={outil} onOutil={setOutil} outils={['position', 'rotation', 'taille', 'rendu', 'fichier']} />
        <div className="contenu-outil" role="tabpanel">
          {outil === 'position' && (
            <div className="section-outil">
              <TitreOutil
                titre="Emplacement autour du bâtiment"
                consigne="Cliquez sur la carte ou glissez le repère."
                action={
                  <button type="button" className="btn btn-texte petit" onClick={() => onAnimation({ placement: undefined })} disabled={desactive || parDefaut}>
                    <Icone nom="relancer" taille={13} /> Par défaut
                  </button>
                }
              />
              {parDefaut && (
                <p className="note-partage">
                  <Icone nom="info" taille={14} /> Position par défaut : au-dessus du point du monument, face au visiteur. Déplacez le modèle pour la personnaliser.
                </p>
              )}
              <Curseur
                libelle="Hauteur au-dessus du sol"
                valeur={placement.hauteurM}
                min={0}
                max={80}
                pas={0.5}
                onChange={(v) => maj({ hauteurM: v })}
                affichage={`${virgule(placement.hauteurM)} m`}
                desactive={desactive}
              />
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
              <button type="button" className="btn btn-secondaire petit" onClick={() => maj({ latitude: lieu.latitude, longitude: lieu.longitude })} disabled={desactive || ecart < 1}>
                <Icone nom="pin" taille={14} /> Sur le point du monument
              </button>
              <small className={`aide-champ ${horsRayon ? 'alerte-texte' : ''}`}>
                {ecart < 1 ? 'Sur le point du monument.' : `À ${metres(ecart)} du point du monument.`}
                {horsRayon && ` Hors du rayon de ${lieu.rayonM} m : le visiteur risque de ne pas le voir en arrivant.`} La précision sur le téléphone dépend du GPS et de la boussole (quelques mètres).
              </small>
            </div>
          )}
          {outil === 'rotation' &&
            (fichier ? (
              <SectionRotation
                rotation={reglages3d.rotation}
                onChange={(rotation) => onReglages3d({ ...reglages3d, rotation })}
                desactive={modeleVerrouille}
                partage={autresAnimations.length}
                avant={
                  <>
                    <TitreOutil titre="Orientation sur la carte" consigne="Cliquez vers où le modèle doit regarder, ou glissez le rond cyan." />
                    <Curseur
                      libelle="Cap de la face avant"
                      valeur={placement.orientationDeg ?? 180}
                      min={0}
                      max={359}
                      pas={1}
                      onChange={(v) => maj({ orientationDeg: v })}
                      affichage={placement.orientationDeg === undefined ? 'face au visiteur' : `${placement.orientationDeg}°`}
                      desactive={desactive || placement.orientationDeg === undefined}
                    />
                    <label className="case">
                      <input type="checkbox" checked={placement.orientationDeg === undefined} onChange={(e) => maj({ orientationDeg: e.target.checked ? undefined : 180 })} disabled={desactive} />
                      Toujours tourné vers le visiteur
                    </label>
                  </>
                }
              />
            ) : (
              <SansModele />
            ))}
          {outil === 'taille' && (
            <div className="section-outil">
              <TitreOutil titre="Taille du modèle" consigne="Sa plus grande dimension, en mètres. Avec cet outil, glissez aussi la poignée du cercle sur la carte." />
              <Curseur
                libelle="Taille"
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
              {dims ? (
                <p className="resume-taille">
                  Le modèle mesure <b>L {metres(dims.x)}</b> · <b>H {metres(dims.y)}</b> · <b>P {metres(dims.z)}</b>.
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
