import { lazy, Suspense, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D, FORMATS_ACCEPTES, MODELE_3D_MAX_MO } from '../../commun/constantes'
import { Icone, type NomIcone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { importerFichier, nomProprietaire, supprimerFichier, useEtat, validerFichier } from '../../commun/store'
import type { Fichier, TypeFichier } from '../../commun/types'
import { peutCreer, useSession } from '../session'
import { BadgeStatut, EnTetePage, formaterDate, formaterPoids, Onglets, Panneau, useToast, Vide } from '../ui'

const ApercuModele3D = lazy(() => import('../composants/ApercuModele3D'))

const ICONES: Record<TypeFichier, NomIcone> = { MODELE_3D: 'cube', SON: 'musique', IMAGE: 'image' }
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
  /** Envoi en cours : progression de 0 à 1. */
  const [envoi, setEnvoi] = useState<{ nom: string; progression: number } | null>(null)
  const [action, setAction] = useState(false)
  const [rejet, setRejet] = useState<string | null>(null)
  const [survol, setSurvol] = useState(false)
  const entree = useRef<HTMLInputElement>(null)
  const autorise = peutCreer(etat, session)

  const fichiers = etat.fichiers.filter((f) => agent || f.proprietaireId === session.partenaireId).filter((f) => onglet === 'tous' || f.type === onglet)
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
      const cree = await importerFichier(fichier, usage, (progression) => setEnvoi({ nom: fichier.name, progression }))
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
      <EnTetePage titre="Fichiers 3D & sons" description="Importez vos modèles et sons : contrôle automatique, aperçu 3D, puis validation de l’enregistrement." />
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
            <p>GLB (glTF 2.0) jusqu’à 100 Mo avec ses animations intégrées, MP3, AAC/M4A, PNG, JPEG · affiche 30 000 triangles · lieu 100 000 triangles</p>
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

        <div className="grille-fichiers">
          <Panneau
            titre="Bibliothèque"
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
            {fichiers.length === 0 ? (
              <Vide icone="cube" titre="Aucun fichier" texte="Importez votre premier modèle 3D ou son." />
            ) : (
              <ul className="liste-fichiers">
                {fichiers.map((f) => (
                  <li key={f.id}>
                    <button type="button" className={courant?.id === f.id ? 'actif' : ''} onClick={() => setSelection(f.id)}>
                      <span className="icone-fichier">
                        <Icone nom={ICONES[f.type]} taille={18} />
                      </span>
                      <div>
                        <strong>{f.nomOriginal}</strong>
                        <small>
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
              {courant.type === 'MODELE_3D' && courant.statutControle !== 'REFUSE' && (
                <Suspense fallback={<div className="apercu-3d" />}>
                  <ApercuModele3D url={courant.url} />
                </Suspense>
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
      {toast.element}
    </>
  )
}
