// Briques communes des ateliers 3D du back-office. Les mêmes outils partout — atelier de l'affiche,
// atelier du monument, atelier d'un fichier — : Position, Rotation, Taille, Rendu, Fichier, ainsi que le
// choix du modèle 3D et du son de l'animation. Aucun import de Three.js ici (panneaux seulement).
import { useMemo, useState, type ReactNode } from 'react'
import { BUDGETS_3D, MODELE_3D_MAX_MO, NOM_ANIMATION_COMBINEE, OPTIMISATION_DEFAUT, reglagesComplets, REGLAGES_3D_DEFAUT } from '../../../commun/constantes'
import { Icone, type NomIcone } from '../../../commun/Icone'
import { messageErreur } from '../../../commun/api'
import { attendreControle, enregistrerReglages3D, importerFichier, optimiserModele, restaurerModele, useEtat, validerFichier } from '../../../commun/store'
import type { Animation, Fichier, MesureModele, ParametresOptimisation, Reglages3D, Texte3, TypeAnimation } from '../../../commun/types'
import { useSession } from '../../session'
import { formaterPoids, Onglets } from '../../ui'

export type Outil = 'position' | 'rotation' | 'taille' | 'rendu' | 'fichier'

export const OUTILS: Record<Outil, { libelle: string; icone: NomIcone; geste: string }> = {
  position: { libelle: 'Position', icone: 'deplacer', geste: 'Déplacer' },
  rotation: { libelle: 'Rotation', icone: 'pivoter', geste: 'Tourner' },
  taille: { libelle: 'Taille', icone: 'agrandir', geste: 'Agrandir' },
  // « Rendu » + icône soleil, mais premier réglage « vitesse » : déroutant (tests). L'onglet s'appelle
  // désormais « Lumière » et commence par la luminosité.
  rendu: { libelle: 'Lumière', icone: 'soleil', geste: 'Lumière' },
  fichier: { libelle: 'Fichier', icone: 'fichier', geste: 'Fichier' },
}

/** Outils qui ont des poignées dans la vue 3D. */
export const OUTILS_VUE: Outil[] = ['position', 'rotation', 'taille']

export const virgule = (v: number, decimales?: number) => (decimales === undefined ? String(v) : v.toFixed(decimales)).replace('.', ',')

/** Angle ramené entre −180° et 180°, au degré. */
export const normaliserAngle = (v: number) => Math.round(((((v + 180) % 360) + 360) % 360) - 180)

export function Curseur({
  libelle,
  valeur,
  min,
  max,
  pas,
  onChange,
  affichage,
  desactive,
}: {
  libelle: ReactNode
  valeur: number
  min: number
  max: number
  pas: number
  onChange: (v: number) => void
  affichage: ReactNode
  desactive?: boolean
}) {
  return (
    <label className="reglage-curseur">
      <span>
        {libelle} <b>{affichage}</b>
      </span>
      <input type="range" min={min} max={max} step={pas} value={valeur} onChange={(e) => onChange(Number(e.target.value))} disabled={desactive} />
    </label>
  )
}

/** Onglets d'outils du panneau : l'outil choisi règle aussi les poignées de la vue (déplacer, tourner, agrandir). */
export function OngletsOutils({ outil, onOutil, outils, desactive }: { outil: Outil; onOutil: (o: Outil) => void; outils: Outil[]; desactive?: boolean }) {
  return (
    <div className={`onglets-outils ${desactive ? 'inactifs' : ''}`} role="tablist" aria-label="Outils de l’atelier" style={{ gridTemplateColumns: `repeat(${outils.length}, minmax(0, 1fr))` }}>
      {outils.map((o) => (
        <button key={o} type="button" role="tab" aria-selected={outil === o} className={outil === o ? 'actif' : ''} onClick={() => onOutil(o)} disabled={desactive}>
          <Icone nom={OUTILS[o].icone} taille={17} />
          <span>{OUTILS[o].libelle}</span>
        </button>
      ))}
    </div>
  )
}

/** En-tête d'une section d'outil : titre et consigne courte. */
export function TitreOutil({ titre, consigne, action }: { titre: string; consigne?: ReactNode; action?: ReactNode }) {
  return (
    <div className="titre-outil">
      <div>
        <strong>{titre}</strong>
        {consigne && <small>{consigne}</small>}
      </div>
      {action}
    </div>
  )
}

/** Message d'un outil qui demande d'abord un modèle 3D. */
export function SansModele({ texte = 'Choisissez d’abord le modèle 3D de l’animation.' }: { texte?: string }) {
  return (
    <p className="outil-vide">
      <Icone nom="cube" taille={18} /> {texte}
    </p>
  )
}

const AXES = { x: 'Inclinaison avant / arrière (X)', y: 'Rotation sur lui-même (Y)', z: 'Bascule gauche / droite (Z)' } as const

/**
 * Rotation du modèle (réglage du fichier, appliqué partout où il sert) : anneaux dans la vue, ou curseurs
 * et quarts de tour. `avant` : réglage propre au lieu d'usage (orientation sur la carte d'un monument).
 */
export function SectionRotation({
  rotation,
  onChange,
  desactive,
  partage = 0,
  avant,
}: {
  rotation: Reglages3D['rotation']
  onChange: (r: Reglages3D['rotation']) => void
  desactive?: boolean
  /** Autres animations qui utilisent ce modèle (la rotation les concerne aussi). */
  partage?: number
  avant?: ReactNode
}) {
  const majAxe = (axe: 'x' | 'y' | 'z', v: number) => onChange({ ...rotation, [axe]: normaliserAngle(v) })
  const nulle = rotation.x === 0 && rotation.y === 0 && rotation.z === 0
  return (
    <div className="section-outil">
      {avant}
      <TitreOutil
        titre="Redresser le modèle"
        consigne="Faites glisser un anneau dans la vue, ou réglez chaque axe."
        action={
          <button type="button" className="btn btn-texte petit" onClick={() => onChange({ x: 0, y: 0, z: 0 })} disabled={desactive || nulle}>
            <Icone nom="relancer" taille={13} /> Remettre à 0
          </button>
        }
      />
      {(['x', 'y', 'z'] as const).map((axe) => (
        <div key={axe} className="reglage-rotation">
          <Curseur libelle={AXES[axe]} valeur={rotation[axe]} min={-180} max={180} pas={1} onChange={(v) => majAxe(axe, v)} affichage={`${rotation[axe]}°`} desactive={desactive} />
          <div className="boutons-rapides">
            <button type="button" onClick={() => majAxe(axe, rotation[axe] - 90)} aria-label={`−90° sur ${axe}`} disabled={desactive}>
              −90°
            </button>
            <button type="button" onClick={() => majAxe(axe, rotation[axe] + 90)} aria-label={`+90° sur ${axe}`} disabled={desactive}>
              +90°
            </button>
          </div>
        </div>
      ))}
      <small className="aide-champ">Un modèle exporté couché se redresse souvent avec −90° en X. Sa face avant regarde le visiteur.</small>
      {partage > 0 && (
        <p className="note-partage">
          <Icone nom="info" taille={14} /> Réglage du modèle : il s’applique aussi {partage > 1 ? `aux ${partage} autres animations` : 'à l’autre animation'} qui l’utilise{partage > 1 ? 'nt' : ''}.
        </p>
      )}
    </div>
  )
}

/** Rendu du modèle : vitesse des animations intégrées, luminosité, point d'ancrage, correction verticale. */
export function SectionRendu({ reglages, onChange, desactive }: { reglages: Reglages3D; onChange: (r: Reglages3D) => void; desactive?: boolean }) {
  const maj = (p: Partial<Reglages3D>) => onChange({ ...reglages, ...p })
  return (
    <div className="section-outil">
      <TitreOutil titre="Lumière" consigne="Éclaircissez le modèle s’il paraît trop sombre." />
      <Curseur libelle="Luminosité" valeur={reglages.luminosite} min={0.1} max={4} pas={0.05} onChange={(v) => maj({ luminosite: v })} affichage={`× ${virgule(reglages.luminosite, 2)}`} desactive={desactive} />
      <TitreOutil titre="Vitesse" consigne="Si le modèle bouge, accélérez ou ralentissez son mouvement." />
      <Curseur libelle="Vitesse du mouvement" valeur={reglages.vitesse} min={0.1} max={4} pas={0.05} onChange={(v) => maj({ vitesse: v })} affichage={`× ${virgule(reglages.vitesse, 2)}`} desactive={desactive} />
      <TitreOutil titre="Correction du modèle" consigne="À régler seulement si le modèle flotte ou s’enfonce." />
      <div className="choix-segment" role="group" aria-label="Point d’ancrage">
        <span>Point posé</span>
        {(['sol', 'centre'] as const).map((a) => (
          <button key={a} type="button" className={reglages.ancrage === a ? 'actif' : ''} aria-pressed={reglages.ancrage === a} onClick={() => maj({ ancrage: a })} disabled={desactive}>
            {a === 'sol' ? 'Le socle' : 'Le centre'}
          </button>
        ))}
      </div>
      <Curseur libelle="Correction verticale" valeur={reglages.hauteur} min={-1} max={1} pas={0.01} onChange={(v) => maj({ hauteur: v })} affichage={`${Math.round(reglages.hauteur * 100)} % de la taille`} desactive={desactive} />
      <button
        type="button"
        className="btn btn-texte petit"
        onClick={() => onChange({ ...reglages, ancrage: REGLAGES_3D_DEFAUT.ancrage, hauteur: REGLAGES_3D_DEFAUT.hauteur, vitesse: REGLAGES_3D_DEFAUT.vitesse, luminosite: REGLAGES_3D_DEFAUT.luminosite })}
        disabled={desactive}
      >
        <Icone nom="relancer" taille={13} /> Rendu d’origine
      </button>
    </div>
  )
}

function Mesure({ libelle, valeur, ok }: { libelle: string; valeur: string; ok: boolean }) {
  return (
    <li className={ok ? 'ok' : 'ko'}>
      <Icone nom={ok ? 'check' : 'alerte'} taille={13} />
      <span>{libelle}</span>
      <b>{valeur}</b>
    </li>
  )
}

function Comparaison({ avant, apres }: { avant: MesureModele; apres: MesureModele }) {
  const gain = (a: number, b: number) => (a > 0 ? Math.round((1 - b / a) * 100) : 0)
  return (
    <table className="comparaison-optimisation">
      <thead>
        <tr>
          <th />
          <th>Original</th>
          <th>Optimisé</th>
          <th>Gain</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Poids</th>
          <td>{formaterPoids(avant.octets)}</td>
          <td>{formaterPoids(apres.octets)}</td>
          <td>−{gain(avant.octets, apres.octets)} %</td>
        </tr>
        <tr>
          <th>Triangles</th>
          <td>{avant.triangles.toLocaleString('fr-FR')}</td>
          <td>{apres.triangles.toLocaleString('fr-FR')}</td>
          <td>−{gain(avant.triangles, apres.triangles)} %</td>
        </tr>
        <tr>
          <th>Textures</th>
          <td>{avant.texturePx} px</td>
          <td>{apres.texturePx} px</td>
          <td />
        </tr>
      </tbody>
    </table>
  )
}

/** Fichier du modèle : mesures face au budget, optimisation par le serveur (glTF-Transform), restauration. */
export function SectionFichier({ fichier, desactive }: { fichier: Fichier; desactive?: boolean }) {
  const [opt, setOpt] = useState<ParametresOptimisation>(fichier.optimisation?.parametres ?? { ...OPTIMISATION_DEFAUT })
  const [envoi, setEnvoi] = useState<'optimisation' | 'restauration' | null>(null)
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null)
  const budget = BUDGETS_3D[fichier.usage]
  const o = fichier.optimisation

  async function executer(type: NonNullable<typeof envoi>, action: () => Promise<unknown>, succes: string) {
    setEnvoi(type)
    setRetour(null)
    try {
      await action()
      setRetour({ ok: true, texte: succes })
    } catch (e) {
      setRetour({ ok: false, texte: messageErreur(e) })
    } finally {
      setEnvoi(null)
    }
  }

  return (
    <div className="section-outil">
      <TitreOutil titre={fichier.nomOriginal} consigne={`Budget ${fichier.usage === 'LIEU' ? 'animation de monument' : 'animation d’affiche'}`} />
      <ul className="mesures-modele">
        <Mesure libelle="Poids" valeur={formaterPoids(fichier.tailleOctets)} ok={fichier.tailleOctets <= budget.poidsMo * 1_000_000} />
        <Mesure libelle="Triangles" valeur={`${(fichier.nbTriangles ?? 0).toLocaleString('fr-FR')} / ${budget.triangles.toLocaleString('fr-FR')}`} ok={(fichier.nbTriangles ?? 0) <= budget.triangles} />
        <Mesure libelle="Textures" valeur={`${fichier.textureMaxPx ?? 0} px / ${budget.texturePx} px`} ok={(fichier.textureMaxPx ?? 0) <= budget.texturePx} />
        <Mesure libelle="Animations intégrées" valeur={String(fichier.clips?.length ?? 0)} ok />
      </ul>
      {retour && (
        <p className={retour.ok ? 'note-ok' : 'erreur-acces'} role={retour.ok ? 'status' : 'alert'}>
          <Icone nom={retour.ok ? 'check' : 'alerte'} taille={15} />
          {retour.texte}
        </p>
      )}
      <TitreOutil titre="Alléger le modèle" consigne="Le serveur nettoie le fichier et applique ces options ; l’original reste disponible." />
      <label className="champ">
        <span className="etiquette">Textures</span>
        <select value={opt.textureMaxPx ?? ''} onChange={(e) => setOpt({ ...opt, textureMaxPx: e.target.value ? (Number(e.target.value) as ParametresOptimisation['textureMaxPx']) : null })} disabled={desactive}>
          <option value="">Taille conservée</option>
          {[2048, 1024, 512, 256].map((t) => (
            <option key={t} value={t}>
              {t} px maximum{t === budget.texturePx ? ' (budget)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="case">
        <input type="checkbox" checked={opt.webp} onChange={(e) => setOpt({ ...opt, webp: e.target.checked })} disabled={desactive} />
        Textures en WebP (plus légères)
      </label>
      <Curseur
        libelle="Simplification de la géométrie"
        valeur={opt.simplification}
        min={0}
        max={0.9}
        pas={0.05}
        onChange={(v) => setOpt({ ...opt, simplification: v })}
        affichage={opt.simplification ? `−${Math.round(opt.simplification * 100)} % de triangles` : 'aucune'}
        desactive={desactive}
      />
      <label className="case">
        <input type="checkbox" checked={opt.compression} onChange={(e) => setOpt({ ...opt, compression: e.target.checked })} disabled={desactive} />
        Compression de la géométrie (Meshopt)
      </label>
      <button
        type="button"
        className="btn btn-secondaire btn-bloc"
        disabled={desactive || !!envoi || o?.etat === 'EN_COURS'}
        onClick={() => executer('optimisation', () => optimiserModele(fichier.id, opt), 'Modèle optimisé : vérifiez l’aperçu, l’original reste disponible.')}
      >
        {envoi === 'optimisation' || o?.etat === 'EN_COURS' ? (
          <>
            <span className="spinner" /> Optimisation en cours…
          </>
        ) : (
          <>
            <Icone nom="reglages" taille={15} /> Optimiser le modèle
          </>
        )}
      </button>
      {o?.etat === 'TERMINEE' && o.apres && <Comparaison avant={o.avant} apres={o.apres} />}
      {o?.etat === 'ECHEC' && (
        <p className="erreur-acces">
          <Icone nom="alerte" taille={15} /> Dernière optimisation échouée : {o.erreur}
        </p>
      )}
      {fichier.aOriginal && (
        <button type="button" className="btn btn-texte btn-bloc" disabled={desactive || !!envoi} onClick={() => executer('restauration', () => restaurerModele(fichier.id), 'Modèle d’origine restauré.')}>
          Restaurer le modèle d’origine
        </button>
      )}
      <small className="aide-champ">La simplification peut abîmer les modèles animés par os : vérifiez l’aperçu.</small>
    </div>
  )
}

// ------------------------------------------------------------------ réglages du modèle en cours d'édition

/**
 * Réglages du modèle (rotation, rendu) modifiés dans l'atelier : un brouillon par fichier, appliqué en
 * direct dans la vue, enregistré sur le fichier (il vaut pour toutes les animations qui l'utilisent).
 */
export function useReglagesModele(fichier?: Fichier) {
  const initial = useMemo(() => reglagesComplets(fichier?.reglages3d), [fichier?.reglages3d])
  const [reglages, setReglages] = useState<Reglages3D>(initial)
  const [fichierId, setFichierId] = useState(fichier?.id)
  // Autre modèle choisi : son brouillon repart de ses réglages enregistrés.
  if (fichier?.id !== fichierId) {
    setFichierId(fichier?.id)
    setReglages(initial)
  }
  const modifie = !!fichier && JSON.stringify(reglages) !== JSON.stringify(initial)
  return {
    reglages,
    setReglages,
    modifie,
    annuler: () => setReglages(initial),
    /** Enregistre le brouillon sur le fichier s'il a changé. */
    enregistrer: async () => {
      if (fichier && modifie) await enregistrerReglages3D(fichier.id, reglages)
    },
  }
}

/** Animations qui utilisent un modèle, hors celle en cours d'édition. */
export function useAutresAnimationsDuModele(modeleId?: string, animationId?: string) {
  const etat = useEtat()
  return useMemo(() => (modeleId ? etat.animations.filter((x) => x.modeleId === modeleId && x.id !== animationId) : []), [etat.animations, modeleId, animationId])
}

// ------------------------------------------------------------------ choix du modèle et du son

type ImportEnCours = { type: 'MODELE_3D' | 'SON'; progression: number; etape: string }

/**
 * Import d'un fichier depuis l'atelier : envoi à l'API, contrôle automatique (glTF-Validator, triangles,
 * animations / ffprobe), puis validation : le fichier est aussitôt utilisable par l'animation.
 */
function useImport(usage: TypeAnimation) {
  const [enCours, setEnCours] = useState<ImportEnCours | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  async function importer(fichier: File, type: 'MODELE_3D' | 'SON'): Promise<string | null> {
    setErreur(null)
    const ext = fichier.name.split('.').pop()?.toLowerCase() ?? ''
    if (type === 'MODELE_3D' && ext !== 'glb') return (setErreur('Le modèle 3D doit être un fichier GLB (glTF 2.0 binaire).'), null)
    if (type === 'SON' && !['mp3', 'm4a', 'aac'].includes(ext)) return (setErreur('Le son doit être un fichier MP3 ou AAC (M4A).'), null)
    if (type === 'MODELE_3D' && fichier.size > MODELE_3D_MAX_MO * 1_000_000) return (setErreur(`Fichier de ${formaterPoids(fichier.size)} : ${MODELE_3D_MAX_MO} Mo maximum pour un modèle 3D.`), null)
    try {
      setEnCours({ type, progression: 0, etape: 'Envoi' })
      const cree = await importerFichier(fichier, usage, (progression) => setEnCours({ type, progression, etape: 'Envoi' }))
      setEnCours({ type, progression: 1, etape: 'Contrôle automatique' })
      const controle = await attendreControle(cree.id, 5 * 60_000)
      if (controle.statutControle === 'REFUSE') throw new Error(`« ${fichier.name} » refusé : ${controle.raisonRefus ?? 'fichier non conforme'}.`)
      if (controle.statutControle !== 'CONFORME') await validerFichier(cree.id)
      return cree.id
    } catch (e) {
      setErreur(messageErreur(e))
      return null
    } finally {
      setEnCours(null)
    }
  }
  return { enCours, erreur, importer }
}

function BoutonImport({ type, enCours, onFichier, desactive }: { type: 'MODELE_3D' | 'SON'; enCours: ImportEnCours | null; onFichier: (f: File) => void; desactive?: boolean }) {
  return (
    <label className={`bouton-import-champ ${enCours || desactive ? 'inactif' : ''}`}>
      {enCours?.type === type ? (
        <>
          <span className="spinner" /> {enCours.etape}
          {enCours.etape === 'Envoi' ? ` ${Math.round(enCours.progression * 100)} %` : '…'}
        </>
      ) : (
        <>
          <Icone nom="import" taille={14} /> {type === 'MODELE_3D' ? 'Importer un GLB' : 'Importer un son'}
        </>
      )}
      <input
        type="file"
        hidden
        disabled={!!enCours || desactive}
        accept={type === 'MODELE_3D' ? '.glb,model/gltf-binary' : '.mp3,.m4a,.aac,audio/*'}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFichier(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

/** Fichiers conformes visibles par la session (un partenaire ne voit que les siens). */
function useFichiersConformes(type: 'MODELE_3D' | 'SON') {
  const etat = useEtat()
  const session = useSession()
  const agent = session.role === 'AGENT'
  return useMemo(
    () => etat.fichiers.filter((f) => f.type === type && f.statutControle === 'CONFORME' && (agent || f.proprietaireId === session.partenaireId)),
    [etat.fichiers, type, agent, session.partenaireId],
  )
}

/**
 * Modèle 3D de l'animation : choix parmi les modèles conformes ou import d'un GLB, puis animation
 * intégrée à jouer et mode de lecture. Affiche aussi le budget du type d'animation.
 */
/** Fichiers groupés par dossier : le dossier prioritaire d'abord, puis les autres, puis les fichiers hors dossier. */
function groupesParDossier(fichiers: Fichier[], prioritaire?: string): [string, Fichier[]][] {
  const groupes = new Map<string, Fichier[]>()
  for (const f of fichiers) {
    const cle = f.dossier ?? ''
    groupes.set(cle, [...(groupes.get(cle) ?? []), f])
  }
  return [...groupes.entries()]
    .sort(([a], [b]) => (a === prioritaire ? -1 : b === prioritaire ? 1 : !a ? 1 : !b ? -1 : a.localeCompare(b, 'fr')))
    .map(([cle, liste]) => [cle ? `Dossier « ${cle} »${cle === prioritaire ? ' (affiche)' : ''}` : 'Sans dossier', liste])
}

export function ChoixModele({
  animation,
  onChange,
  desactive,
  erreur,
  dossierPrioritaire,
}: {
  animation: Pick<Animation, 'type' | 'modeleId' | 'clipIndice' | 'lecture'>
  onChange: (p: Partial<Animation>) => void
  desactive?: boolean
  /** Signale le champ (modèle manquant à la validation). */
  erreur?: boolean
  /** Dossier de l'affiche : ses modèles sont proposés en premier. */
  dossierPrioritaire?: string
}) {
  const etat = useEtat()
  const modeles = useFichiersConformes('MODELE_3D')
  const imp = useImport(animation.type)
  const fichier = etat.fichiers.find((f) => f.id === animation.modeleId)
  const clips = (fichier?.clips ?? []).filter((c) => c.nom !== NOM_ANIMATION_COMBINEE)
  const budget = BUDGETS_3D[animation.type]
  const depasse = !!fichier && ((fichier.nbTriangles ?? 0) > budget.triangles || fichier.tailleOctets > budget.poidsMo * 1_000_000)
  return (
    <div className="choix-modele">
      <label className={`champ ${erreur ? 'erreur' : ''}`}>
        <span className="etiquette">
          Modèle 3D <BoutonImport type="MODELE_3D" enCours={imp.enCours} desactive={desactive} onFichier={(f) => void imp.importer(f, 'MODELE_3D').then((id) => id && onChange({ modeleId: id, clipIndice: undefined }))} />
        </span>
        <select value={animation.modeleId ?? ''} onChange={(e) => onChange({ modeleId: e.target.value || undefined, clipIndice: undefined })} disabled={desactive}>
          <option value="">Choisir un modèle…</option>
          {/* Modèles regroupés par dossier de la bibliothèque ; celui de l'affiche d'abord. */}
          {groupesParDossier(modeles, dossierPrioritaire).map(([nomGroupe, liste]) => (
            <optgroup key={nomGroupe} label={nomGroupe}>
              {liste.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nomOriginal} · {formaterPoids(f.tailleOctets)}
                </option>
              ))}
            </optgroup>
          ))}
          {fichier && !modeles.some((f) => f.id === fichier.id) && <option value={fichier.id}>{fichier.nomOriginal}</option>}
        </select>
      </label>
      {imp.erreur && (
        <p className="erreur-acces" role="alert">
          <Icone nom="alerte" taille={15} />
          {imp.erreur}
        </p>
      )}
      {fichier && (
        <small className={`budget-ligne ${depasse ? 'depasse' : ''}`}>
          <Icone nom={depasse ? 'alerte' : 'check'} taille={13} />
          {formaterPoids(fichier.tailleOctets)} · {(fichier.nbTriangles ?? 0).toLocaleString('fr-FR')} / {budget.triangles.toLocaleString('fr-FR')} triangles
          {depasse && ' — allégez-le dans l’outil « Fichier »'}
        </small>
      )}
      {clips.length > 0 && (
        <div className="grille-champs serree">
          <label className="champ">
            <span className="etiquette">Animation du modèle</span>
            <select value={animation.clipIndice ?? ''} onChange={(e) => onChange({ clipIndice: e.target.value === '' ? undefined : Number(e.target.value) })} disabled={desactive}>
              <option value="">Toutes ensemble</option>
              {clips.map((c, i) => (
                <option key={`${i}-${c.nom}`} value={c.indice ?? i}>
                  {c.nom} · {virgule(c.dureeS)} s
                </option>
              ))}
            </select>
          </label>
          <label className="champ">
            <span className="etiquette">Lecture</span>
            <select value={animation.lecture ?? 'BOUCLE'} onChange={(e) => onChange({ lecture: e.target.value as 'BOUCLE' | 'UNE_FOIS' })} disabled={desactive}>
              <option value="BOUCLE">En boucle</option>
              <option value="UNE_FOIS">Une seule fois</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

/**
 * Son de l'animation (facultatif), sa transcription pour l'accessibilité (FR obligatoire s'il y a un son)
 * et la durée de l'animation.
 */
export function SonEtDuree({
  animation,
  onChange,
  desactive,
  tente,
}: {
  animation: Pick<Animation, 'type' | 'sonId' | 'transcription' | 'dureeS'>
  onChange: (p: Partial<Animation>) => void
  desactive?: boolean
  /** Validation tentée : signale la transcription manquante. */
  tente?: boolean
}) {
  const sons = useFichiersConformes('SON')
  const imp = useImport(animation.type)
  const [langue, setLangue] = useState<keyof Texte3>('fr')
  const manque = tente && !!animation.sonId && !animation.transcription.fr.trim()
  return (
    <div className="son-et-duree">
      <div className="grille-champs">
        <label className="champ">
          <span className="etiquette">
            Son <small>Facultatif</small>
            <BoutonImport type="SON" enCours={imp.enCours} desactive={desactive} onFichier={(f) => void imp.importer(f, 'SON').then((id) => id && onChange({ sonId: id }))} />
          </span>
          <select value={animation.sonId ?? ''} onChange={(e) => onChange({ sonId: e.target.value || undefined })} disabled={desactive}>
            <option value="">Aucun son</option>
            {sons.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nomOriginal} · {f.dureeS} s
              </option>
            ))}
          </select>
        </label>
        <label className="champ">
          <span className="etiquette">
            Durée de l’animation <small>en secondes</small>
          </span>
          <input type="number" min={5} max={1800} value={animation.dureeS} onChange={(e) => onChange({ dureeS: Number(e.target.value) })} disabled={desactive} />
        </label>
      </div>
      {imp.erreur && (
        <p className="erreur-acces" role="alert">
          <Icone nom="alerte" taille={15} />
          {imp.erreur}
        </p>
      )}
      {animation.sonId && (
        <fieldset className={`transcriptions ${manque ? 'erreur' : ''}`}>
          <legend>Transcription du son (accessibilité, français obligatoire)</legend>
          <Onglets
            valeur={langue}
            onChange={setLangue}
            options={[
              { id: 'fr', libelle: `Français${animation.transcription.fr ? ' ✓' : ''}` },
              { id: 'en', libelle: `English${animation.transcription.en ? ' ✓' : ''}` },
              { id: 'de', libelle: `Deutsch${animation.transcription.de ? ' ✓' : ''}` },
            ]}
          />
          <textarea
            value={animation.transcription[langue]}
            onChange={(e) => onChange({ transcription: { ...animation.transcription, [langue]: e.target.value } })}
            rows={3}
            disabled={desactive}
            placeholder="Décrivez les sons et la narration pour les personnes sourdes ou malentendantes…"
          />
        </fieldset>
      )}
    </div>
  )
}
