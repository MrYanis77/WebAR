import { lazy, Suspense, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D, FORMATS_ACCEPTES, MODELE_3D_MAX_MO } from '../../commun/constantes'
import { Icone, type NomIcone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { importerFichier, nomProprietaire, rangerFichier, rangerFichiers, supprimerFichier, useEtat, validerFichier } from '../../commun/store'
import type { Fichier, TypeFichier } from '../../commun/types'
import { peutCreer, useSession } from '../session'
import { BadgeStatut, EnTetePage, formaterDate, formaterPoids, Onglets, Panneau, useToast, Vide } from '../ui'

const ApercuModele3D = lazy(() => import('../composants/ApercuModele3D'))
const Atelier3D = lazy(() => import('../composants/Atelier3D'))

const ICONES: Record<TypeFichier, NomIcone> = { MODELE_3D: 'cube', SON: 'musique', IMAGE: 'image' }
/** Glisser-déposer d'une ligne de fichier sur un dossier (distinct d'un import depuis l'ordinateur). */
const TYPE_GLISSER = 'application/x-fichiers-webar'
/** Étapes du contrôle automatique exécuté par l'API (file-type, glTF-Validator, glTF-Transform, ffprobe, sharp). */
const ETAPES = ['Envoi au serveur', 'Type réel du fichier (file-type)', 'Validation glTF / audio / image', 'Mesure : triangles, textures, animations']

interface Verification {
  libelle: string
  ok: boolean
  detail: string
}

/** Rapport de contrôle automatique (format, poids, complexité) — BF-36, BNF-19. */
function rapport(f: Fichier): Verification[] {
  const b = BUDGETS_3D[f.usage]
  const v: Verification[] = [{ libelle: 'Format autorisé', ok: true, detail: f.nomOriginal.split('.').pop()?.toUpperCase() ?? '' }]
  if (f.type === 'MODELE_3D') {
    v.push({ libelle: 'Poids', ok: f.tailleOctets <= b.poidsMo * 1_000_000, detail: `${formaterPoids(f.tailleOctets)} / ${b.poidsMo} Mo` })
    v.push({ libelle: 'Triangles', ok: (f.nbTriangles ?? 0) <= b.triangles, detail: `${(f.nbTriangles ?? 0).toLocaleString('fr-FR')} / ${b.triangles.toLocaleString('fr-FR')}` })
    v.push({ libelle: 'Textures', ok: (f.textureMaxPx ?? 0) <= b.texturePx, detail: `${f.textureMaxPx ?? 0} px / ${b.texturePx} px` })
    v.push({ libelle: 'Ressources externes', ok: true, detail: 'Aucune' })
    v.push({
      libelle: 'Animations intégrées',
      ok: true,
      detail: f.clips?.length ? f.clips.map((c) => `${c.nom} (${c.dureeS.toString().replace('.', ',')} s)`).join(' · ') : 'Aucune (modèle statique)',
    })
  } else if (f.type === 'SON') {
    v.push({ libelle: 'Poids', ok: f.tailleOctets <= b.sonMo * 1_000_000, detail: `${formaterPoids(f.tailleOctets)} / ${b.sonMo} Mo` })
    v.push({ libelle: 'Durée', ok: (f.dureeS ?? 0) <= 120, detail: `${Math.round(f.dureeS ?? 0)} s` })
  } else {
    v.push({ libelle: 'Poids', ok: f.tailleOctets <= 30_000_000, detail: `${formaterPoids(f.tailleOctets)} / 30 Mo` })
    v.push({ libelle: 'Dimensions', ok: true, detail: f.largeurPx ? `${f.largeurPx} × ${f.hauteurPx} px` : '—' })
    v.push({ libelle: 'Réencodage', ok: true, detail: 'sharp (orientation, métadonnées retirées)' })
  }
  return v
}

export default function PageFichiers() {
  const etat = useEtat()
  const session = useSession()
  const toast = useToast()
  const agent = session.role === 'AGENT'
  const [onglet, setOnglet] = useState<'tous' | TypeFichier>('tous')
  const [usage, setUsage] = useState<'AFFICHE' | 'LIEU'>(agent ? 'LIEU' : 'AFFICHE')
  const [selection, setSelection] = useState<string | null>(null)
  /** Modèle ouvert dans l'atelier 3D. */
  const [atelier, setAtelier] = useState<string | null>(null)
  const fichierAtelier = etat.fichiers.find((f) => f.id === atelier)
  /** Envoi en cours : progression de 0 à 1. */
  const [envoi, setEnvoi] = useState<{ nom: string; progression: number } | null>(null)
  const [action, setAction] = useState(false)
  const [rejet, setRejet] = useState<string | null>(null)
  const [survol, setSurvol] = useState(false)
  const entree = useRef<HTMLInputElement>(null)
  const autorise = peutCreer(etat, session)

  // ------------------------------------------------------------ dossiers (affiche + modèle 3D + son d'un même projet)
  /** Dossier affiché : « tous », un nom de dossier, ou '' pour les fichiers hors dossier. */
  const [dossier, setDossier] = useState<string>('tous')
  /** Dossiers créés pendant la session, encore vides (ils existent dès qu'un fichier y est rangé). */
  const [dossiersVides, setDossiersVides] = useState<string[]>([])
  const [nouveauDossier, setNouveauDossier] = useState<string | null>(null)
  /** Nouveau nom en cours de saisie pour le dossier ouvert. */
  const [renommage, setRenommage] = useState<string | null>(null)
  /** Fichiers cochés, à déplacer ensemble. */
  const [coches, setCoches] = useState<Set<string>>(() => new Set())
  /** Dossier survolé pendant un glisser-déposer ('' : « Sans dossier »). */
  const [cibleDepot, setCibleDepot] = useState<string | null>(null)
  const mesFichiers = etat.fichiers.filter((f) => agent || f.proprietaireId === session.partenaireId)
  const dossiers = [...new Set([...mesFichiers.map((f) => f.dossier).filter((d): d is string => !!d), ...dossiersVides])].sort((a, b) => a.localeCompare(b, 'fr'))
  const fichiers = mesFichiers
    .filter((f) => onglet === 'tous' || f.type === onglet)
    .filter((f) => dossier === 'tous' || (f.dossier ?? '') === dossier)

  function creerDossier() {
    const nomDossier = (nouveauDossier ?? '').trim().slice(0, 80)
    setNouveauDossier(null)
    if (!nomDossier) return
    if (!dossiers.includes(nomDossier)) setDossiersVides((l) => [...l, nomDossier])
    setDossier(nomDossier)
  }

  const peutRanger = (f: Fichier) => autorise && (agent || f.proprietaireId === session.partenaireId)
  const fichiersDuDossier = (d: string) => mesFichiers.filter((f) => f.dossier === d)
  const basculerCoche = (id: string) =>
    setCoches((c) => {
      const n = new Set(c)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  /** Range plusieurs fichiers d'un coup (sélection cochée ou fichiers glissés sur un dossier). */
  async function rangerPlusieurs(ids: string[], cibleDossier: string | null) {
    if (!ids.length) return
    setAction(true)
    try {
      await rangerFichiers(ids, cibleDossier)
      setCoches(new Set())
      const n = ids.length > 1 ? `${ids.length} fichiers` : '1 fichier'
      toast.afficher(cibleDossier ? `${n} rangé${ids.length > 1 ? 's' : ''} dans « ${cibleDossier} »` : `${n} sorti${ids.length > 1 ? 's' : ''} de son dossier`)
    } catch (e) {
      toast.afficher(messageErreur(e))
    } finally {
      setAction(false)
    }
  }

  /** Renomme le dossier ouvert : ses fichiers passent sous le nouveau nom. */
  async function renommerDossier() {
    const ancien = dossier
    const nouveau = (renommage ?? '').trim().slice(0, 80)
    setRenommage(null)
    if (!nouveau || nouveau === ancien) return
    if (dossiers.includes(nouveau)) {
      toast.afficher(`Un dossier « ${nouveau} » existe déjà : choisissez un autre nom`)
      return
    }
    setAction(true)
    try {
      await rangerFichiers(fichiersDuDossier(ancien).map((f) => f.id), nouveau)
      setDossiersVides((l) => l.map((d) => (d === ancien ? nouveau : d)))
      setDossier(nouveau)
      toast.afficher(`Dossier renommé en « ${nouveau} »`)
    } catch (e) {
      toast.afficher(messageErreur(e))
    } finally {
      setAction(false)
    }
  }

  /** Supprime le dossier ouvert ; ses fichiers ne sont pas supprimés, ils passent « sans dossier ». */
  async function supprimerDossier() {
    const nomDossier = dossier
    const contenu = fichiersDuDossier(nomDossier)
    const message = contenu.length
      ? `Supprimer le dossier « ${nomDossier} » ?\n\nSes fichiers ne sont pas supprimés : ${contenu.length > 1 ? `les ${contenu.length} fichiers passent` : 'le fichier passe'} dans « Sans dossier ».`
      : `Supprimer le dossier vide « ${nomDossier} » ?`
    if (!window.confirm(message)) return
    setAction(true)
    try {
      if (contenu.length) await rangerFichiers(contenu.map((f) => f.id), null)
      setDossiersVides((l) => l.filter((d) => d !== nomDossier))
      setDossier('tous')
      toast.afficher(`Dossier « ${nomDossier} » supprimé${contenu.length ? ' : ses fichiers sont dans « Sans dossier »' : ''}`)
    } catch (e) {
      toast.afficher(messageErreur(e))
    } finally {
      setAction(false)
    }
  }

  /** Cible d'un glisser-déposer : un dossier, ou « Sans dossier » avec null. */
  const depot = (cibleDossier: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(TYPE_GLISSER)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setCibleDepot(cibleDossier ?? '')
    },
    onDragLeave: () => setCibleDepot(null),
    onDrop: (e: DragEvent) => {
      const donnees = e.dataTransfer.getData(TYPE_GLISSER)
      setCibleDepot(null)
      if (!donnees) return
      e.preventDefault()
      const ids = (JSON.parse(donnees) as string[]).filter((id) => (etat.fichiers.find((f) => f.id === id)?.dossier ?? null) !== cibleDossier)
      void rangerPlusieurs(ids, cibleDossier)
    },
  })

  async function deplacer(f: Fichier, cibleDossier: string | null) {
    setAction(true)
    try {
      await rangerFichier(f.id, cibleDossier)
      toast.afficher(cibleDossier ? `« ${f.nomOriginal} » rangé dans « ${cibleDossier} »` : `« ${f.nomOriginal} » sorti de son dossier`)
    } catch (e) {
      toast.afficher(messageErreur(e))
    } finally {
      setAction(false)
    }
  }
  const courant = etat.fichiers.find((f) => f.id === selection) ?? fichiers[0]

  /**
   * Pré-contrôle du format et du poids dans le navigateur (message immédiat), puis envoi à l'API :
   * le serveur refait toutes les vérifications et lance le contrôle automatique en arrière-plan.
   */
  async function importer(fichier: File) {
    setRejet(null)
    const ext = fichier.name.split('.').pop()?.toLowerCase() ?? ''
    if (!(FORMATS_ACCEPTES as readonly string[]).includes(ext)) {
      setRejet(`« ${fichier.name} » refusé : seuls les formats GLB, MP3, AAC (M4A), PNG et JPEG sont acceptés.`)
      return
    }
    if (ext === 'glb' && fichier.size > MODELE_3D_MAX_MO * 1_000_000) {
      setRejet(`« ${fichier.name} » refusé : ${formaterPoids(fichier.size)}, le maximum pour un modèle 3D est de ${MODELE_3D_MAX_MO} Mo.`)
      return
    }
    setEnvoi({ nom: fichier.name, progression: 0 })
    try {
      // Import rangé directement dans le dossier ouvert.
      const cree = await importerFichier(fichier, usage, (progression) => setEnvoi({ nom: fichier.name, progression }), dossier !== 'tous' && dossier ? dossier : undefined)
      setSelection(cree.id)
    } catch (e) {
      setRejet(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    const f = e.dataTransfer.files[0]
    if (f && autorise) void importer(f)
  }

  const verifs = courant ? rapport(courant) : []
  const controleOk = verifs.every((v) => v.ok)
  /** Contrôle automatique encore en cours côté serveur. */
  const enControle = (f: Fichier) => f.statutControle === 'EN_COURS' && !f.controleTermine

  return (
    <>
      <EnTetePage
        titre="Fichiers 3D & sons"
        description="Importez vos modèles 3D, sons et images, puis rangez-les dans des dossiers."
      />
      <div className="bo-defilement">
        {!autorise && (
          <div className="bo-alerte en-ligne">
            <Icone nom="cadenas" taille={16} />
            L’import est possible après vérification du compte et acceptation de la charte.
            <Link to="/backoffice/charte">Voir la charte</Link>
          </div>
        )}
        <div
          className={`depot ${survol ? 'survol' : ''} ${autorise ? '' : 'inactif'}`}
          onDragOver={(e) => {
            e.preventDefault()
            setSurvol(true)
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={deposer}
        >
          <span>
            <Icone nom="import" taille={24} />
          </span>
          <div>
            <strong>Glissez un fichier ici ou choisissez-le</strong>
            <p title="GLB (glTF 2.0) avec ses animations intégrées · affiche 30 000 triangles · lieu 100 000 triangles">GLB, MP3, M4A, PNG ou JPEG · 100 Mo maximum</p>
          </div>
          <label className="select-compact">
            Usage
            <select value={usage} onChange={(e) => setUsage(e.target.value as 'AFFICHE' | 'LIEU')} disabled={!agent}>
              <option value="AFFICHE">Animation d’affiche</option>
              <option value="LIEU">Animation de lieu</option>
            </select>
          </label>
          <button type="button" className="btn btn-primaire" disabled={!autorise} onClick={() => entree.current?.click()}>
            Choisir un fichier
          </button>
          <input
            ref={entree}
            type="file"
            hidden
            accept=".glb,.mp3,.m4a,.aac,.png,.jpg,.jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importer(f)
              e.target.value = ''
            }}
          />
        </div>
        {envoi && (
          <div className="envoi-fichier" role="status">
            <span className="spinner" /> Envoi de « {envoi.nom} » : {Math.round(envoi.progression * 100)} %
            <progress max={1} value={envoi.progression} />
          </div>
        )}
        {rejet && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {rejet}
          </p>
        )}

        <nav className="barre-dossiers" aria-label="Dossiers">
          <span className="libelle-dossiers">
            <Icone nom="dossier" taille={16} /> Dossiers
          </span>
          <button type="button" aria-pressed={dossier === 'tous'} onClick={() => setDossier('tous')}>
            Tous les fichiers <b>{mesFichiers.length}</b>
          </button>
          {dossiers.map((d) => (
            <button key={d} type="button" aria-pressed={dossier === d} className={cibleDepot === d ? 'cible-depot' : undefined} onClick={() => setDossier(d)} {...depot(d)}>
              <Icone nom="dossier" taille={14} /> {d} <b>{fichiersDuDossier(d).length}</b>
            </button>
          ))}
          <button type="button" aria-pressed={dossier === ''} className={cibleDepot === '' ? 'cible-depot' : undefined} onClick={() => setDossier('')} {...depot(null)}>
            Sans dossier <b>{mesFichiers.filter((f) => !f.dossier).length}</b>
          </button>
          {nouveauDossier === null ? (
            <button type="button" className="ajout-dossier" onClick={() => setNouveauDossier('')} disabled={!autorise}>
              <Icone nom="plus" taille={14} /> Nouveau dossier
            </button>
          ) : (
            <form
              className="saisie-dossier"
              onSubmit={(e) => {
                e.preventDefault()
                creerDossier()
              }}
            >
              <input autoFocus value={nouveauDossier} onChange={(e) => setNouveauDossier(e.target.value)} placeholder="Ex. Marché de Noël" maxLength={80} aria-label="Nom du nouveau dossier" onKeyDown={(e) => e.key === 'Escape' && setNouveauDossier(null)} />
              <button type="submit" className="btn btn-primaire petit" disabled={!nouveauDossier.trim()}>
                Créer
              </button>
              <button type="button" className="btn btn-fantome petit" onClick={() => setNouveauDossier(null)}>
                Annuler
              </button>
            </form>
          )}
        </nav>
        {dossier !== 'tous' && dossier ? (
          <div className="outils-dossier">
            {renommage === null ? (
              <>
                <span className="nom-dossier-ouvert">
                  <Icone nom="dossier" taille={16} /> <strong>{dossier}</strong>
                  <small>
                    {fichiersDuDossier(dossier).length} fichier{fichiersDuDossier(dossier).length > 1 ? 's' : ''} · les imports s’y rangent directement
                  </small>
                </span>
                <button type="button" className="btn btn-fantome petit" onClick={() => setRenommage(dossier)} disabled={!autorise || action}>
                  <Icone nom="crayon" taille={14} /> Renommer
                </button>
                <button type="button" className="btn btn-texte-danger petit" onClick={() => void supprimerDossier()} disabled={!autorise || action}>
                  <Icone nom="poubelle" taille={14} /> Supprimer le dossier
                </button>
              </>
            ) : (
              <form
                className="saisie-dossier"
                onSubmit={(e) => {
                  e.preventDefault()
                  void renommerDossier()
                }}
              >
                <Icone nom="dossier" taille={16} />
                <input autoFocus value={renommage} onChange={(e) => setRenommage(e.target.value)} maxLength={80} aria-label={`Nouveau nom du dossier « ${dossier} »`} onKeyDown={(e) => e.key === 'Escape' && setRenommage(null)} />
                <button type="submit" className="btn btn-primaire petit" disabled={!renommage.trim() || renommage.trim() === dossier}>
                  Renommer
                </button>
                <button type="button" className="btn btn-fantome petit" onClick={() => setRenommage(null)}>
                  Annuler
                </button>
              </form>
            )}
          </div>
        ) : (
          dossiers.length > 0 && (
            <p className="aide-dossier">
              <Icone nom="deplacer" taille={14} /> Pour ranger des fichiers : cochez-les puis « Déplacer vers », ou glissez-les sur un dossier.
            </p>
          )
        )}

        <div className="grille-fichiers">
          <Panneau
            titre={dossier === 'tous' ? 'Bibliothèque' : dossier ? `Dossier « ${dossier} »` : 'Fichiers sans dossier'}
            action={
              <Onglets
                valeur={onglet}
                onChange={setOnglet}
                options={[
                  { id: 'tous', libelle: 'Tous' },
                  { id: 'MODELE_3D', libelle: '3D' },
                  { id: 'SON', libelle: 'Sons' },
                  { id: 'IMAGE', libelle: 'Images' },
                ]}
              />
            }
          >
            {coches.size > 0 && (
              <div className="barre-selection" role="region" aria-label="Fichiers sélectionnés">
                <strong>
                  {coches.size} sélectionné{coches.size > 1 ? 's' : ''}
                </strong>
                <label>
                  <Icone nom="deplacer" taille={14} /> Déplacer vers
                  <select
                    value=""
                    disabled={action}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) void rangerPlusieurs([...coches], v === '__aucun' ? null : v)
                    }}
                  >
                    <option value="">Choisir…</option>
                    {dossiers.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value="__aucun">Sans dossier</option>
                  </select>
                </label>
                <button type="button" className="btn btn-fantome petit" onClick={() => setCoches(new Set())}>
                  Annuler
                </button>
              </div>
            )}
            {fichiers.length === 0 ? (
              <Vide icone="cube" titre="Aucun fichier" texte={dossier !== 'tous' && dossier ? 'Dossier vide : importez un fichier ici, ou glissez-y des fichiers.' : 'Importez votre premier modèle 3D ou son.'} />
            ) : (
              <ul className="liste-fichiers">
                {fichiers.map((f) => (
                  <li
                    key={f.id}
                    className={coches.has(f.id) ? 'coche' : undefined}
                    draggable={peutRanger(f)}
                    onDragStart={(e) => {
                      const ids = coches.has(f.id) ? [...coches] : [f.id]
                      e.dataTransfer.setData(TYPE_GLISSER, JSON.stringify(ids))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setCibleDepot(null)}
                  >
                    <input type="checkbox" className="case-fichier" checked={coches.has(f.id)} onChange={() => basculerCoche(f.id)} disabled={!peutRanger(f)} aria-label={`Sélectionner « ${f.nomOriginal} »`} />
                    <button type="button" className={courant?.id === f.id ? 'actif' : ''} onClick={() => setSelection(f.id)}>
                      <span className="icone-fichier">
                        <Icone nom={ICONES[f.type]} taille={18} />
                      </span>
                      <div>
                        <strong>{f.nomOriginal}</strong>
                        <small>
                          {dossier === 'tous' && f.dossier && `${f.dossier} · `}
                          {formaterPoids(f.tailleOctets)} · {f.usage === 'LIEU' ? 'lieu' : 'affiche'} · {formaterDate(f.creeLe, { day: '2-digit', month: 'short' })}
                          {agent && f.proprietaireId !== 'ville' && ` · ${nomProprietaire(etat, f.proprietaireId)}`}
                        </small>
                      </div>
                      {enControle(f) ? <span className="spinner" /> : <BadgeStatut statut={f.statutControle} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>

          {courant && (
            <Panneau titre={courant.nomOriginal} sousTitre="Rapport de contrôle automatique">
              <label className="champ choix-dossier">
                <span className="etiquette">
                  <span>
                    <Icone nom="dossier" taille={14} /> Ranger dans le dossier
                  </span>
                </span>
                <select value={courant.dossier ?? ''} onChange={(e) => void deplacer(courant, e.target.value || null)} disabled={action || (!agent && courant.proprietaireId !== session.partenaireId)}>
                  <option value="">Sans dossier</option>
                  {dossiers.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              {courant.type === 'MODELE_3D' && courant.statutControle !== 'REFUSE' && (
                <Suspense fallback={<div className="apercu-3d" />}>
                  <ApercuModele3D url={courant.url} />
                </Suspense>
              )}
              {courant.type === 'MODELE_3D' && !enControle(courant) && (
                <div className="ouvrir-atelier">
                  <div>
                    <strong>Atelier 3D</strong>
                    <small>
                      Position, rotation, taille, rendu et optimisation, sur l’affiche ou au monument
                      {courant.optimisation?.etat === 'TERMINEE' ? ' · optimisé' : ''}
                      {courant.reglages3d ? ' · réglé' : ''}
                    </small>
                  </div>
                  <span className="actions-atelier">
                    <button type="button" className="btn btn-primaire" onClick={() => setAtelier(courant.id)}>
                      <Icone nom="reglages" taille={15} /> Ouvrir l’atelier
                    </button>
                  </span>
                </div>
              )}
              {courant.type === 'SON' && (
                <div className="apercu-son">
                  <Icone nom="musique" taille={28} />
                  <audio controls preload="metadata" src={courant.url} />
                </div>
              )}
              {courant.type === 'IMAGE' && <img className="apercu-image" src={courant.url} alt={`Aperçu de ${courant.nomOriginal}`} />}
              {enControle(courant) ? (
                <ol className="etapes-controle">
                  {ETAPES.map((e, i) => (
                    <li key={e} className={i === 0 ? 'fait' : 'courant'}>
                      {i === 0 ? <Icone nom="check" taille={14} /> : <span className="spinner" />}
                      {e}
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <ul className="rapport">
                    {verifs.map((v) => (
                      <li key={v.libelle} className={v.ok ? 'ok' : 'ko'}>
                        <Icone nom={v.ok ? 'check' : 'fermer'} taille={14} />
                        <span>{v.libelle}</span>
                        <b>{v.detail}</b>
                      </li>
                    ))}
                  </ul>
                  {courant.statutControle === 'REFUSE' && (
                    <p className="erreur-acces">
                      <Icone nom="alerte" taille={15} />
                      Refusé : {courant.raisonRefus}
                    </p>
                  )}
                  {courant.statutControle === 'EN_COURS' && (
                    <div className="validation-fichier">
                      <p>{controleOk ? 'Contrôle réussi. Vérifiez l’aperçu puis validez l’enregistrement.' : 'Contrôle terminé avec des alertes.'}</p>
                      <button
                        type="button"
                        className="btn btn-primaire"
                        disabled={action}
                        onClick={async () => {
                          setAction(true)
                          try {
                            await validerFichier(courant.id)
                            toast.afficher('Fichier conforme et enregistré')
                          } catch (e) {
                            toast.afficher(messageErreur(e))
                          } finally {
                            setAction(false)
                          }
                        }}
                      >
                        Valider l’enregistrement
                      </button>
                    </div>
                  )}
                  {courant.statutControle === 'CONFORME' && (
                    <p className="note-ok">
                      <Icone nom="check" taille={15} /> Conforme. Toute modification d’un fichier déjà diffusé relance ce contrôle.
                    </p>
                  )}
                  {/* Suppression refusée par l'API (409) tant que le fichier est utilisé par une animation, une affiche ou un lieu. */}
                  <button
                    type="button"
                    className="btn-texte-danger supprimer-fichier"
                    disabled={action}
                    onClick={async () => {
                      if (!window.confirm(`Supprimer « ${courant.nomOriginal} » ?`)) return
                      setAction(true)
                      try {
                        await supprimerFichier(courant.id)
                        setSelection(null)
                        toast.afficher('Fichier supprimé')
                      } catch (e) {
                        toast.afficher(messageErreur(e))
                      } finally {
                        setAction(false)
                      }
                    }}
                  >
                    Supprimer le fichier
                  </button>
                </>
              )}
            </Panneau>
          )}
        </div>
      </div>
      {fichierAtelier && (
        <Suspense fallback={null}>
          <Atelier3D key={fichierAtelier.id} fichier={fichierAtelier} onFermer={() => setAtelier(null)} />
        </Suspense>
      )}
      {toast.element}
    </>
  )
}
