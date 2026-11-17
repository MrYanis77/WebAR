import { lazy, Suspense, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { AfficheAvecQr, FORMATS_MM, largeurImpressionMm, QR_DEFAUT, urlQr, useOrigineApplication } from '../../commun/AfficheQr'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import {
  attendreControle,
  attribuerZone,
  enregistrerAffiche,
  importerFichier,
  nomProprietaire,
  proposerZone,
  publiable,
  publierAffiche,
  reglePublication,
  supprimerAffiche,
  telechargerPdf,
  useEtat,
} from '../../commun/store'
import type { Affiche, PlacementQr } from '../../commun/types'
import { EchelleFormat } from '../composants/EchelleFormat'
import { exporterPng } from '../composants/exportAffiche'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, formaterPoids, maintenantLocal, useToast } from '../ui'
import { estPdf, pdfVersImage } from '../composants/pdfVersImage'

const ApercuAnimationAffiche = lazy(() => import('../composants/ApercuAnimationAffiche'))

const ETAPES = ['Affiche', 'Informations', 'Expérience', 'QR code', 'Validation']
const TAILLE_MAX_OCTETS = 30_000_000
/** PDF importé : converti en image dans le navigateur, jamais envoyé tel quel. */
const PDF_MAX_OCTETS = 100_000_000
const QR_MIN_CM = 3

const POSITIONS: { libelle: string; x: number; y: number }[] = [
  { libelle: 'Haut gauche', x: 0.04, y: 0.03 },
  { libelle: 'Haut droite', x: -1, y: 0.03 },
  { libelle: 'Bas gauche', x: 0.04, y: -1 },
  { libelle: 'Bas droite', x: -1, y: -1 },
  { libelle: 'Bas centre', x: -2, y: -1 },
]

function dimensions(fichier: Blob): Promise<{ largeur: number; hauteur: number }> {
  return createImageBitmap(fichier).then((b) => ({ largeur: b.width, hauteur: b.height }))
}

/** Les affiches sont chargées depuis l'API avant d'ouvrir l'éditeur (lien direct vers /affiches/:id). */
export default function PageEditeurAffiche() {
  const { id } = useParams()
  const { chargement } = useEtat()
  if (chargement) return <div className="bo-defilement">Chargement…</div>
  return <Editeur key={id ?? 'nouvelle'} id={id} />
}

/** Import de l'affiche du partenaire ou de la Ville, puis QR code généré par le serveur et placé dessus (BF-37, BF-38, BF-40, BF-42). */
function Editeur({ id }: { id?: string }) {
  const etat = useEtat()
  useOrigineApplication() // adresse des QR codes à jour (adresse réseau actuelle du PC)
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const agent = session.role === 'AGENT'
  const existante = etat.affiches.find((a) => a.id === id)
  // Après la création, l'éditeur est rouvert sur l'URL de l'affiche à l'étape du placement du QR code.
  const etapeDemandee = (location.state as { etape?: number } | null)?.etape
  const [etape, setEtape] = useState(etapeDemandee ?? (existante ? 5 : 1))
  const [envoi, setEnvoi] = useState<string | null>(null)
  /** Résultat de la conversion d'un PDF (pages, format détecté). */
  const [infoImport, setInfoImport] = useState<string | null>(null)
  const [tente, setTente] = useState(false)
  const [erreurImport, setErreurImport] = useState<string | null>(null)
  const [survol, setSurvol] = useState(false)
  const [export_, setExport] = useState<'png' | 'pdf' | null>(null)
  const [vue, setVue] = useState<'affiche' | 'ra'>('affiche')
  const [suppression, setSuppression] = useState(false)
  const entree = useRef<HTMLInputElement>(null)
  const [brouillon, setBrouillon] = useState<Affiche>(
    () =>
      existante ?? {
        // Identifiant et code du QR code attribués par l'API à la création.
        id: '',
        proprietaireId: proprietaireDe(session),
        animationAfficheId: etat.animations.find((a) => a.type === 'AFFICHE' && (agent || a.proprietaireId === session.partenaireId))?.id ?? '',
        // Lieu promu : le premier lieu visible sur la carte ; le spectacle de ce lieu est facultatif.
        lieuId: (etat.lieux.find((l) => l.actif) ?? etat.lieux[0])?.id ?? '',
        animationLieuId: undefined,
        nom: '',
        accroche: '',
        texte: '',
        codeQr: '',
        format: 'A3',
        qr: QR_DEFAUT,
        debut: maintenantLocal().slice(0, 10) + 'T00:00:00',
        fin: maintenantLocal(42 * 86_400_000).slice(0, 10) + 'T23:00:00',
        statut: 'BROUILLON',
        fichiersConformes: false,
        scans: 0,
        modifieLe: maintenantLocal(),
      },
  )
  const image = brouillon.image?.url

  // L'affiche enregistrée (zone, statut, conditions) fait foi ; le brouillon porte les champs en cours d'édition.
  const enregistree = brouillon.id ? etat.affiches.find((x) => x.id === brouillon.id) : undefined
  const a: Affiche = {
    ...brouillon,
    zoneId: enregistree?.zoneId ?? brouillon.zoneId,
    zoneProposeeId: enregistree?.zoneProposeeId ?? brouillon.zoneProposeeId,
    statut: enregistree?.statut ?? brouillon.statut,
    conditions: enregistree?.conditions,
  }
  const maj = (p: Partial<Affiche>) => setBrouillon((b) => ({ ...b, ...p }))
  const qr = a.qr ?? QR_DEFAUT
  const majQr = (p: Partial<PlacementQr>) => maj({ qr: { ...qr, ...p } })

  if (id && !existante && !brouillon.id) {
    return (
      <div className="bo-defilement">
        <p>Affiche introuvable.</p>
        <Link to="/backoffice/affiches">Retour aux affiches</Link>
      </div>
    )
  }
  if (existante && !agent && existante.proprietaireId !== session.partenaireId) {
    return (
      <div className="bo-defilement">
        <p>Cette affiche appartient à un autre partenaire.</p>
      </div>
    )
  }

  // Toutes les animations disponibles pour l'éditeur (un partenaire voit les siennes et celles des lieux de la Ville).
  const disponibles = etat.animations.filter((x) => x.statut !== 'RETIREE' && (agent || x.proprietaireId === session.partenaireId || x.type === 'LIEU'))
  const animsAffiche = disponibles.filter((x) => x.type === 'AFFICHE')
  const animsLieu = disponibles.filter((x) => x.type === 'LIEU')
  const etatAnim = (x: (typeof disponibles)[number]) =>
    x.statut === 'BROUILLON' ? ' (brouillon)' : x.statut === 'SUSPENDUE' ? ' (suspendue)' : x.fin && new Date(x.fin) < new Date() ? ' (expirée)' : new Date(x.debut) > new Date() ? ' (programmée)' : ''
  const nomLieu = (id?: string) => etat.lieux.find((l) => l.id === id)?.nomCourt ?? 'lieu inconnu'
  const animA = etat.animations.find((x) => x.id === a.animationAfficheId)
  const lieuPromu = etat.lieux.find((l) => l.id === a.lieuId)
  // Spectacles proposés : uniquement les animations du lieu promu.
  const animsDuLieu = animsLieu.filter((x) => x.lieuId === a.lieuId)
  const animL = animsDuLieu.find((x) => x.id === a.animationLieuId)
  const conditions = reglePublication(etat, a)
  const ratio = a.image ? a.image.largeur / a.image.hauteur : 297 / 420
  const largeurMm = largeurImpressionMm(a)
  const paysage = !!a.image && a.image.largeur > a.image.hauteur
  const [formatL, formatH] = FORMATS_MM[a.format ?? 'A3'] ?? FORMATS_MM.A3
  const hauteurMm = paysage ? formatL : formatH
  const ratioPage = largeurMm / hauteurMm
  const qrCm = (qr.taille * largeurMm) / 10
  const dpi = a.image ? Math.round(a.image.largeur / (largeurMm / 25.4)) : 0
  const imagePrete = !!a.image && !!image
  const pret = publiable(conditions) && imagePrete && qrCm >= QR_MIN_CM
  const erreursInfos = { nom: !a.nom.trim(), texte: !a.texte.trim(), dates: a.fin <= a.debut }
  const lectureSeule = a.statut === 'SUSPENDUE' || a.statut === 'RETIREE' || !peutCreer(etat, session)

  /**
   * Import du fichier de l'affiche (PDF converti en image, PNG, JPEG ou WebP) : pré-contrôle (format,
   * poids, dimensions) puis envoi à l'API,
   * qui vérifie le type réel et réencode l'image (sharp) avant de la marquer conforme.
   */
  async function importer(source: File) {
    setErreurImport(null)
    setInfoImport(null)
    // PDF : la première page est rendue en image (300 dpi) dans le navigateur, puis importée comme une image.
    let fichier = source
    if (estPdf(source)) {
      if (source.size > PDF_MAX_OCTETS) {
        setErreurImport(`PDF trop lourd (${formaterPoids(source.size)}) : ${PDF_MAX_OCTETS / 1_000_000} Mo maximum.`)
        return
      }
      setEnvoi('conversion')
      try {
        const c = await pdfVersImage(source)
        fichier = c.fichier
        if (c.format) maj({ format: c.format })
        setInfoImport(
          `PDF converti en image : ${c.pages > 1 ? `page 1 sur ${c.pages} (seule la première est utilisée)` : 'page unique'}, ${c.largeurPx} × ${c.hauteurPx} px` +
            (c.format ? `, format ${c.format} détecté (${c.dpi} dpi).` : '.'),
        )
      } catch (e) {
        setErreurImport(messageErreur(e))
        setEnvoi(null)
        return
      }
    } else if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) {
      setErreurImport(`« ${fichier.name} » refusé : importez votre affiche en PDF, PNG, JPEG ou WebP (exportée depuis votre logiciel de mise en page).`)
      return
    }
    if (fichier.size > TAILLE_MAX_OCTETS) {
      setErreurImport(`Fichier trop lourd (${formaterPoids(fichier.size)}) : 30 Mo maximum.`)
      return
    }
    try {
      const d = await dimensions(fichier)
      if (Math.min(d.largeur, d.hauteur) < 600) {
        setErreurImport(`Image trop petite (${d.largeur} × ${d.hauteur} px) : 600 px minimum sur le petit côté pour être reconnue et imprimée.`)
        return
      }
      setEnvoi('import')
      const cree = await importerFichier(fichier, 'AFFICHE')
      const f = await attendreControle(cree.id)
      if (f.statutControle === 'REFUSE') {
        setErreurImport(`Fichier refusé par le contrôle automatique : ${f.raisonRefus ?? 'format non reconnu'}.`)
        return
      }
      maj({
        imageId: f.id,
        image: { nom: f.nomOriginal, largeur: f.largeurPx ?? d.largeur, hauteur: f.hauteurPx ?? d.hauteur, octets: f.tailleOctets, url: f.url },
        nom: brouillon.nom || source.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60),
      })
      if (enregistree?.statut === 'PUBLIEE') toast.afficher('Nouveau fichier : enregistrez pour le remplacer sur l’affiche publiée')
    } catch (e) {
      setErreurImport(e instanceof TypeError ? 'Image illisible ou corrompue.' : messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  /** Enregistre le brouillon auprès de l'API (création ou modification) et renvoie l'affiche à jour. */
  async function enregistrer(): Promise<Affiche> {
    const r = await enregistrerAffiche(a)
    setBrouillon((b) => ({ ...b, id: r.id, codeQr: r.codeQr, proprietaireId: r.proprietaireId }))
    return r
  }

  /**
   * Étape suivante. L'affiche est créée par l'API en quittant l'étape 3 (le serveur génère alors
   * son QR code unique) ; une affiche existante est enregistrée à chaque étape.
   */
  async function suivant() {
    setTente(true)
    if (etape === 1 && !a.imageId) return
    if (etape === 2 && Object.values(erreursInfos).some(Boolean)) return
    if (etape === 3 && (!a.animationAfficheId || !a.lieuId)) return
    setTente(false)
    if (etape >= 3 || a.id) {
      setEnvoi('enregistrement')
      try {
        const r = await enregistrer()
        if (!a.id) {
          navigate(`/backoffice/affiches/${r.id}`, { replace: true, state: { etape: 4 } })
          return
        }
      } catch (e) {
        toast.afficher(messageErreur(e))
        return
      } finally {
        setEnvoi(null)
      }
    }
    setEtape(Math.min(5, etape + 1))
  }

  async function sauver() {
    if (!a.id && (!a.animationAfficheId || !a.lieuId || Object.values(erreursInfos).some(Boolean))) {
      toast.afficher('Complétez les informations et l’expérience avant d’enregistrer')
      return
    }
    setEnvoi('enregistrement')
    try {
      const r = await enregistrer()
      if (!a.id) navigate(`/backoffice/affiches/${r.id}`, { replace: true, state: { etape } })
      toast.afficher(a.statut === 'PUBLIEE' ? 'Modifications enregistrées' : 'Brouillon enregistré')
    } catch (e) {
      toast.afficher(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  /** PDF généré par l'API (pdf-lib, QR code incrusté) ; PNG composé dans le navigateur pour le web. */
  async function exporter(type: 'png' | 'pdf') {
    setExport(type)
    try {
      await enregistrer()
      if (type === 'pdf') await telechargerPdf(a)
      else {
        const fichier = await fetch(image!).then((reponse) => reponse.blob())
        await exporterPng(fichier, a.codeQr, qr, a.nom)
      }
      toast.afficher(type === 'png' ? 'Affiche téléchargée en PNG' : `PDF ${a.format ?? 'A3'} téléchargé`)
    } catch (e) {
      toast.afficher(`Export impossible : ${messageErreur(e)}`)
    } finally {
      setExport(null)
    }
  }

  function placer(p: (typeof POSITIONS)[number]) {
    const hauteurBloc = (qr.taille * ratio) * (qr.mention ? 1.16 : 1)
    const x = p.x === -1 ? 1 - qr.taille - 0.04 : p.x === -2 ? (1 - qr.taille) / 2 : p.x
    const y = p.y === -1 ? 1 - hauteurBloc - 0.03 : p.y
    majQr({ x, y })
  }

  const ligneCondition = (ok: boolean, libelle: string, detail: string, action?: ReactNode) => (
    <li className={ok ? 'ok' : 'ko'}>
      <span>
        <Icone nom={ok ? 'check' : 'fermer'} taille={14} />
      </span>
      <div>
        <strong>{libelle}</strong>
        <small>{detail}</small>
      </div>
      {!ok && action}
    </li>
  )

  return (
    <>
      <header className="bo-entete">
        <div>
          <Link to="/backoffice/affiches" className="fil-ariane">
            <Icone nom="gauche" taille={14} /> Affiches
          </Link>
          <h1>{existante ? existante.nom : 'Nouvelle affiche'}</h1>
          <p>Importez votre affiche : l’application génère son QR code unique et vous le placez où vous voulez.</p>
        </div>
        <div className="bo-entete-actions">
          {enregistree && <BadgeStatut statut={a.statut} />}
          {enregistree && (
            <Link to={`/backoffice/affiches/${a.id}/voir`} className="btn btn-secondaire">
              <Icone nom="qr" taille={15} /> Voir l’affiche
            </Link>
          )}
          {enregistree && (
            <button type="button" className="btn btn-texte-danger" onClick={() => setSuppression(true)}>
              <Icone nom="poubelle" taille={15} /> Supprimer
            </button>
          )}
          <button type="button" className="btn btn-fantome" onClick={() => void sauver()} disabled={lectureSeule || !a.imageId || !!envoi}>
            {envoi === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </header>
      <div className="editeur-affiche">
        <div className="editeur-formulaire">
          <ol className="etapes-editeur">
            {ETAPES.map((e, i) => (
              <li key={e} className={etape === i + 1 ? 'actif' : etape > i + 1 ? 'fait' : ''}>
                <button type="button" onClick={() => (existante || i + 1 < etape ? setEtape(i + 1) : undefined)}>
                  <span>{etape > i + 1 ? <Icone nom="check" taille={13} /> : i + 1}</span>
                  <small>{e}</small>
                </button>
              </li>
            ))}
          </ol>

          <section className="section-editeur">
            <span className="eyebrow">
              Étape {etape} sur {ETAPES.length}
            </span>

            {etape === 1 && (
              <>
                <h2>Importez votre affiche</h2>
                <div
                  className={`depot-affiche ${survol ? 'survol' : ''} ${tente && !a.image ? 'erreur' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setSurvol(true)
                  }}
                  onDragLeave={() => setSurvol(false)}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault()
                    setSurvol(false)
                    const f = e.dataTransfer.files[0]
                    if (f && !lectureSeule) void importer(f)
                  }}
                >
                  <span className="icone-depot">
                    <Icone nom="import" taille={26} />
                  </span>
                  <strong>{envoi === 'conversion' ? 'Conversion du PDF en image…' : envoi === 'import' ? 'Envoi et contrôle du fichier…' : a.image ? 'Remplacer le fichier de l’affiche' : 'Glissez votre affiche ici'}</strong>
                  <p>PDF (première page), PNG, JPEG ou WebP · exportée depuis votre logiciel de mise en page, en haute définition.</p>
                  <button type="button" className="btn btn-primaire" onClick={() => entree.current?.click()} disabled={lectureSeule || !!envoi}>
                    {envoi === 'import' || envoi === 'conversion' ? <span className="spinner" /> : null}
                    Choisir un fichier
                  </button>
                  <input
                    ref={entree}
                    type="file"
                    hidden
                    accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void importer(f)
                      e.target.value = ''
                    }}
                  />
                </div>
                {infoImport && !erreurImport && (
                  <p className="note-ok" role="status">
                    <Icone nom="check" taille={15} />
                    {infoImport}
                  </p>
                )}
                {erreurImport && (
                  <p className="erreur-acces" role="alert">
                    <Icone nom="alerte" taille={15} />
                    {erreurImport}
                  </p>
                )}
                {a.image && (
                  <div className="infos-fichier-affiche">
                    <Icone nom="image" taille={18} />
                    <div>
                      <strong>{a.image.nom}</strong>
                      <small>
                        {a.image.largeur} × {a.image.hauteur} px · {formaterPoids(a.image.octets)} · {a.image.largeur > a.image.hauteur ? 'paysage' : 'portrait'}
                      </small>
                    </div>
                    <Icone nom="check" taille={18} />
                  </div>
                )}
                <div className="grille-champs marge-haut">
                  <label className="champ">
                    <span className="etiquette">
                      Format d’impression <small>Selon la zone d’affichage</small>
                    </span>
                    <select value={a.format ?? 'A3'} onChange={(e) => maj({ format: e.target.value })} disabled={lectureSeule}>
                      {Object.entries(FORMATS_MM).map(([f, [l, h]]) => (
                        <option key={f} value={f}>
                          {f} — {l / 10} × {h / 10} cm
                        </option>
                      ))}
                    </select>
                  </label>
                  {a.image && (
                    <div className={`budget ${dpi < 150 ? 'depasse' : ''}`}>
                      <small>Qualité d’impression</small>
                      <div>
                        <span>{dpi} dpi en {a.format ?? 'A3'}</span>
                        <span>{dpi >= 150 ? 'suffisant' : '150 dpi recommandés'}</span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="note-apercu gauche">
                  <Icone nom="info" taille={14} /> L’image importée sert aussi de visuel de référence pour la reconnaissance en réalité augmentée : privilégiez une affiche riche en détails.
                </p>
              </>
            )}

            {etape === 2 && (
              <>
                <h2>Informations de l’affiche</h2>
                <div className="grille-champs">
                  <label className={`champ ${tente && erreursInfos.nom ? 'erreur' : ''}`}>
                    <span className="etiquette">Nom de l’affiche</span>
                    <input value={a.nom} onChange={(e) => maj({ nom: e.target.value })} maxLength={60} disabled={lectureSeule} />
                  </label>
                  <label className="champ">
                    <span className="etiquette">
                      Accroche <small>Facultatif</small>
                    </span>
                    <input value={a.accroche} onChange={(e) => maj({ accroche: e.target.value })} maxLength={40} disabled={lectureSeule} />
                  </label>
                  <label className={`champ pleine ${tente && erreursInfos.texte ? 'erreur' : ''}`}>
                    <span className="etiquette">
                      Texte affiché dans l’application <small>{a.texte.length}/300 · texte brut, aucun lien</small>
                    </span>
                    <textarea value={a.texte} onChange={(e) => maj({ texte: e.target.value.replace(/https?:\/\/\S+/g, '') })} maxLength={300} rows={3} disabled={lectureSeule} />
                    <span className="aide">Visible par le visiteur après l’animation de l’affiche.</span>
                  </label>
                  <label className="champ">
                    <span className="etiquette">Date de sortie</span>
                    <input type="date" value={a.debut.slice(0, 10)} onChange={(e) => maj({ debut: `${e.target.value}T00:00:00` })} disabled={lectureSeule} />
                  </label>
                  <label className={`champ ${tente && erreursInfos.dates ? 'erreur' : ''}`}>
                    <span className="etiquette">Date de fin</span>
                    <input type="date" value={a.fin.slice(0, 10)} onChange={(e) => maj({ fin: `${e.target.value}T23:00:00` })} disabled={lectureSeule} />
                  </label>
                </div>
              </>
            )}

            {etape === 3 && (
              <>
                <h2>Associez une expérience</h2>
                <div className="grille-champs">
                  <label className={`champ ${tente && !a.animationAfficheId ? 'erreur' : ''}`}>
                    <span className="etiquette">Animation de l’affiche</span>
                    <select value={a.animationAfficheId} onChange={(e) => maj({ animationAfficheId: e.target.value })} disabled={lectureSeule}>
                      <option value="">Choisir…</option>
                      <optgroup label="Animations d’affiche">
                        {animsAffiche.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.titre}
                            {etatAnim(x)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Animations de lieu">
                        {animsLieu.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.titre} — {nomLieu(x.lieuId)}
                            {etatAnim(x)}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {disponibles.length === 0 && (
                      <span className="aide">
                        Aucune animation d’affiche : <Link to="/backoffice/animations">créez-en une</Link>.
                      </span>
                    )}
                  </label>
                  <label className={`champ ${tente && !a.lieuId ? 'erreur' : ''}`}>
                    <span className="etiquette">
                      Lieu promu <small>La carte s’ouvre sur ce lieu après l’animation</small>
                    </span>
                    <select value={a.lieuId} onChange={(e) => maj({ lieuId: e.target.value, animationLieuId: undefined })} disabled={lectureSeule}>
                      <option value="">Choisir un lieu…</option>
                      {etat.lieux.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nom}
                          {l.actif ? '' : ' (masqué sur la carte)'}
                        </option>
                      ))}
                    </select>
                    {etat.lieux.length === 0 && (
                      <span className="aide">
                        Aucun lieu : {agent ? <Link to="/backoffice/lieux">créez-en un</Link> : 'la mairie doit d’abord en créer un'}.
                      </span>
                    )}
                  </label>
                  <label className="champ">
                    <span className="etiquette">
                      Spectacle du lieu <small>Facultatif</small>
                    </span>
                    <select value={a.animationLieuId ?? ''} onChange={(e) => maj({ animationLieuId: e.target.value || undefined })} disabled={lectureSeule || !a.lieuId}>
                      <option value="">{animsDuLieu.length ? 'Aucun spectacle mis en avant' : 'Aucune animation sur ce lieu'}</option>
                      {animsDuLieu.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.titre}
                          {etatAnim(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {animA && (
                  <div className="experience-choisie">
                    <span className="vignette-exp">
                      <Icone nom="affiche" taille={22} />
                    </span>
                    <div>
                      <span className="pill pill-cyan">{animA.type === 'LIEU' ? 'Animation de lieu' : 'Animation d’affiche'}</span>
                      <h3>{animA.titre}</h3>
                      <p>
                        {animA.dureeS} s · {etat.fichiers.find((f) => f.id === animA.modeleId)?.nomOriginal ?? 'modèle à importer'}
                      </p>
                    </div>
                  </div>
                )}
                {lieuPromu && (
                  <div className="experience-choisie">
                    {lieuPromu.image ? <img src={lieuPromu.image} alt="" /> : <span className="vignette-exp"><Icone nom="pin" taille={22} /></span>}
                    <div>
                      <span className="pill pill-green">Lieu promu</span>
                      <h3>{lieuPromu.nom}</h3>
                      <p>
                        Après l’animation, la carte s’ouvrira centrée sur ce lieu
                        {animL ? ` et mettra en avant « ${animL.titre} »` : ''}.
                      </p>
                    </div>
                    <Icone nom="check" taille={20} />
                  </div>
                )}
              </>
            )}

            {etape === 4 && (
              <>
                <h2>Placez le QR code</h2>
                <p className="intro-etape">
                  Le QR code unique de l’affiche a été généré. Glissez-le sur l’aperçu à l’endroit voulu, ou choisissez une position.
                </p>
                <div className="positions-qr" role="group" aria-label="Positions rapides">
                  {POSITIONS.map((p) => (
                    <button key={p.libelle} type="button" onClick={() => placer(p)} disabled={lectureSeule}>
                      {p.libelle}
                    </button>
                  ))}
                </div>
                <label className="champ">
                  <span className="etiquette">
                    Taille du QR code <small>{qrCm.toFixed(1).replace('.', ',')} cm imprimé en {a.format ?? 'A3'}</small>
                  </span>
                  <input
                    type="range"
                    min={0.08}
                    max={0.35}
                    step={0.005}
                    value={qr.taille}
                    disabled={lectureSeule}
                    onChange={(e) => {
                      const taille = Number(e.target.value)
                      majQr({ taille, x: Math.min(qr.x, 1 - taille) })
                    }}
                  />
                </label>
                {qrCm < QR_MIN_CM && (
                  <p className="erreur-acces">
                    <Icone nom="alerte" taille={15} /> QR code trop petit : {QR_MIN_CM} cm minimum pour être scanné facilement.
                  </p>
                )}
                <label className="case">
                  <input type="checkbox" checked={qr.fond} onChange={(e) => majQr({ fond: e.target.checked })} disabled={lectureSeule} />
                  Fond blanc autour du QR code (recommandé sur un visuel sombre ou chargé)
                </label>
                <label className="case">
                  <input type="checkbox" checked={qr.mention} onChange={(e) => majQr({ mention: e.target.checked })} disabled={lectureSeule} />
                  Ajouter la mention « Scannez · expérience RA » sous le QR code
                </label>
                <div className="lien-qr">
                  <Icone nom="lien" taille={15} />
                  <code>{a.codeQr ? urlQr(a.codeQr) : 'Généré par le serveur à l’enregistrement'}</code>
                </div>
              </>
            )}

            {etape === 5 && (
              <>
                <h2>{pret ? 'Prête à imprimer' : 'Conditions de publication'}</h2>
                <ul className="conditions">
                  {ligneCondition(conditions.compteVerifie, 'Compte vérifié par la mairie', nomProprietaire(etat, a.proprietaireId))}
                  {ligneCondition(
                    conditions.fichiersConformes,
                    'Fichiers conformes au contrôle automatique',
                    animA ? animA.titre : 'Aucune animation d’affiche',
                    <Link to="/backoffice/fichiers" className="lien-panneau">Voir les fichiers</Link>,
                  )}
                  {ligneCondition(conditions.charteAcceptee, 'Charte d’utilisation acceptée', 'Version 1.0', <Link to="/backoffice/charte" className="lien-panneau">Accepter</Link>)}
                  {ligneCondition(
                    conditions.zoneAttribuee,
                    'Zone d’affichage attribuée par la mairie',
                    etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? `Proposée : ${etat.zones.find((z) => z.id === a.zoneProposeeId)?.nom} — en attente` : 'Aucune zone'),
                  )}
                </ul>

                <div className="bloc-zone">
                  <label className="champ">
                    <span className="etiquette">
                      {agent ? 'Attribuer la zone d’affichage' : 'Proposer une zone'}
                      <small>{agent ? 'Selon les règles d’affichage de la Ville' : 'La mairie attribue la zone ; vous pouvez en proposer une'}</small>
                    </span>
                    <select
                      value={agent ? (a.zoneId ?? '') : (a.zoneProposeeId ?? '')}
                      disabled={lectureSeule}
                      onChange={async (e) => {
                        const zone = e.target.value
                        try {
                          const r = await enregistrer()
                          if (agent) await attribuerZone(r.id, zone || undefined)
                          else if (zone) await proposerZone(r.id, zone)
                          toast.afficher(agent ? 'Zone attribuée — partenaire notifié' : 'Proposition envoyée à la mairie')
                        } catch (err) {
                          toast.afficher(messageErreur(err))
                        }
                      }}
                    >
                      <option value="">{agent ? 'Aucune zone' : 'Choisir une zone…'}</option>
                      {etat.zones
                        .filter((z) => z.active)
                        .map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.nom} ({z.format})
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <ul className="verifications">
                  <li>
                    <Icone nom={imagePrete ? 'check' : 'fermer'} taille={14} /> Fichier de l’affiche importé {a.image ? `(${a.image.largeur} × ${a.image.hauteur} px)` : ''}
                  </li>
                  <li>
                    <Icone nom={a.codeQr ? 'check' : 'fermer'} taille={14} /> QR code unique généré : <code>{a.codeQr ? urlQr(a.codeQr) : '—'}</code>
                  </li>
                  <li>
                    <Icone nom={qrCm >= QR_MIN_CM ? 'check' : 'fermer'} taille={14} /> QR code placé : {qrCm.toFixed(1).replace('.', ',')} cm en {a.format ?? 'A3'}
                  </li>
                  <li>
                    <Icone nom={animA ? 'check' : 'fermer'} taille={14} /> Une animation est associée
                  </li>
                </ul>
                <div className={`boite-pret ${pret ? '' : 'bloque'}`}>
                  <strong>{pret ? 'Votre affiche est prête' : 'Export et activation bloqués'}</strong>
                  <p>
                    {pret
                      ? 'Le fichier exporté contient votre affiche à sa résolution d’origine avec le QR code incrusté. Publiée sans validation préalable : vous restez responsable du contenu.'
                      : 'Le fichier de l’affiche, un QR code lisible et les 4 conditions sont nécessaires pour exporter et activer l’animation (règle vérifiée aussi par l’API).'}
                  </p>
                </div>
              </>
            )}
          </section>

          <div className="pied-editeur">
            <button type="button" className="btn btn-fantome" onClick={() => (etape === 1 ? navigate('/backoffice/affiches') : setEtape(etape - 1))}>
              {etape === 1 ? 'Annuler' : 'Retour'}
            </button>
            {etape < 5 ? (
              <button type="button" className="btn btn-primaire" onClick={() => void suivant()} disabled={!!envoi}>
                {etape === 3 ? 'Générer le QR code' : 'Continuer'} <Icone nom="droite" taille={15} />
              </button>
            ) : (
              <div className="actions-finales">
                {a.statut !== 'PUBLIEE' && (
                  <button
                    type="button"
                    className="btn btn-secondaire"
                    disabled={!pret || lectureSeule}
                    onClick={async () => {
                      try {
                        const r = await enregistrer()
                        await publierAffiche(r.id)
                        toast.afficher('Affiche publiée : son animation est active aux dates prévues')
                      } catch (e) {
                        toast.afficher(messageErreur(e))
                      }
                    }}
                  >
                    Publier
                  </button>
                )}
                <button type="button" className="btn btn-fantome" disabled={!pret || !!export_} onClick={() => void exporter('png')}>
                  {export_ === 'png' ? <span className="spinner" /> : <Icone nom="image" taille={16} />}
                  PNG
                </button>
                <button type="button" className="btn btn-primaire" disabled={!pret || !!export_} onClick={() => void exporter('pdf')}>
                  {export_ === 'pdf' ? <span className="spinner" /> : <Icone nom="telecharger" taille={16} />}
                  PDF {a.format ?? 'A3'}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="editeur-apercu">
          <div className="libelle-apercu">
            <div className="onglets onglets-apercu" role="tablist" aria-label="Type d’aperçu">
              <button type="button" role="tab" aria-selected={vue === 'affiche'} className={vue === 'affiche' ? 'actif' : ''} onClick={() => setVue('affiche')}>
                Affiche
              </button>
              <button type="button" role="tab" aria-selected={vue === 'ra'} className={vue === 'ra' ? 'actif' : ''} onClick={() => setVue('ra')} disabled={!imagePrete}>
                <Icone nom="cube" taille={14} /> Aperçu RA
              </button>
            </div>
            <span className="pill pill-stone">
              {a.format ?? 'A3'} · {(largeurMm / 10).toFixed(1).replace('.', ',')} × {(hauteurMm / 10).toFixed(1).replace('.', ',')} cm
            </span>
          </div>
          {vue === 'ra' && imagePrete ? (
            <Suspense fallback={<div className="apercu-animation-affiche chargement"><span className="spinner" /></div>}>
              <ApercuAnimationAffiche image={image!} code={a.codeQr || 'apercu'} qr={qr} ratio={ratio} animation={animA} />
            </Suspense>
          ) : (
            <>
              {etape === 4 && <p className="consigne-apercu">Glissez le QR code sur l’affiche</p>}
              <div className="feuille-format" style={{ aspectRatio: String(ratioPage) }} title={`Feuille ${a.format ?? 'A3'}`}>
                <div className="feuille-contenu" style={{ aspectRatio: String(ratio), ...(ratio > ratioPage ? { width: '100%' } : { height: '100%' }) }}>
                  {etape === 1 && !a.image ? (
                    <div className="apercu-vide">
                      <Icone nom="affiche" taille={34} />
                      <span>Votre affiche apparaîtra ici</span>
                    </div>
                  ) : (
                    <AfficheAvecQr
                      image={image}
                      ratio={ratio}
                      code={a.codeQr || 'apercu'}
                      qr={qr}
                      nom={a.nom}
                      onQr={etape === 4 && !lectureSeule ? (p) => majQr(p) : undefined}
                      className="apercu-editeur"
                    />
                  )}
                </div>
              </div>
              {Math.abs(ratio - ratioPage) > 0.02 && a.image && (
                <p className="note-apercu">
                  <Icone nom="info" taille={14} /> Les proportions de votre fichier diffèrent du format {a.format ?? 'A3'} : des marges blanches apparaîtront à l’impression.
                </p>
              )}
              <EchelleFormat format={a.format ?? 'A3'} paysage={paysage} image={image} qr={qr} onFormat={(format) => maj({ format })} desactive={lectureSeule} />
            </>
          )}
          <p className="note-apercu">
            <Icone nom="info" taille={14} /> Le QR code renvoie uniquement vers l’application ; aucun lien externe n’est possible.
          </p>
        </aside>
      </div>
      <DialogueSuppression
        cible={suppression ? a.nom || 'cette affiche' : null}
        description="Son QR code ne mènera plus à l’animation. La suppression reste inscrite au journal."
        onFermer={() => setSuppression(false)}
        onConfirmer={async () => {
          const r = await supprimerAffiche(a.id)
          if (r.ok) navigate('/backoffice/affiches')
          return r
        }}
      />
      {toast.element}
    </>
  )
}
