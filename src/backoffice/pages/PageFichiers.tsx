import { lazy, Suspense, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { BUDGETS_3D, FORMATS_ACCEPTES } from '../../commun/constantes'
import { Icone, type NomIcone } from '../../commun/Icone'
import { ajouterFichier, majFichier, nomProprietaire, useEtat } from '../../commun/store'
import type { Fichier, TypeFichier } from '../../commun/types'
import { analyserGLB, dimensionsImage, dureeAudio } from '../composants/analyse3D'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, EnTetePage, formaterDate, formaterPoids, Onglets, Panneau, useToast, Vide } from '../ui'

const ApercuModele3D = lazy(() => import('../composants/ApercuModele3D'))

const ICONES: Record<TypeFichier, NomIcone> = { MODELE_3D: 'cube', SON: 'musique', IMAGE: 'image' }
const ETAPES = ['Réception et renommage', 'Type réel du fichier', 'Validation glTF / audio', 'Optimisation (Meshopt, KTX2)']

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
  } else if (f.type === 'SON') {
    v.push({ libelle: 'Poids', ok: f.tailleOctets <= b.sonMo * 1_000_000, detail: `${formaterPoids(f.tailleOctets)} / ${b.sonMo} Mo` })
    v.push({ libelle: 'Durée', ok: (f.dureeS ?? 0) <= 120, detail: `${Math.round(f.dureeS ?? 0)} s` })
  } else {
    v.push({ libelle: 'Poids', ok: f.tailleOctets <= 10_000_000, detail: `${formaterPoids(f.tailleOctets)} / 10 Mo` })
    v.push({ libelle: 'Réencodage', ok: true, detail: 'sharp (WebP)' })
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
  const [traitement, setTraitement] = useState<{ id: string; etape: number } | null>(null)
  const [rejet, setRejet] = useState<string | null>(null)
  const [survol, setSurvol] = useState(false)
  const originaux = useRef(new Map<string, File>())
  const entree = useRef<HTMLInputElement>(null)
  const autorise = peutCreer(etat, session)

  const fichiers = etat.fichiers.filter((f) => agent || f.proprietaireId === session.partenaireId).filter((f) => onglet === 'tous' || f.type === onglet)
  const courant = etat.fichiers.find((f) => f.id === selection) ?? fichiers[0]

  async function importer(fichier: File) {
    setRejet(null)
    const ext = fichier.name.split('.').pop()?.toLowerCase() ?? ''
    if (!(FORMATS_ACCEPTES as readonly string[]).includes(ext)) {
      setRejet(`« ${fichier.name} » refusé : seuls les formats GLB, MP3, AAC (M4A), PNG et JPEG sont acceptés.`)
      return
    }
    const type: TypeFichier = ext === 'glb' ? 'MODELE_3D' : ['mp3', 'm4a', 'aac'].includes(ext) ? 'SON' : 'IMAGE'
    const id = ajouterFichier({ proprietaireId: proprietaireDe(session), type, nomOriginal: fichier.name, tailleOctets: fichier.size, statutControle: 'EN_COURS', usage })
    originaux.current.set(id, fichier)
    setSelection(id)
    for (let i = 0; i < ETAPES.length; i++) {
      setTraitement({ id, etape: i })
      await new Promise((r) => setTimeout(r, 450))
    }
    try {
      if (type === 'MODELE_3D') {
        const a = await analyserGLB(fichier)
        majFichier(id, { nbTriangles: a.triangles, textureMaxPx: a.textureMax })
      } else if (type === 'SON') {
        majFichier(id, { dureeS: Math.round(await dureeAudio(fichier)) })
      } else {
        const d = await dimensionsImage(fichier)
        majFichier(id, { textureMaxPx: Math.max(d.l, d.h) })
      }
    } catch (e) {
      majFichier(id, { statutControle: 'REFUSE', raisonRefus: (e as Error).message })
    }
    setTraitement(null)
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    const f = e.dataTransfer.files[0]
    if (f && autorise) void importer(f)
  }

  const verifs = courant ? rapport(courant) : []
  const controleOk = verifs.every((v) => v.ok)

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
            <p>GLB (glTF 2.0), MP3, AAC/M4A, PNG, JPEG · budget affiche 4 Mo / 30 000 triangles · lieu 10 Mo / 100 000 triangles</p>
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
                      {traitement?.id === f.id ? <span className="spinner" /> : <BadgeStatut statut={f.statutControle} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panneau>

          {courant && (
            <Panneau titre={courant.nomOriginal} sousTitre="Rapport de contrôle automatique">
              {courant.type === 'MODELE_3D' && (
                <Suspense fallback={<div className="apercu-3d" />}>
                  <ApercuModele3D fichier={originaux.current.get(courant.id)} theme={courant.usage === 'AFFICHE' ? 'affiche' : courant.nomOriginal.includes('bonal') ? 'stade' : 'chateau'} />
                </Suspense>
              )}
              {courant.type === 'SON' && (
                <div className="apercu-son">
                  <Icone nom="musique" taille={28} />
                  {originaux.current.get(courant.id) ? <audio controls src={URL.createObjectURL(originaux.current.get(courant.id)!)} /> : <span>{courant.dureeS} s · sous-titres à renseigner dans l’animation</span>}
                </div>
              )}
              {traitement?.id === courant.id ? (
                <ol className="etapes-controle">
                  {ETAPES.map((e, i) => (
                    <li key={e} className={i < traitement.etape ? 'fait' : i === traitement.etape ? 'courant' : ''}>
                      {i < traitement.etape ? <Icone nom="check" taille={14} /> : i === traitement.etape ? <span className="spinner" /> : <span className="puce" />}
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
                      <p>{controleOk ? 'Contrôle réussi. Vérifiez l’aperçu puis validez l’enregistrement.' : 'Le fichier dépasse le budget : il sera refusé.'}</p>
                      <button
                        type="button"
                        className="btn btn-primaire"
                        onClick={() => {
                          const ko = verifs.filter((v) => !v.ok)
                          majFichier(courant.id, ko.length ? { statutControle: 'REFUSE', raisonRefus: ko.map((v) => `${v.libelle} ${v.detail}`).join(' · ') } : { statutControle: 'CONFORME' })
                          toast.afficher(ko.length ? 'Fichier refusé' : 'Fichier conforme et enregistré')
                        }}
                      >
                        {controleOk ? 'Valider l’enregistrement' : 'Clore le contrôle'}
                      </button>
                    </div>
                  )}
                  {courant.statutControle === 'CONFORME' && (
                    <p className="note-ok">
                      <Icone nom="check" taille={15} /> Conforme. Toute modification d’un fichier déjà diffusé relance ce contrôle.
                    </p>
                  )}
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
