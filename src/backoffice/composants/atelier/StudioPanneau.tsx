// Panneau « Studio 3D » des ateliers (affiche, monument). Retours d'utilisation : le réglage en 5 étapes
// (Modèle › Placer › Tourner › Taille › Vérifier), imbriqué dans les 5 étapes de la création d'affiche,
// n'était « pas clair » et donnait un écran chargé. Le studio montre tout sur un seul écran, comme le
// studio d'assemblage : les modèles de la scène (avec « + Ajouter un modèle »), trois outils qui règlent
// aussi les poignées de la vue, puis les réglages rares, repliés.
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Icone } from '../../../commun/Icone'
import { messageErreur } from '../../../commun/api'
import { attendreControle, useEtat, validerFichier } from '../../../commun/store'
import type { Animation, Fichier, Reglages3D } from '../../../commun/types'
import { ChoixModele, Curseur, normaliserAngle, OUTILS, OUTILS_VUE, SectionFichier, SectionRendu, type Outil } from './OutilsAtelier'

const StudioAssemblage = lazy(() => import('../StudioAssemblage'))

/** Largeur du panneau mémorisée dans ce navigateur (confort de l'utilisateur, rien d'autre). */
const CLE_LARGEUR = 'webar-studio-largeur-panneau'
const PANNEAU_DEFAUT = 380
const PANNEAU_MIN = 300
/** La carte (ou la vue 3D) garde toujours au moins cette largeur. */
const VUE_MIN = 360
const PAS_CLAVIER = 24

function lireLargeur() {
  try {
    const v = Number(localStorage.getItem(CLE_LARGEUR))
    return v >= PANNEAU_MIN ? v : PANNEAU_DEFAUT
  } catch {
    return PANNEAU_DEFAUT
  }
}
function memoriserLargeur(v: number) {
  try {
    localStorage.setItem(CLE_LARGEUR, String(v))
  } catch {
    /* navigation privée : la largeur n'est simplement pas gardée */
  }
}

/**
 * Studio sur toute la largeur de la page : la vue (carte du monument ou vue 3D de l'affiche) à gauche,
 * le panneau à droite, séparés par une poignée. On la glisse (ou flèches du clavier) pour élargir ou
 * rétrécir la carte ; double-clic : largeur d'origine. La largeur choisie est gardée dans ce navigateur.
 */
export function StudioRedimensionnable({ compact, vue, children }: { compact?: boolean; vue: ReactNode; children: ReactNode }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(lireLargeur)
  const [glisse, setGlisse] = useState(false)
  /** Largeur totale du studio (pour annoncer la part de la carte aux lecteurs d'écran). */
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    const observateur = new ResizeObserver(() => setTotal(el.clientWidth))
    observateur.observe(el)
    return () => observateur.disconnect()
  }, [])

  const borner = (v: number) => {
    const total = conteneur.current?.clientWidth ?? 1400
    return Math.round(Math.min(Math.max(v, PANNEAU_MIN), Math.max(PANNEAU_MIN, total - VUE_MIN)))
  }
  const appliquer = (v: number) => {
    const b = borner(v)
    setLargeur(b)
    memoriserLargeur(b)
  }

  function debutGlisser(e: PointerEvent<HTMLDivElement>) {
    const el = conteneur.current
    if (!el || e.button !== 0) return
    e.preventDefault()
    const poignee = e.currentTarget
    poignee.setPointerCapture(e.pointerId)
    const droite = el.getBoundingClientRect().right
    let derniere = largeur
    setGlisse(true)
    const bouger = (ev: globalThis.PointerEvent) => {
      derniere = borner(droite - ev.clientX)
      setLargeur(derniere)
    }
    const fin = () => {
      poignee.removeEventListener('pointermove', bouger)
      poignee.removeEventListener('pointerup', fin)
      poignee.removeEventListener('pointercancel', fin)
      setGlisse(false)
      memoriserLargeur(derniere)
    }
    poignee.addEventListener('pointermove', bouger)
    poignee.addEventListener('pointerup', fin)
    poignee.addEventListener('pointercancel', fin)
  }

  function clavier(e: KeyboardEvent<HTMLDivElement>) {
    // Flèche gauche : la carte rétrécit (le panneau s'élargit) ; flèche droite : la carte s'élargit.
    if (e.key === 'ArrowLeft') appliquer(largeur + PAS_CLAVIER)
    else if (e.key === 'ArrowRight') appliquer(largeur - PAS_CLAVIER)
    else if (e.key === 'Home') appliquer(Number.POSITIVE_INFINITY)
    else if (e.key === 'End') appliquer(PANNEAU_MIN)
    else return
    e.preventDefault()
  }

  const partCarte = total ? Math.round(((total - Math.min(largeur, total - VUE_MIN)) / total) * 100) : undefined
  return (
    <div ref={conteneur} className={`atelier-integre studio ${compact ? 'pile' : ''} ${glisse ? 'redimension' : ''}`} style={{ '--largeur-panneau': `${largeur}px` } as CSSProperties}>
      <div className="atelier-integre-vue">{vue}</div>
      <div
        className="poignee-studio"
        role="separator"
        aria-orientation="vertical"
        aria-label="Largeur de la carte"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={partCarte}
        aria-valuetext={partCarte !== undefined ? `Carte sur ${partCarte} % de la largeur` : undefined}
        tabIndex={0}
        title="Glissez pour changer la largeur de la carte · double-clic : largeur d’origine"
        onPointerDown={debutGlisser}
        onDoubleClick={() => appliquer(PANNEAU_DEFAUT)}
        onKeyDown={clavier}
      >
        <span aria-hidden="true" />
      </div>
      <aside className="panneau-atelier panneau-studio" aria-label="Studio 3D">
        {children}
      </aside>
    </div>
  )
}

/**
 * Modèles de la scène : le modèle de l'animation (choix dans la bibliothèque ou import d'un GLB, avec son
 * animation intégrée) et « + Ajouter un modèle », qui ouvre le studio d'assemblage avec ce modèle déjà
 * posé. À la validation, les modèles réunis forment un nouveau modèle, contrôlé puis utilisé par l'animation.
 */
export function SceneModeles({
  animation,
  onAnimation,
  desactive,
  erreur,
  dossierPrioritaire,
}: {
  animation: Pick<Animation, 'type' | 'modeleId' | 'clipIndice' | 'lecture'>
  onAnimation: (p: Partial<Animation>) => void
  desactive?: boolean
  erreur?: boolean
  dossierPrioritaire?: string
}) {
  const etat = useEtat()
  const fichier = etat.fichiers.find((f) => f.id === animation.modeleId)
  const [studio, setStudio] = useState(false)
  const [preparation, setPreparation] = useState(false)
  const [probleme, setProbleme] = useState<string | null>(null)

  /** Modèle assemblé créé : contrôle automatique, validation, puis il remplace le modèle de l'animation. */
  async function integrer(f: Fichier) {
    setStudio(false)
    setPreparation(true)
    setProbleme(null)
    try {
      const controle = await attendreControle(f.id, 5 * 60_000)
      if (controle.statutControle === 'REFUSE') throw new Error(`Modèle assemblé refusé : ${controle.raisonRefus ?? 'non conforme'}.`)
      if (controle.statutControle !== 'CONFORME') await validerFichier(f.id)
      onAnimation({ modeleId: f.id, clipIndice: undefined })
    } catch (e) {
      setProbleme(messageErreur(e))
    } finally {
      setPreparation(false)
    }
  }

  return (
    <section className="studio-section studio-scene" aria-label="Modèles de la scène">
      <h3 className="titre-studio">
        <Icone nom="cube" taille={16} /> {fichier ? 'Modèle de la scène' : 'Choisissez un modèle 3D'}
      </h3>
      <ChoixModele animation={animation} onChange={onAnimation} desactive={desactive || preparation} erreur={erreur} dossierPrioritaire={dossierPrioritaire} />
      {fichier && !desactive && (
        <button type="button" className="btn btn-secondaire btn-bloc ajout-modele" onClick={() => setStudio(true)} disabled={preparation}>
          {preparation ? <span className="spinner" /> : <Icone nom="plus" taille={16} />}
          {preparation ? 'Préparation de la scène…' : 'Ajouter un modèle à la scène'}
        </button>
      )}
      {probleme && (
        <p className="erreur-acces" role="alert">
          <Icone nom="alerte" taille={15} />
          {probleme}
        </p>
      )}
      {studio && fichier && (
        <Suspense fallback={null}>
          <StudioAssemblage depart={fichier} scene={{ usage: animation.type }} onFermer={() => setStudio(false)} onCree={(f) => void integrer(f)} />
        </Suspense>
      )}
    </section>
  )
}

/** Les trois outils du studio : ils règlent aussi les poignées de la vue (déplacer, tourner, agrandir). */
export function OutilsStudio({ outil, onOutil, desactive, chargement }: { outil: Outil; onOutil: (o: Outil) => void; desactive?: boolean; chargement?: boolean }) {
  return (
    <section className="studio-section" aria-label="Outils">
      <div className="onglets-studio" role="tablist" aria-label="Outils du studio">
        {OUTILS_VUE.map((o) => (
          <button key={o} type="button" role="tab" aria-selected={outil === o} className={outil === o ? 'actif' : ''} onClick={() => onOutil(o)} disabled={desactive}>
            <Icone nom={OUTILS[o].icone} taille={18} />
            <span>{o === 'taille' ? 'Taille' : OUTILS[o].geste}</span>
          </button>
        ))}
      </div>
      {chargement && (
        <p className="outil-vide">
          <span className="spinner" /> Chargement du modèle…
        </p>
      )}
    </section>
  )
}

const AXES_ROTATION = [
  { axe: 'y', libelle: 'Sur lui-même' },
  { axe: 'x', libelle: 'Avant / arrière' },
  { axe: 'z', libelle: 'Gauche / droite' },
] as const

/** Rotation du modèle en quarts de tour (le cas courant : un modèle exporté couché), degrés au besoin. */
export function RotationStudio({
  rotation,
  onChange,
  desactive,
  partage = 0,
}: {
  rotation: Reglages3D['rotation']
  onChange: (r: Reglages3D['rotation']) => void
  desactive?: boolean
  partage?: number
}) {
  const tourner = (axe: 'x' | 'y' | 'z', v: number) => onChange({ ...rotation, [axe]: normaliserAngle(v) })
  const nulle = rotation.x === 0 && rotation.y === 0 && rotation.z === 0
  return (
    <div className="rotation-studio">
      {AXES_ROTATION.map(({ axe, libelle }) => (
        <div key={axe} className="ligne-rotation">
          <span>
            {libelle} <b>{rotation[axe]}°</b>
          </span>
          <button type="button" onClick={() => tourner(axe, rotation[axe] - 90)} disabled={desactive} aria-label={`${libelle} : −90°`}>
            −90°
          </button>
          <button type="button" onClick={() => tourner(axe, rotation[axe] + 90)} disabled={desactive} aria-label={`${libelle} : +90°`}>
            +90°
          </button>
        </div>
      ))}
      <div className="actions-reglage">
        <small className="aide-champ">Modèle couché ? Essayez −90° avant / arrière.</small>
        <button type="button" className="btn btn-texte petit" onClick={() => onChange({ x: 0, y: 0, z: 0 })} disabled={desactive || nulle}>
          <Icone nom="relancer" taille={13} /> Remettre à 0
        </button>
      </div>
      <details className="reglages-avances">
        <summary>Réglage au degré près</summary>
        {AXES_ROTATION.map(({ axe, libelle }) => (
          <Curseur key={axe} libelle={libelle} valeur={rotation[axe]} min={-180} max={180} pas={1} onChange={(v) => tourner(axe, v)} affichage={`${rotation[axe]}°`} desactive={desactive} />
        ))}
      </details>
      {partage > 0 && (
        <p className="note-partage">
          <Icone nom="info" taille={14} /> S’applique aussi {partage > 1 ? `aux ${partage} autres animations` : 'à l’autre animation'} de ce modèle.
        </p>
      )}
    </div>
  )
}

/** Son et durée de l'animation, dans le panneau du studio : visible d'emblée (il était replié sous la vue). */
export function SectionSon({ children }: { children: ReactNode }) {
  return (
    <section className="studio-section studio-son" aria-label="Son et durée">
      <h3 className="titre-studio">
        <Icone nom="son" taille={16} /> Son et durée <small>facultatif</small>
      </h3>
      {children}
    </section>
  )
}

/** Réglages rares, repliés en bas du studio : lumière et vitesse, poids du fichier. */
export function ReglagesReplies({
  fichier,
  reglages3d,
  onReglages3d,
  desactive,
  tropLourd,
  ouvrir,
  avant,
}: {
  fichier: Fichier
  reglages3d: Reglages3D
  onReglages3d: (r: Reglages3D) => void
  desactive?: boolean
  tropLourd?: boolean
  /** Section ouverte d'emblée (atelier ouvert sur « Lumière » ou « Fichier »). */
  ouvrir?: Outil
  avant?: ReactNode
}) {
  return (
    <section className="studio-section studio-replie" aria-label="Autres réglages">
      {avant}
      <details className="reglages-avances" open={ouvrir === 'rendu'}>
        <summary>Lumière et vitesse</summary>
        <SectionRendu reglages={reglages3d} onChange={onReglages3d} desactive={desactive} />
      </details>
      <details className="reglages-avances" open={tropLourd || ouvrir === 'fichier'}>
        <summary>
          Poids du fichier
          {tropLourd && (
            <span className="pastille-alerte">
              <Icone nom="alerte" taille={12} /> trop lourd
            </span>
          )}
        </summary>
        <SectionFichier key={fichier.id} fichier={fichier} desactive={desactive} />
      </details>
    </section>
  )
}
