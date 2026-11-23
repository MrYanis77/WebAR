import { lazy, Suspense, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { AfficheAvecQr, FORMATS_MM, largeurImpressionMm, QR_DEFAUT, urlQr, useOrigineApplication } from '../../commun/AfficheQr'
import { REGLAGE_AFFICHE_RA_DEFAUT } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import {
  alerteAnimationAffiche,
  attendreControle,
  attribuerZone,
  enregistrerAffiche,
  enregistrerAnimation,
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
import type { Affiche, Animation, PlacementQr } from '../../commun/types'
import { SonEtDuree, useReglagesModele } from '../composants/atelier/OutilsAtelier'
import { EchelleFormat } from '../composants/EchelleFormat'
import { exporterPng } from '../composants/exportAffiche'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, formaterPoids, maintenantLocal, toastApresNavigation, useToast } from '../ui'
import { estPdf, pdfVersImage } from '../composants/pdfVersImage'
import { RecadrageAffiche } from '../composants/RecadrageAffiche'

const ApercuAnimationAffiche = lazy(() => import('../composants/ApercuAnimationAffiche'))
const AtelierAffiche = lazy(() => import('../composants/atelier/AtelierAffiche'))

const ETAPES = [
  { titre: 'Affiche', aide: 'Fichier et format', intro: 'Importez le visuel final de votre affiche, puis choisissez son format d’impression. Ce visuel sert aussi à reconnaître l’affiche en réalité augmentée.' },
  { titre: 'Informations', aide: 'Textes, dates, lieu', intro: 'Ces textes s’affichent dans l’application après l’animation. Le lieu promu est celui sur lequel la carte s’ouvre ensuite.' },
  { titre: 'Animation 3D', aide: 'Modèle, position, taille', intro: 'Choisissez le modèle 3D qui sort de l’affiche, puis réglez-le directement sur votre affiche : déplacez-le, tournez-le, changez sa taille.' },
  { titre: 'QR code', aide: 'Cliquez pour le placer', intro: 'Le QR code unique de l’affiche est prêt. Cliquez sur l’affiche, à droite, à l’endroit où vous voulez le placer.' },
  { titre: 'Publication', aide: 'Zone et export', intro: 'Vérifiez les conditions, faites attribuer une zone d’affichage, puis publiez et téléchargez le fichier à imprimer.' },
]
const TAILLE_MAX_OCTETS = 30_000_000
/** PDF importé : converti en image dans le navigateur, jamais envoyé tel quel. */
const PDF_MAX_OCTETS = 100_000_000
const QR_MIN_CM = 3
/** Formats du plus petit au plus grand (format maximal d'une zone d'affichage). */
const ORDRE_FORMATS = ['A4', 'A3', 'A2', 'A1', 'A0']

const ALIGNEMENTS: { libelle: string; x: number; y: number }[] = [
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

/**
 * Création d'une affiche en 5 étapes : le fichier de l'affiche, ses informations, son animation 3D
 * (réglée dans l'atelier de l'affiche : modèle, position, rotation, taille), le QR code généré par le
 * serveur et placé d'un clic, puis la publication (BF-37, BF-38, BF-40, BF-42).
 */
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
  /** Image en attente de recadrage au format d'impression (avant l'envoi à l'API). */
  const [recadrage, setRecadrage] = useState<{ fichier: File; nom: string; format: string; dejaImportee?: boolean } | null>(null)
  const entree = useRef<HTMLInputElement>(null)
  const [brouillon, setBrouillon] = useState<Affiche>(
    () =>
      existante ?? {
        // Identifiant et code du QR code attribués par l'API à la création ; animation créée à l'étape 3.
        id: '',
        proprietaireId: proprietaireDe(session),
        animationAfficheId: '',
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
        fin: maintenantLocal(42 * 86_400_000).slice(0, 10) + 'T23:59:00',
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

  // ------------------------------------------------------------ animation de l'affiche (étape 3)
  /** Nouvelle animation propre à cette affiche : elle reprend son nom et ses dates à l'enregistrement. */
  const nouvelleAnimation = (): Animation => ({
    id: '',
    proprietaireId: proprietaireDe(session),
    titre: '',
    type: 'AFFICHE',
    declencheur: 'AFFICHE',
    dureeS: 15,
    debut: brouillon.debut,
    fin: brouillon.fin,
    statut: 'BROUILLON',
    transcription: { fr: '', en: '', de: '' },
    lancements: 0,
    modifieLe: maintenantLocal(),
    reglageAffiche: { ...REGLAGE_AFFICHE_RA_DEFAUT },
  })
  const [anim, setAnim] = useState<Animation>(() => {
    const liee = etat.animations.find((x) => x.id === brouillon.animationAfficheId)
    return liee ? { ...liee } : nouvelleAnimation()
  })
  /** État de l'animation au dernier enregistrement : sert à savoir s'il faut la renvoyer à l'API. */
  const animEnregistree = useRef(JSON.stringify(anim))
  const majAnim = (p: Partial<Animation>) => setAnim((x) => ({ ...x, ...p }))
  const fichierModele = etat.fichiers.find((f) => f.id === anim.modeleId)
  const modele = useReglagesModele(fichierModele)
  /** Autres affiches qui utilisent la même animation (ses réglages les concernent aussi). */
  const autresAffiches = anim.id ? etat.affiches.filter((x) => x.animationAfficheId === anim.id && x.id !== a.id) : []
  /** Animation propre à cette affiche : elle suit son nom et ses dates. */
  const dediee = anim.type === 'AFFICHE' && autresAffiches.length === 0
  const lectureSeule = a.statut === 'SUSPENDUE' || a.statut === 'RETIREE' || !peutCreer(etat, session)
  const animModifiable = !lectureSeule && (!anim.id || agent || anim.proprietaireId === session.partenaireId) && anim.statut !== 'SUSPENDUE' && anim.statut !== 'RETIREE'
  const animModifiee = JSON.stringify(anim) !== animEnregistree.current || modele.modifie
  const afficheMontree = useMemo(() => ({ ...brouillon, codeQr: brouillon.codeQr || 'apercu' }), [brouillon])
  const animApercu = useMemo<Animation>(() => ({ ...anim, modeleUrl: fichierModele?.url, reglages3d: modele.reglages }), [anim, fichierModele?.url, modele.reglages])

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

  // Animations réutilisables (un partenaire voit les siennes et celles des monuments de la Ville).
  const disponibles = etat.animations.filter((x) => x.statut !== 'RETIREE' && (agent || x.proprietaireId === session.partenaireId || x.type === 'LIEU'))
  const animsAffiche = disponibles.filter((x) => x.type === 'AFFICHE')
  const animsLieu = disponibles.filter((x) => x.type === 'LIEU')
  const etatAnim = (x: Animation) =>
    x.statut === 'BROUILLON' ? ' (brouillon)' : x.statut === 'SUSPENDUE' ? ' (suspendue)' : x.fin && new Date(x.fin) < new Date() ? ' (expirée)' : new Date(x.debut) > new Date() ? ' (programmée)' : ''
  const nomLieu = (lieuId?: string) => etat.lieux.find((l) => l.id === lieuId)?.nomCourt ?? 'lieu inconnu'
  /** L'animation choisie ne sera pas montrée pendant toute la période de l'affiche (désactivée, dates). */
  const alerteAnim = (() => {
    // Une animation modifiable est activée avec l'affiche ; une animation propre à l'affiche suit ses dates.
    if (!anim.id || (animModifiable && anim.statut === 'BROUILLON')) return null
    return alerteAnimationAffiche({ ...anim, ...(dediee ? { debut: a.debut, fin: a.fin } : {}) }, a)
  })()
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
  const erreursInfos = { nom: !a.nom.trim(), texte: !a.texte.trim(), dates: a.fin <= a.debut, lieu: !a.lieuId }
  const erreursAnim = animModifiable
    ? { modele: !anim.modeleId, transcription: !!anim.sonId && !anim.transcription.fr.trim(), duree: !(anim.dureeS >= 5 && anim.dureeS <= 1800) }
    : { modele: !anim.id, transcription: false, duree: false }
  const zone = etat.zones.find((z) => z.id === (agent ? a.zoneId : (a.zoneProposeeId ?? a.zoneId)))
  const tropGrand = (format?: string) => !!zone && ORDRE_FORMATS.indexOf(a.format ?? 'A3') > ORDRE_FORMATS.indexOf(format ?? 'A0')

  /**
   * Import du fichier de l'affiche (PDF converti en image, PNG, JPEG ou WebP) : pré-contrôle (format,
   * poids, dimensions) puis envoi à l'API, qui vérifie le type réel et réencode l'image (sharp) avant de
   * la marquer conforme.
   */
  async function importer(source: File) {
    setErreurImport(null)
    setInfoImport(null)
    // PDF : la première page est rendue en image (300 dpi) dans le navigateur, puis importée comme une image.
    let fichier = source
    let formatDetecte: string | undefined
    if (estPdf(source)) {
      if (source.size > PDF_MAX_OCTETS) {
        setErreurImport(`PDF trop lourd (${formaterPoids(source.size)}) : ${PDF_MAX_OCTETS / 1_000_000} Mo maximum.`)
        return
      }
      setEnvoi('conversion')
      try {
        const c = await pdfVersImage(source)
        fichier = c.fichier
        if (c.format) {
          formatDetecte = c.format
          maj({ format: c.format })
        }
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
    setEnvoi(null)
    // Recadrage au format d'impression, sauf si l'image en a déjà les proportions.
    try {
      const d = await dimensions(fichier)
      const [fl, fh] = FORMATS_MM[formatDetecte ?? a.format ?? 'A3'] ?? FORMATS_MM.A3
      const r = d.largeur / d.hauteur
      const auFormat = Math.abs(r - fl / fh) < 0.02 || Math.abs(r - fh / fl) < 0.02
      if (!auFormat) {
        setRecadrage({ fichier, nom: source.name, format: formatDetecte ?? a.format ?? 'A3' })
        return
      }
    } catch {
      setErreurImport('Image illisible ou corrompue.')
      return
    }
    await envoyer(fichier, source.name)
  }

  /** Contrôles (poids, dimensions) puis envoi à l'API du fichier de l'affiche, recadré ou non. */
  async function envoyer(fichier: File, nomSource: string) {
    setErreurImport(null)
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
        nom: brouillon.nom || nomSource.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60),
      })
      if (enregistree?.statut === 'PUBLIEE') toast.afficher('Nouveau fichier : enregistrez pour le remplacer sur l’affiche publiée')
    } catch (e) {
      setErreurImport(e instanceof TypeError ? 'Image illisible ou corrompue.' : messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  /** Rouvre le recadrage sur l'image déjà importée (le résultat remplace le fichier de l'affiche). */
  async function recadrerImage() {
    if (!image || !a.image) return
    setErreurImport(null)
    try {
      const blob = await fetch(image).then((r) => r.blob())
      setRecadrage({ fichier: new File([blob], a.image.nom, { type: blob.type }), nom: a.image.nom, format: a.format ?? 'A3', dejaImportee: true })
    } catch (e) {
      setErreurImport(`Image indisponible : ${messageErreur(e)}`)
    }
  }

  /**
   * Enregistre l'animation de l'affiche (création ou modification) et les réglages de son modèle.
   * Une animation propre à l'affiche reprend son nom et ses dates. Renvoie son identifiant.
   */
  async function enregistrerAnim(publier = false): Promise<string> {
    if (!animModifiable) return anim.id
    if (fichierModele && (agent || fichierModele.proprietaireId === session.partenaireId)) await modele.enregistrer()
    const envoyee: Animation = dediee ? { ...anim, titre: a.nom.trim() || anim.titre || 'Animation d’affiche', debut: a.debut, fin: a.fin } : anim
    const r = await enregistrerAnimation(envoyee, publier)
    const suivante = { ...envoyee, id: r.id, statut: r.statut }
    animEnregistree.current = JSON.stringify(suivante)
    setAnim(suivante)
    return r.id
  }

  /** Enregistre l'affiche auprès de l'API (création ou modification) et renvoie l'affiche à jour. */
  async function enregistrer(animationAfficheId = a.animationAfficheId): Promise<Affiche> {
    const r = await enregistrerAffiche({ ...a, animationAfficheId })
    setBrouillon((b) => ({ ...b, id: r.id, codeQr: r.codeQr, proprietaireId: r.proprietaireId, animationAfficheId }))
    return r
  }

  /** Animation (si elle a changé, ou toujours en quittant l'étape 3), puis affiche. */
  async function toutEnregistrer(forcerAnimation: boolean) {
    const animationId = forcerAnimation || !a.animationAfficheId || animModifiee ? await enregistrerAnim() : a.animationAfficheId
    return enregistrer(animationId)
  }

  /**
   * Étape suivante. L'affiche est créée par l'API en quittant l'étape 3, avec son animation (le serveur
   * génère alors son QR code unique) ; une affiche existante est enregistrée à chaque étape.
   */
  async function suivant() {
    setTente(true)
    if (etape === 1 && !a.imageId) return
    if (etape === 2 && Object.values(erreursInfos).some(Boolean)) return
    if (etape === 3 && Object.values(erreursAnim).some(Boolean)) return
    setTente(false)
    if (etape >= 3 || a.id) {
      setEnvoi('enregistrement')
      try {
        const r = await toutEnregistrer(etape === 3)
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
    if (!a.id && (Object.values(erreursInfos).some(Boolean) || Object.values(erreursAnim).some(Boolean))) {
      toast.afficher('Complétez les informations et l’animation 3D (étapes 2 et 3) avant d’enregistrer')
      return
    }
    setEnvoi('enregistrement')
    try {
      await toutEnregistrer(false)
      // Retour à la liste des affiches, où le message de confirmation s'affiche.
      toastApresNavigation(a.statut === 'PUBLIEE' ? `« ${a.nom} » : modifications enregistrées` : `« ${a.nom} » enregistrée en brouillon`)
      navigate('/backoffice/affiches')
    } catch (e) {
      toast.afficher(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  /** Publication : l'animation de l'affiche est activée en même temps. */
  async function publier() {
    setEnvoi('publication')
    try {
      const animationId = animModifiable && anim.statut !== 'PUBLIEE' ? await enregistrerAnim(true) : animModifiee ? await enregistrerAnim() : a.animationAfficheId
      const r = await enregistrer(animationId)
      await publierAffiche(r.id)
      toastApresNavigation(`« ${a.nom} » publiée : son animation est active aux dates prévues`)
      navigate('/backoffice/affiches')
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

  function aligner(p: (typeof ALIGNEMENTS)[number]) {
    const hauteurBloc = qr.taille * ratio * (qr.mention ? 1.16 : 1)
    const x = p.x === -1 ? 1 - qr.taille - 0.04 : p.x === -2 ? (1 - qr.taille) / 2 : p.x
    const y = p.y === -1 ? 1 - hauteurBloc - 0.03 : p.y
    majQr({ x, y })
  }

  function choisirAnimation(animationId: string) {
    const choisie = etat.animations.find((x) => x.id === animationId)
    const suivante = choisie ? { ...choisie } : nouvelleAnimation()
    setAnim(suivante)
    animEnregistree.current = choisie ? JSON.stringify(suivante) : ''
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
  const controle = (ok: boolean, texte: ReactNode, alerte = false) => (
    <li className={ok ? 'ok' : alerte ? 'alerte' : 'ko'}>
      <Icone nom={ok ? 'check' : alerte ? 'alerte' : 'fermer'} taille={14} /> {texte}
    </li>
  )

  const atelierPleineLargeur = etape === 3
  const infoEtape = ETAPES[etape - 1]
  const manquants = [
    !imagePrete && 'le fichier de l’affiche',
    qrCm < QR_MIN_CM && 'un QR code d’au moins 3 cm',
    !conditions.compteVerifie && 'un compte vérifié',
    !conditions.fichiersConformes && 'des fichiers conformes',
    !conditions.charteAcceptee && 'la charte acceptée',
    !conditions.zoneAttribuee && 'une zone attribuée par la mairie',
  ].filter(Boolean) as string[]

  return (
    <>
      <header className="bo-entete">
        <div>
          <Link to="/backoffice/affiches" className="fil-ariane">
            <Icone nom="gauche" taille={14} /> Affiches
          </Link>
          <h1>{existante ? existante.nom : 'Nouvelle affiche'}</h1>
          <p>Votre affiche, son animation 3D et son QR code, réglés au même endroit.</p>
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
      <div className={`editeur-affiche ${atelierPleineLargeur ? 'pleine-largeur' : ''} ${etape === 4 ? 'etape-qr' : ''}`}>
        <div className="editeur-formulaire">
          <ol className="etapes-editeur">
            {ETAPES.map((e, i) => (
              <li key={e.titre} className={etape === i + 1 ? 'actif' : etape > i + 1 ? 'fait' : ''}>
                <button type="button" onClick={() => (existante || i + 1 < etape ? setEtape(i + 1) : undefined)} aria-current={etape === i + 1 ? 'step' : undefined}>
                  <span>{etape > i + 1 ? <Icone nom="check" taille={13} /> : i + 1}</span>
                  <strong>{e.titre}</strong>
                  <small>{e.aide}</small>
                </button>
              </li>
            ))}
          </ol>

          <section className="section-editeur">
            <div className="tete-etape">
              <span className="eyebrow">
                Étape {etape} sur {ETAPES.length}
              </span>
              <h2>{etape === 5 ? (pret ? 'Prête à imprimer' : 'Publication') : etape === 4 ? 'Placez le QR code' : etape === 3 ? 'Animation 3D de l’affiche' : etape === 2 ? 'Informations de l’affiche' : 'Importez votre affiche'}</h2>
              <p className="intro-etape">{infoEtape.intro}</p>
            </div>

            {etape === 1 && (
              <>
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
                    <button type="button" className="btn btn-secondaire btn-petit" onClick={() => void recadrerImage()} disabled={lectureSeule || !!envoi || !image}>
                      <Icone nom="agrandir" taille={14} /> Recadrer
                    </button>
                    <Icone nom="check" taille={18} />
                  </div>
                )}
                <div className="bloc-etape">
                  <h3>Format d’impression</h3>
                  <div className="grille-champs">
                    <label className="champ">
                      <span className="etiquette">
                        Format <small>Selon la zone d’affichage</small>
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
                          <span>
                            {dpi} dpi en {a.format ?? 'A3'}
                          </span>
                          <span>{dpi >= 150 ? 'suffisant' : '150 dpi recommandés'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {etape === 2 && (
              <>
                <div className="bloc-etape">
                  <h3>Textes</h3>
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
                    </label>
                  </div>
                </div>
                <div className="bloc-etape">
                  <h3>Dates d’affichage</h3>
                  <div className="grille-champs">
                    <label className="champ">
                      <span className="etiquette">Date de sortie</span>
                      <input type="date" value={a.debut.slice(0, 10)} onChange={(e) => maj({ debut: `${e.target.value}T00:00:00` })} disabled={lectureSeule} />
                    </label>
                    <label className={`champ ${tente && erreursInfos.dates ? 'erreur' : ''}`}>
                      <span className="etiquette">Date de fin</span>
                      <input type="date" value={a.fin.slice(0, 10)} onChange={(e) => maj({ fin: `${e.target.value}T23:59:00` })} disabled={lectureSeule} />
                    </label>
                  </div>
                </div>
                <div className="bloc-etape">
                  <h3>Après l’animation</h3>
                  <div className="grille-champs">
                    <label className={`champ ${tente && erreursInfos.lieu ? 'erreur' : ''}`}>
                      <span className="etiquette">
                        Lieu promu <small>La carte s’ouvre sur ce lieu</small>
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
                </div>
              </>
            )}

            {etape === 3 && (
              <>
                <div className="atelier-etape">
                  <Suspense
                    fallback={
                      <div className="atelier-chargement">
                        <span className="spinner" /> Ouverture de l’atelier…
                      </div>
                    }
                  >
                    <AtelierAffiche
                      animation={anim}
                      onAnimation={majAnim}
                      reglages3d={modele.reglages}
                      onReglages3d={modele.setReglages}
                      affiche={afficheMontree}
                      desactive={!animModifiable}
                      erreurModele={tente && erreursAnim.modele}
                      entete={
                        <div className="choix-animation">
                          <label className="champ">
                            <span className="etiquette">Animation qui sort de l’affiche</span>
                            <select value={anim.id} onChange={(e) => choisirAnimation(e.target.value)} disabled={lectureSeule}>
                              <option value="">{anim.id ? 'Créer une nouvelle animation' : 'Nouvelle animation pour cette affiche'}</option>
                              {animsAffiche.length > 0 && (
                                <optgroup label="Réutiliser une animation d’affiche">
                                  {animsAffiche.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.titre}
                                      {etatAnim(x)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {animsLieu.length > 0 && (
                                <optgroup label="Animations de monument">
                                  {animsLieu.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.titre} — {nomLieu(x.lieuId)}
                                      {etatAnim(x)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </label>
                          {autresAffiches.length > 0 && (
                            <p className="note-partage">
                              <Icone nom="info" taille={14} /> Utilisée aussi par {autresAffiches.map((x) => `« ${x.nom} »`).join(', ')} : vos réglages s’appliquent aussi {autresAffiches.length > 1 ? 'à ces affiches' : 'à cette affiche'}.
                            </p>
                          )}
                          {!animModifiable && !lectureSeule && (
                            <p className="note-partage">
                              <Icone nom="cadenas" taille={14} /> Animation de la Ville : vous pouvez l’utiliser, pas la modifier.
                            </p>
                          )}
                        </div>
                      }
                    />
                  </Suspense>
                </div>
                <details className="details-etape" open={!!anim.sonId || (tente && erreursAnim.transcription)}>
                  <summary>
                    <Icone nom="son" taille={16} />
                    <strong>Son, durée et accessibilité</strong>
                    <small>
                      {anim.sonId ? 'son ajouté' : 'sans son'} · {anim.dureeS} s
                    </small>
                  </summary>
                  <SonEtDuree animation={anim} onChange={majAnim} desactive={!animModifiable} tente={tente} />
                </details>
                {tente && Object.values(erreursAnim).some(Boolean) && (
                  <p className="erreur-acces" role="alert">
                    <Icone nom="alerte" taille={15} />
                    {erreursAnim.modele ? 'Choisissez ou importez le modèle 3D de l’animation.' : erreursAnim.transcription ? 'Ajoutez la transcription française du son (accessibilité).' : 'La durée doit être comprise entre 5 et 1 800 secondes.'}
                  </p>
                )}
              </>
            )}

            {etape === 4 && (
              <>
                <div className="consigne-clic">
                  <Icone nom="viseur" taille={22} />
                  <div>
                    <strong>Cliquez sur l’affiche à l’endroit voulu</strong>
                    <small>Le QR code s’y place aussitôt. Faites-le glisser pour l’ajuster, ou utilisez les flèches du clavier (Maj pour aller plus vite).</small>
                  </div>
                </div>
                <div className="bloc-etape">
                  <h3>Taille</h3>
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
                </div>
                <div className="bloc-etape">
                  <h3>Apparence</h3>
                  <label className="case">
                    <input type="checkbox" checked={qr.fond} onChange={(e) => majQr({ fond: e.target.checked })} disabled={lectureSeule} />
                    Fond blanc autour du QR code (recommandé sur un visuel sombre ou chargé)
                  </label>
                  <label className="case">
                    <input type="checkbox" checked={qr.mention} onChange={(e) => majQr({ mention: e.target.checked })} disabled={lectureSeule} />
                    Ajouter la mention « Scannez · expérience RA » sous le QR code
                  </label>
                </div>
                <div className="bloc-etape">
                  <h3>Alignement rapide</h3>
                  <div className="positions-qr" role="group" aria-label="Alignements rapides">
                    {ALIGNEMENTS.map((p) => (
                      <button key={p.libelle} type="button" onClick={() => aligner(p)} disabled={lectureSeule}>
                        {p.libelle}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lien-qr">
                  <Icone nom="lien" taille={15} />
                  <code>{a.codeQr ? urlQr(a.codeQr) : 'Généré par le serveur à l’enregistrement'}</code>
                </div>
              </>
            )}

            {etape === 5 && (
              <>
                <div className={`boite-pret ${pret ? '' : 'bloque'}`}>
                  <Icone nom={pret ? 'check' : 'alerte'} taille={20} />
                  <div>
                    <strong>{pret ? (a.statut === 'PUBLIEE' ? 'Affiche publiée et prête à imprimer' : 'Votre affiche est prête') : 'Export et publication bloqués'}</strong>
                    <p>
                      {pret
                        ? 'Le fichier exporté contient votre affiche à sa résolution d’origine avec le QR code incrusté. Publiée sans validation préalable : vous restez responsable du contenu.'
                        : `Il manque : ${manquants.join(', ')}. Cette règle est aussi vérifiée par l’API.`}
                    </p>
                  </div>
                </div>

                <div className="bloc-etape">
                  <h3>Zone d’affichage</h3>
                  <label className="champ">
                    <span className="etiquette">
                      {agent ? 'Attribuer la zone d’affichage' : 'Proposer une zone'}
                      <small>{agent ? 'Selon les règles d’affichage de la Ville' : 'La mairie attribue la zone ; vous pouvez en proposer une'}</small>
                    </span>
                    <select
                      value={agent ? (a.zoneId ?? '') : (a.zoneProposeeId ?? '')}
                      disabled={lectureSeule}
                      onChange={async (e) => {
                        const zoneId = e.target.value
                        try {
                          const r = await enregistrer()
                          if (agent) await attribuerZone(r.id, zoneId || undefined)
                          else if (zoneId) await proposerZone(r.id, zoneId)
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
                            {z.nom} — {z.format} maximum
                            {ORDRE_FORMATS.indexOf(a.format ?? 'A3') > ORDRE_FORMATS.indexOf(z.format) ? ' · format trop grand' : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  {zone && (
                    <div className={`resume-zone ${tropGrand(zone.format) ? 'alerte' : ''}`}>
                      <Icone nom={tropGrand(zone.format) ? 'alerte' : 'zone'} taille={16} />
                      <div>
                        <strong>
                          {zone.nom}
                          {!agent && !a.zoneId && a.zoneProposeeId ? ' — proposée, en attente de la mairie' : ''}
                        </strong>
                        <small>
                          {zone.adresse} · {zone.format} maximum{zone.regles ? ` · ${zone.regles}` : ''}
                        </small>
                        {tropGrand(zone.format) && <small>Votre affiche ({a.format ?? 'A3'}) dépasse le format maximal de cette zone : choisissez un format plus petit à l’étape 1.</small>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bloc-etape">
                  <h3>Conditions de publication</h3>
                  <ul className="conditions">
                    {ligneCondition(conditions.compteVerifie, 'Compte vérifié par la mairie', nomProprietaire(etat, a.proprietaireId))}
                    {ligneCondition(conditions.fichiersConformes, 'Fichiers conformes au contrôle automatique', anim.titre || 'Animation de l’affiche', <Link to="/backoffice/fichiers" className="lien-panneau">Voir les fichiers</Link>)}
                    {ligneCondition(conditions.charteAcceptee, 'Charte d’utilisation acceptée', 'Version 1.0', <Link to="/backoffice/charte" className="lien-panneau">Accepter</Link>)}
                    {ligneCondition(
                      conditions.zoneAttribuee,
                      'Zone d’affichage attribuée par la mairie',
                      etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? `Proposée : ${etat.zones.find((z) => z.id === a.zoneProposeeId)?.nom} — en attente` : 'Aucune zone'),
                    )}
                  </ul>
                </div>

                <div className="bloc-etape">
                  <h3>Contrôles de l’affiche</h3>
                  <ul className="verifications">
                    {controle(imagePrete, <>Fichier de l’affiche importé {a.image ? `(${a.image.largeur} × ${a.image.hauteur} px)` : ''}</>)}
                    {controle(!!a.codeQr, <>QR code unique : <code>{a.codeQr ? urlQr(a.codeQr) : '—'}</code></>)}
                    {controle(qrCm >= QR_MIN_CM, <>QR code placé : {qrCm.toFixed(1).replace('.', ',')} cm en {a.format ?? 'A3'}</>)}
                    {controle(!!anim.modeleId, <>Animation 3D : {fichierModele?.nomOriginal ?? 'aucun modèle'}</>)}
                    {controle(
                      !alerteAnim,
                      anim.statut === 'PUBLIEE' ? 'L’animation est active pendant toute la période de l’affiche' : 'L’animation sera activée en même temps que l’affiche',
                      true,
                    )}
                  </ul>
                  {alerteAnim && (
                    <p className="erreur-acces" role="status">
                      <Icone nom="alerte" taille={15} />
                      <span>
                        {alerteAnim} <button type="button" className="lien-panneau" onClick={() => setEtape(3)}>Revoir l’animation</button>
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          <div className="pied-editeur">
            <button type="button" className="btn btn-fantome" onClick={() => (etape === 1 ? navigate('/backoffice/affiches') : setEtape(etape - 1))}>
              {etape === 1 ? 'Annuler' : (
                <>
                  <Icone nom="gauche" taille={15} /> {ETAPES[etape - 2].titre}
                </>
              )}
            </button>
            {etape < 5 ? (
              <button type="button" className="btn btn-primaire" onClick={() => void suivant()} disabled={!!envoi}>
                {envoi === 'enregistrement' ? <span className="spinner" /> : null}
                {etape === 3 && !a.id ? 'Créer l’affiche et son QR code' : `Continuer : ${ETAPES[etape].titre}`} <Icone nom="droite" taille={15} />
              </button>
            ) : (
              <div className="actions-finales">
                {a.statut !== 'PUBLIEE' && (
                  <button type="button" className="btn btn-secondaire" disabled={!pret || lectureSeule || !!envoi} onClick={() => void publier()}>
                    {envoi === 'publication' ? <span className="spinner" /> : null} Publier
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

        {!atelierPleineLargeur && (
          <aside className={`editeur-apercu ${etape === 4 ? 'etape-qr' : ''}`}>
            <div className="libelle-apercu">
              {etape === 5 ? (
                <div className="onglets onglets-apercu" role="tablist" aria-label="Type d’aperçu">
                  <button type="button" role="tab" aria-selected={vue === 'affiche'} className={vue === 'affiche' ? 'actif' : ''} onClick={() => setVue('affiche')}>
                    Affiche
                  </button>
                  <button type="button" role="tab" aria-selected={vue === 'ra'} className={vue === 'ra' ? 'actif' : ''} onClick={() => setVue('ra')} disabled={!imagePrete}>
                    <Icone nom="cube" taille={14} /> Aperçu RA
                  </button>
                </div>
              ) : (
                <strong>{etape === 4 ? 'Cliquez pour placer le QR code' : 'Aperçu de l’affiche'}</strong>
              )}
              <span className="pill pill-stone">
                {a.format ?? 'A3'} · {(largeurMm / 10).toFixed(1).replace('.', ',')} × {(hauteurMm / 10).toFixed(1).replace('.', ',')} cm
              </span>
            </div>
            {etape === 5 && vue === 'ra' && imagePrete ? (
              <Suspense fallback={<div className="apercu-animation-affiche chargement"><span className="spinner" /></div>}>
                <ApercuAnimationAffiche image={image!} code={a.codeQr || 'apercu'} qr={qr} ratio={ratio} format={a.format} animation={animApercu} />
              </Suspense>
            ) : (
              <>
                <div className="feuille-format" style={{ aspectRatio: String(ratioPage), ['--ratio' as string]: ratioPage }} title={`Feuille ${a.format ?? 'A3'}`}>
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
                    {!lectureSeule && etape === 1 && (
                      <button type="button" className="lien-bouton" onClick={() => void recadrerImage()} disabled={!!envoi}>
                        Recadrer au format
                      </button>
                    )}
                  </p>
                )}
                {etape === 2 && (
                  <div className="apercu-fiche-app" aria-label="Aperçu dans l’application">
                    <small>Dans l’application, après l’animation</small>
                    {a.accroche && <span className="eyebrow">{a.accroche}</span>}
                    <strong>{a.nom || 'Nom de l’affiche'}</strong>
                    <p>{a.texte || 'Le texte de l’affiche apparaîtra ici.'}</p>
                    {lieuPromu && (
                      <span className="pill pill-green">
                        <Icone nom="pin" taille={12} /> {lieuPromu.nomCourt || lieuPromu.nom}
                        {animL ? ` · ${animL.titre}` : ''}
                      </span>
                    )}
                  </div>
                )}
                {(etape === 1 || etape === 4) && <EchelleFormat format={a.format ?? 'A3'} paysage={paysage} image={image} qr={qr} onFormat={(format) => maj({ format })} desactive={lectureSeule} />}
              </>
            )}
            <p className="note-apercu">
              <Icone nom="info" taille={14} /> Le QR code renvoie uniquement vers l’application ; aucun lien externe n’est possible.
            </p>
          </aside>
        )}
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
      {recadrage && (
        <RecadrageAffiche
          source={recadrage.fichier}
          nom={recadrage.nom}
          formatInitial={recadrage.format}
          onAnnuler={() => setRecadrage(null)}
          onTelQuel={
            recadrage.dejaImportee
              ? undefined
              : () => {
                  const r = recadrage
                  setRecadrage(null)
                  void envoyer(r.fichier, r.nom)
                }
          }
          onValider={(fichier, format) => {
            const r = recadrage
            setRecadrage(null)
            maj({ format })
            setInfoImport(`Image recadrée au format ${format}.`)
            void envoyer(fichier, r.nom)
          }}
        />
      )}
      {toast.element}
    </>
  )
}
