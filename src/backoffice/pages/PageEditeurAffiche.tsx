import { lazy, Suspense, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AfficheAvecQr, FORMATS_MM, largeurImpressionMm, QR_DEFAUT, urlQr } from '../../commun/AfficheQr'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { enregistrerImageAffiche, lireImageAffiche, supprimerImageAffiche, useImageAffiche } from '../../commun/imagesAffiches'
import {
  attribuerZone,
  enregistrerAffiche,
  genererCodeQr,
  nomProprietaire,
  proposerZone,
  publiable,
  publierAffiche,
  reglePublication,
  uid,
  supprimerAffiche,
  useEtat,
} from '../../commun/store'
import type { Affiche, PlacementQr } from '../../commun/types'
import { EchelleFormat } from '../composants/EchelleFormat'
import { exporterPdf, exporterPng } from '../composants/exportAffiche'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, formaterPoids, useToast } from '../ui'

const ApercuAnimationAffiche = lazy(() => import('../composants/ApercuAnimationAffiche'))

const ETAPES = ['Affiche', 'Informations', 'Expérience', 'QR code', 'Validation']
const TAILLE_MAX_OCTETS = 30_000_000
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

/** Import de l'affiche du partenaire ou de la Ville, puis QR code généré et placé dessus (BF-37, BF-38, BF-40, BF-42). */
export default function PageEditeurAffiche() {
  const { id } = useParams()
  const etat = useEtat()
  const session = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const agent = session.role === 'AGENT'
  const existante = etat.affiches.find((a) => a.id === id)
  const [etape, setEtape] = useState(existante ? 5 : 1)
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
        id: uid('af'),
        proprietaireId: proprietaireDe(session),
        animationAfficheId: etat.animations.find((a) => a.type === 'AFFICHE' && (agent || a.proprietaireId === session.partenaireId))?.id ?? '',
        animationLieuId: etat.animations.find((a) => a.type === 'LIEU' && a.statut === 'PUBLIEE')?.id ?? '',
        nom: '',
        accroche: '',
        texte: '',
        codeQr: genererCodeQr(),
        format: 'A3',
        qr: QR_DEFAUT,
        debut: new Date().toISOString().slice(0, 10) + 'T00:00:00',
        fin: new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10) + 'T23:00:00',
        statut: 'BROUILLON',
        fichiersConformes: false,
        scans: 0,
        modifieLe: new Date().toISOString().slice(0, 19),
      },
  )
  const image = useImageAffiche(brouillon.id)

  // L'affiche enregistrée (zone, statut) fait foi ; le brouillon porte les champs en cours d'édition.
  const enregistree = etat.affiches.find((x) => x.id === brouillon.id)
  const a: Affiche = { ...brouillon, zoneId: enregistree?.zoneId ?? brouillon.zoneId, zoneProposeeId: enregistree?.zoneProposeeId ?? brouillon.zoneProposeeId, statut: enregistree?.statut ?? brouillon.statut }
  const maj = (p: Partial<Affiche>) => setBrouillon((b) => ({ ...b, ...p }))
  const qr = a.qr ?? QR_DEFAUT
  const majQr = (p: Partial<PlacementQr>) => maj({ qr: { ...qr, ...p } })

  if (id && !existante) {
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
  const animL = etat.animations.find((x) => x.id === a.animationLieuId)
  const lieuPromu = etat.lieux.find((l) => l.id === animL?.lieuId)
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

  async function importer(fichier: File) {
    setErreurImport(null)
    if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) {
      setErreurImport(`« ${fichier.name} » refusé : importez votre affiche en PNG, JPEG ou WebP (exportez-la depuis votre logiciel de mise en page).`)
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
      await enregistrerImageAffiche(brouillon.id, fichier)
      maj({ image: { nom: fichier.name, largeur: d.largeur, hauteur: d.hauteur, octets: fichier.size }, nom: brouillon.nom || fichier.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') })
      if (enregistree?.statut === 'PUBLIEE') toast.afficher('Nouveau fichier : le contrôle automatique est relancé')
    } catch {
      setErreurImport('Image illisible ou corrompue.')
    }
  }

  function suivant() {
    setTente(true)
    if (etape === 1 && !a.image) return
    if (etape === 2 && Object.values(erreursInfos).some(Boolean)) return
    if (etape === 3 && (!a.animationAfficheId || !a.animationLieuId)) return
    setTente(false)
    if (etape >= 2) enregistrerAffiche({ ...a, modifieLe: new Date().toISOString().slice(0, 19) })
    setEtape(Math.min(5, etape + 1))
  }

  function sauver() {
    enregistrerAffiche({ ...a, statut: a.statut === 'PUBLIEE' ? 'PUBLIEE' : 'BROUILLON', modifieLe: new Date().toISOString().slice(0, 19) })
    toast.afficher(a.statut === 'PUBLIEE' ? 'Modifications enregistrées — contrôle automatique relancé' : 'Brouillon enregistré')
  }

  async function exporter(type: 'png' | 'pdf') {
    const fichier = await lireImageAffiche(a.id)
    if (!fichier) return
    setExport(type)
    try {
      if (!enregistree) enregistrerAffiche(a)
      if (type === 'png') await exporterPng(fichier, a.codeQr, qr, a.nom)
      else await exporterPdf(fichier, a.codeQr, qr, a.nom, a.format ?? 'A3')
      toast.afficher(type === 'png' ? 'Affiche téléchargée en PNG' : `PDF ${a.format ?? 'A3'} téléchargé`)
    } catch {
      toast.afficher('Export impossible : réessayez')
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
            <button type="button" className="btn btn-texte-danger" onClick={() => setSuppression(true)}>
              <Icone nom="poubelle" taille={15} /> Supprimer
            </button>
          )}
          <button type="button" className="btn btn-fantome" onClick={sauver} disabled={lectureSeule || !a.image}>
            Enregistrer
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
                  <strong>{a.image ? 'Remplacer le fichier de l’affiche' : 'Glissez votre affiche ici'}</strong>
                  <p>PNG, JPEG ou WebP · 30 Mo maximum · exportée depuis votre logiciel de mise en page, en haute définition.</p>
                  <button type="button" className="btn btn-primaire" onClick={() => entree.current?.click()} disabled={lectureSeule}>
                    Choisir un fichier
                  </button>
                  <input
                    ref={entree}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void importer(f)
                      e.target.value = ''
                    }}
                  />
                </div>
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
                  <label className={`champ ${tente && !a.animationLieuId ? 'erreur' : ''}`}>
                    <span className="etiquette">Monument promu (animation de lieu)</span>
                    <select value={a.animationLieuId} onChange={(e) => maj({ animationLieuId: e.target.value })} disabled={lectureSeule}>
                      <option value="">Choisir…</option>
                      {etat.lieux.map((l) => {
                        const duLieu = animsLieu.filter((x) => x.lieuId === l.id)
                        return duLieu.length ? (
                          <optgroup key={l.id} label={l.nom}>
                            {duLieu.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.titre}
                                {etatAnim(x)}
                              </option>
                            ))}
                          </optgroup>
                        ) : null
                      })}
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
                {animL && lieuPromu && (
                  <div className="experience-choisie">
                    {imageLieu(lieuPromu.image) ? <img src={imageLieu(lieuPromu.image)} alt="" /> : <span className="vignette-exp"><Icone nom="pin" taille={22} /></span>}
                    <div>
                      <span className="pill pill-green">Compatible</span>
                      <h3>{animL.titre}</h3>
                      <p>Après l’animation, la carte s’ouvrira centrée sur {lieuPromu.nom}.</p>
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
                  <code>{urlQr(a.codeQr)}</code>
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
                      onChange={(e) => {
                        if (!enregistree) enregistrerAffiche(a)
                        if (agent) attribuerZone(a.id, e.target.value || undefined)
                        else if (e.target.value) proposerZone(a.id, e.target.value)
                        toast.afficher(agent ? 'Zone attribuée — partenaire notifié' : 'Proposition envoyée à la mairie')
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
                    <Icone nom="check" taille={14} /> QR code unique généré : <code>{urlQr(a.codeQr)}</code>
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
              <button type="button" className="btn btn-primaire" onClick={suivant}>
                {etape === 3 ? 'Générer le QR code' : 'Continuer'} <Icone nom="droite" taille={15} />
              </button>
            ) : (
              <div className="actions-finales">
                {a.statut !== 'PUBLIEE' && (
                  <button
                    type="button"
                    className="btn btn-secondaire"
                    disabled={!pret || lectureSeule}
                    onClick={() => {
                      if (!enregistree) enregistrerAffiche(a)
                      publierAffiche(a.id)
                      toast.afficher('Affiche publiée : son animation est active aux dates prévues')
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
              <ApercuAnimationAffiche afficheId={a.id} code={a.codeQr} qr={qr} ratio={ratio} animation={animA} />
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
                      code={a.codeQr}
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
        onConfirmer={() => {
          const r = supprimerAffiche(a.id)
          if (r.ok) {
            void supprimerImageAffiche(a.id)
            navigate('/backoffice/affiches')
          }
          return r
        }}
      />
      {toast.element}
    </>
  )
}
