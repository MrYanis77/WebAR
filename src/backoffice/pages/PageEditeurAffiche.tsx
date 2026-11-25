import { lazy, Suspense, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { AfficheAvecQr, FORMATS_MM, largeurImpressionMm, QR_DEFAUT, useOrigineApplication } from '../../commun/AfficheQr'
import { REGLAGE_AFFICHE_RA_DEFAUT } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { QR_MIN_CM, QR_TAILLE_MAX, qrImprimeCm, tailleQrMinimale } from '../../commun/impression'
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
import { RecadrageAffiche } from '../composants/RecadrageAffiche'

const ApercuAnimationAffiche = lazy(() => import('../composants/ApercuAnimationAffiche'))
const AtelierAffiche = lazy(() => import('../composants/atelier/AtelierAffiche'))
const CarteZones = lazy(() => import('../composants/CarteZones'))

/**
 * Étapes de l'assistant. Suites des tests utilisateurs : des titres qui disent ce qu'on fait et pour qui
 * (le visiteur), des introductions d'une phrase, un seul endroit pour choisir le format (étape 1).
 */
const ETAPES = [
  { titre: 'Affiche', aide: 'Emplacement et image', h2: 'Où et quelle affiche ?', intro: 'Choisissez d’abord où elle sera collée : l’emplacement fixe la taille du papier. Ajoutez ensuite l’image de votre affiche.' },
  { titre: 'Textes', aide: 'Ce que lit le visiteur', h2: 'Ce que le visiteur va lire', intro: 'Ces textes s’affichent sur le téléphone du visiteur, juste après l’animation. Seuls les champs « Obligatoire » sont nécessaires pour continuer.' },
  { titre: 'Animation', aide: 'Ce qui sort de l’affiche', h2: 'L’animation qui sort de l’affiche', intro: 'Choisissez le modèle 3D, placez-le dans la vue (déplacer, tourner, taille), puis ajoutez un son si besoin : tout se règle dans le panneau à droite.' },
  { titre: 'QR code', aide: 'Taille et position', h2: 'Placez le QR code', intro: 'Votre affiche a maintenant son QR code unique. Cliquez sur l’affiche, à droite, pour le placer. Il mesure au moins 3 cm une fois imprimé, pour être scanné facilement.' },
  { titre: 'Publication', aide: 'Publier puis imprimer', h2: 'Publiez votre affiche', intro: 'Publiez d’abord : le QR code devient actif. Téléchargez ensuite le fichier à imprimer.' },
]
const TAILLE_MAX_OCTETS = 30_000_000
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

/**
 * QR code agrandi si besoin pour mesurer au moins 3 cm imprimé (format ou image changés) : le partenaire
 * ne peut plus descendre sous la limite, au lieu d'être bloqué une étape plus tard (tests utilisateurs).
 */
function qrAuMoins3cm(q: PlacementQr, format: string | undefined, image?: { largeur: number; hauteur: number }): PlacementQr {
  const min = tailleQrMinimale(format, image?.largeur, image?.hauteur)
  return q.taille >= min ? q : { ...q, taille: min, x: Math.min(q.x, 1 - min) }
}

/** Champ obligatoire ou facultatif, écrit en toutes lettres (tests utilisateurs). */
function Mention({ obligatoire }: { obligatoire?: boolean }) {
  return <small className={obligatoire ? 'mention-obligatoire' : 'mention-facultatif'}>{obligatoire ? 'Obligatoire' : 'Facultatif'}</small>
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
  /** Changement de format : le QR code reste à 3 cm au moins une fois imprimé. */
  const majFormat = (format: string) => setBrouillon((b) => ({ ...b, format, qr: qrAuMoins3cm(b.qr ?? QR_DEFAUT, format, b.image) }))

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
  // Même mesure que le PDF imprimé et que l'API : fraction de la largeur de l'image ajustée dans la page.
  const qrCm = qrImprimeCm(qr.taille, a.format, a.image?.largeur, a.image?.hauteur)
  const qrTailleMin = tailleQrMinimale(a.format, a.image?.largeur, a.image?.hauteur)
  const qrTropPetit = qrCm < QR_MIN_CM - 0.005
  const dpi = a.image ? Math.round(a.image.largeur / (largeurMm / 25.4)) : 0
  const imagePrete = !!a.image && !!image
  const pret = publiable(conditions) && imagePrete && !qrTropPetit
  const erreursInfos = { nom: !a.nom.trim(), texte: !a.texte.trim(), dates: a.fin <= a.debut, lieu: !a.lieuId }
  const erreursAnim = animModifiable
    ? { modele: !anim.modeleId, transcription: !!anim.sonId && !anim.transcription.fr.trim(), duree: !(anim.dureeS >= 5 && anim.dureeS <= 1800) }
    : { modele: !anim.id, transcription: false, duree: false }
  const zone = etat.zones.find((z) => z.id === (agent ? a.zoneId : (a.zoneProposeeId ?? a.zoneId)))
  const tropGrand = (format?: string) => !!zone && ORDRE_FORMATS.indexOf(a.format ?? 'A3') > ORDRE_FORMATS.indexOf(format ?? 'A0')
  const zonesActives = etat.zones.filter((z) => z.active)
  /** L'emplacement se choisit au début (étape 1) : il fixe le format maximal de l'affiche. */
  const erreurZone = zonesActives.length > 0 && !zone

  /**
   * Import de l'image de l'affiche (PNG, JPEG ou WebP uniquement : le sélecteur de fichiers ne propose
   * plus les PDF, qui déroutaient les testeurs) : pré-contrôle (format, poids, dimensions) puis envoi à
   * l'API, qui vérifie le type réel et réencode l'image (sharp) avant de la marquer conforme.
   */
  async function importer(fichier: File) {
    setErreurImport(null)
    setInfoImport(null)
    if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) {
      setErreurImport(
        /pdf$/i.test(fichier.type) || /\.pdf$/i.test(fichier.name)
          ? `« ${fichier.name} » est un PDF : exportez votre affiche en image (PNG ou JPEG) depuis votre logiciel de mise en page, puis importez cette image.`
          : `« ${fichier.name} » refusé : importez une image PNG, JPEG ou WebP.`,
      )
      return
    }
    // Recadrage au format d'impression, sauf si l'image en a déjà les proportions.
    try {
      const d = await dimensions(fichier)
      const [fl, fh] = FORMATS_MM[a.format ?? 'A3'] ?? FORMATS_MM.A3
      const r = d.largeur / d.hauteur
      const auFormat = Math.abs(r - fl / fh) < 0.02 || Math.abs(r - fh / fl) < 0.02
      if (!auFormat) {
        setRecadrage({ fichier, nom: fichier.name, format: a.format ?? 'A3' })
        return
      }
    } catch {
      setErreurImport('Image illisible ou corrompue.')
      return
    }
    await envoyer(fichier, fichier.name)
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
      const nouvelle = { nom: f.nomOriginal, largeur: f.largeurPx ?? d.largeur, hauteur: f.hauteurPx ?? d.hauteur, octets: f.tailleOctets, url: f.url }
      setBrouillon((b) => ({
        ...b,
        imageId: f.id,
        image: nouvelle,
        nom: b.nom || nomSource.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60),
        qr: qrAuMoins3cm(b.qr ?? QR_DEFAUT, b.format, nouvelle),
      }))
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

  /**
   * Emplacement choisi à l'étape 1. Affiche pas encore créée : le choix est gardé et envoyé à sa création ;
   * affiche existante : attribué (agent) ou demandé à la mairie (partenaire) aussitôt. Un format plus
   * grand que ce que l'emplacement accepte est ramené à son maximum.
   */
  async function choisirZone(zoneId: string) {
    const z = etat.zones.find((x) => x.id === zoneId)
    // Le format de l'affiche est celui de l'emplacement (le choix du format a été retiré de l'étape 1).
    if (z && z.format !== a.format) majFormat(z.format)
    if (!a.id) {
      maj(agent ? { zoneId: zoneId || undefined } : { zoneProposeeId: zoneId || undefined })
      return
    }
    try {
      const r = await enregistrer()
      if (agent) await attribuerZone(r.id, zoneId || undefined)
      else if (zoneId) await proposerZone(r.id, zoneId)
      toast.afficher(agent ? 'Emplacement attribué — partenaire prévenu' : 'Demande envoyée à la mairie')
    } catch (err) {
      toast.afficher(messageErreur(err))
    }
  }

  /** Envoie l'emplacement choisi à l'étape 1, une fois l'affiche créée par l'API. */
  async function envoyerZone(afficheId: string) {
    const zoneId = agent ? brouillon.zoneId : brouillon.zoneProposeeId
    if (!zoneId) return
    try {
      if (agent) await attribuerZone(afficheId, zoneId)
      else await proposerZone(afficheId, zoneId)
    } catch (err) {
      toastApresNavigation(`Emplacement non envoyé : ${messageErreur(err)}`)
    }
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
    if (etape === 1 && (!a.imageId || erreurZone)) return
    if (etape === 2 && Object.values(erreursInfos).some(Boolean)) return
    if (etape === 3 && Object.values(erreursAnim).some(Boolean)) return
    // QR code trop petit : bloqué ici, à l'étape du QR code, et pas une étape plus loin.
    if (etape === 4 && qrTropPetit) return
    setTente(false)
    if (etape >= 3 || a.id) {
      setEnvoi('enregistrement')
      try {
        const r = await toutEnregistrer(etape === 3)
        if (!a.id) {
          await envoyerZone(r.id)
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
      const r = await toutEnregistrer(false)
      if (!a.id) await envoyerZone(r.id)
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
  /**
   * Le QR code n'apparaît qu'à son étape (4) : il n'existe qu'une fois l'affiche créée, et le montrer dès
   * l'import de l'image faisait croire qu'il était déjà placé (tests utilisateurs). Une affiche déjà créée
   * le montre partout, à l'endroit où il a été placé.
   */
  const qrVisible = etape >= 4 || !!a.codeQr
  const manquants = [
    !imagePrete && 'l’image de l’affiche',
    qrTropPetit && 'un QR code d’au moins 3 cm',
    !conditions.compteVerifie && 'la vérification de votre compte par la mairie',
    !conditions.fichiersConformes && 'la vérification automatique de vos fichiers',
    !conditions.charteAcceptee && 'l’acceptation de la charte',
    !conditions.zoneAttribuee && 'un emplacement d’affichage validé par la mairie',
  ].filter(Boolean) as string[]
  const publiee = a.statut === 'PUBLIEE'

  const cm = (v: number) => v.toFixed(1).replace('.', ',')
  const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const qrTailleMax = Math.max(qrTailleMin, Math.min(QR_TAILLE_MAX, 0.35))

  return (
    <>
      <header className="bo-entete">
        <div>
          <Link to="/backoffice/affiches" className="fil-ariane">
            <Icone nom="gauche" taille={14} /> Affiches
          </Link>
          <h1>{existante ? existante.nom : 'Nouvelle affiche'}</h1>
          <p>Votre affiche, l’animation 3D qui en sort et son QR code, en 5 étapes.</p>
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
        </div>
      </header>
      <div className={`editeur-affiche ${atelierPleineLargeur ? 'pleine-largeur' : ''} ${etape === 4 ? 'etape-qr' : ''}`}>
        <div className="editeur-formulaire">
          <ol className="etapes-editeur" aria-label="Étapes de création de l’affiche">
            {ETAPES.map((e, i) => (
              <li key={e.titre} className={etape === i + 1 ? 'actif' : etape > i + 1 ? 'fait' : ''}>
                <button type="button" onClick={() => (existante || i + 1 < etape ? setEtape(i + 1) : undefined)} aria-current={etape === i + 1 ? 'step' : undefined}>
                  <span>{etape > i + 1 ? <Icone nom="check" taille={14} /> : i + 1}</span>
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
              <h2>{etape === 5 && publiee ? 'Votre affiche est publiée' : infoEtape.h2}</h2>
              <p className="intro-etape">{infoEtape.intro}</p>
            </div>

            {etape === 1 && (
              <>
                {zonesActives.length > 0 && (
                  <div className={`bloc-etape bloc-zone ${tente && erreurZone ? 'erreur' : ''}`}>
                    <h3>
                      {agent ? 'Emplacement d’affichage' : 'Où sera collée votre affiche ?'} <Mention obligatoire />
                    </h3>
                    <p className="aide-bloc">
                      {agent ? 'Choisissez sur la carte ou dans la liste l’emplacement autorisé où elle sera collée.' : 'Choisissez sur la carte ou dans la liste. La mairie valide votre demande avant la publication.'}
                    </p>
                    <div className="choix-zone">
                      <Suspense fallback={<div className="carte-zones petite" />}>
                        <CarteZones
                          zones={zonesActives}
                          choisie={zone?.id}
                          onChoix={(z) => !lectureSeule && void choisirZone(z.id)}
                          libelleRepere={(z) => `${z.nom} — jusqu’au ${z.format}`}
                          className="carte-zones petite"
                        />
                      </Suspense>
                      <label className="champ">
                        <span className="etiquette">{agent ? 'Emplacement attribué' : 'Emplacement souhaité'}</span>
                        <select value={zone?.id ?? ''} disabled={lectureSeule} onChange={(e) => void choisirZone(e.target.value)}>
                          <option value="">Choisir un emplacement…</option>
                          {zonesActives.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.nom} — jusqu’au {z.format}
                            </option>
                          ))}
                        </select>
                      </label>
                      {zone && (
                        <div className="resume-zone">
                          <Icone nom="zone" taille={16} />
                          <div>
                            <strong>
                              {zone.nom}
                              {!agent && !a.zoneId && a.zoneProposeeId ? (a.id ? ' — en attente de validation par la mairie' : ' — la mairie validera votre demande') : ''}
                            </strong>
                            <small>
                              {zone.adresse} · affiche imprimée en {a.format ?? 'A3'}
                              {zone.regles ? ` · ${zone.regles}` : ''}
                            </small>
                          </div>
                        </div>
                      )}
                    </div>
                    {tente && erreurZone && <span className="message-erreur">Choisissez l’emplacement où l’affiche sera collée.</span>}
                  </div>
                )}
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
                    <Icone nom="image" taille={26} />
                  </span>
                  <strong>{envoi === 'import' ? 'Envoi et vérification de l’image…' : a.image ? 'Remplacer l’image de l’affiche' : 'Glissez l’image de votre affiche ici'}</strong>
                  <p>Image PNG ou JPEG, exportée en haute définition depuis votre logiciel de mise en page.</p>
                  <button type="button" className="btn btn-primaire" onClick={() => entree.current?.click()} disabled={lectureSeule || !!envoi}>
                    {envoi === 'import' ? <span className="spinner" /> : <Icone nom="import" taille={16} />}
                    Choisir une image
                  </button>
                  <input
                    ref={entree}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void importer(f)
                      e.target.value = ''
                    }}
                  />
                </div>
                {tente && !a.image && !erreurImport && (
                  <p className="erreur-acces" role="alert">
                    <Icone nom="alerte" taille={15} /> Importez l’image de votre affiche pour continuer.
                  </p>
                )}
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
                {/* Plus de choix du format ici : il découle de l'emplacement choisi (ou du recadrage). */}
                {a.image && dpi < 150 && (
                  <p className="erreur-acces" role="status">
                    <Icone nom="alerte" taille={15} />
                    Image un peu petite pour une impression en {a.format ?? 'A3'} ({dpi} dpi, 150 conseillés).
                  </p>
                )}
              </>
            )}

            {etape === 2 && (
              <>
                <div className="bloc-etape">
                  <h3>Textes de l’affiche</h3>
                  <div className="grille-champs">
                    <label className={`champ ${tente && erreursInfos.nom ? 'erreur' : ''}`}>
                      <span className="etiquette">
                        Nom de l’affiche <Mention obligatoire />
                      </span>
                      <input value={a.nom} onChange={(e) => maj({ nom: e.target.value })} maxLength={60} disabled={lectureSeule} placeholder="Ex. : Fête de la musique" />
                      <span className="aide">Le titre, affiché en grand sur le téléphone.</span>
                      {tente && erreursInfos.nom && <span className="message-erreur">Donnez un nom à votre affiche.</span>}
                    </label>
                    <label className="champ">
                      <span className="etiquette">
                        Phrase d’accroche <Mention />
                      </span>
                      <input value={a.accroche} onChange={(e) => maj({ accroche: e.target.value })} maxLength={40} disabled={lectureSeule} placeholder="Ex. : Ce samedi au château" />
                      <span className="aide">Quelques mots au-dessus du nom, pour donner envie ({a.accroche.length}/40).</span>
                    </label>
                    <label className={`champ pleine ${tente && erreursInfos.texte ? 'erreur' : ''}`}>
                      <span className="etiquette">
                        Description <Mention obligatoire />
                      </span>
                      <textarea
                        value={a.texte}
                        onChange={(e) => maj({ texte: e.target.value.replace(/https?:\/\/\S+/g, '') })}
                        maxLength={300}
                        rows={3}
                        disabled={lectureSeule}
                        placeholder="Ex. : Concerts gratuits dans toute la ville, de 18 h à minuit. Venez en famille !"
                      />
                      <span className="aide">Ce que le visiteur lit après l’animation : quoi, quand, où ({a.texte.length}/300). Texte simple, sans lien internet.</span>
                      {tente && erreursInfos.texte && <span className="message-erreur">Écrivez une courte description.</span>}
                    </label>
                  </div>
                </div>
                <div className="bloc-etape">
                  <h3>Période d’affichage</h3>
                  <p className="aide-bloc">Le QR code lance l’animation seulement entre ces deux dates, par exemple pendant que l’affiche est collée en ville.</p>
                  <div className="grille-champs">
                    <label className="champ">
                      <span className="etiquette">
                        Début de l’affichage <Mention obligatoire />
                      </span>
                      <input type="date" value={a.debut.slice(0, 10)} onChange={(e) => maj({ debut: `${e.target.value}T00:00:00` })} disabled={lectureSeule} />
                      <span className="aide">Premier jour où le QR code fonctionne.</span>
                    </label>
                    <label className={`champ ${tente && erreursInfos.dates ? 'erreur' : ''}`}>
                      <span className="etiquette">
                        Fin de l’affichage <Mention obligatoire />
                      </span>
                      <input type="date" value={a.fin.slice(0, 10)} onChange={(e) => maj({ fin: `${e.target.value}T23:59:00` })} disabled={lectureSeule} />
                      <span className="aide">Dernier jour, inclus.</span>
                      {tente && erreursInfos.dates && <span className="message-erreur">La fin doit être après le début.</span>}
                    </label>
                  </div>
                </div>
                <div className="bloc-etape">
                  <h3>Après l’animation</h3>
                  <p className="aide-bloc">La carte de la ville s’ouvre ensuite sur ce lieu, pour inviter le visiteur à s’y rendre.</p>
                  <div className="grille-champs">
                    <label className={`champ ${tente && erreursInfos.lieu ? 'erreur' : ''}`}>
                      <span className="etiquette">
                        Lieu à faire découvrir <Mention obligatoire />
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
                        Spectacle à mettre en avant <Mention />
                      </span>
                      <select value={a.animationLieuId ?? ''} onChange={(e) => maj({ animationLieuId: e.target.value || undefined })} disabled={lectureSeule || !a.lieuId}>
                        <option value="">{animsDuLieu.length ? 'Aucun' : 'Aucun spectacle dans ce lieu'}</option>
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
                        <span className="spinner" /> Ouverture de la vue 3D…
                      </div>
                    }
                  >
                    <AtelierAffiche
                      animation={anim}
                      onAnimation={majAnim}
                      reglages3d={modele.reglages}
                      onReglages3d={modele.setReglages}
                      affiche={afficheMontree}
                      sansQr={!qrVisible}
                      desactive={!animModifiable}
                      erreurModele={tente && erreursAnim.modele}
                      son={<SonEtDuree animation={anim} onChange={majAnim} desactive={!animModifiable} tente={tente} />}
                      entete={
                        (animsAffiche.length > 0 || animsLieu.length > 0 || autresAffiches.length > 0 || (!animModifiable && !lectureSeule)) && (
                          <div className="choix-animation">
                            <label className="champ">
                              <span className="etiquette">
                                Animation <small>Nouvelle, ou déjà créée</small>
                              </span>
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
                        )
                      }
                    />
                  </Suspense>
                </div>
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
                    <strong>Cliquez sur l’affiche, à droite, à l’endroit voulu</strong>
                    <small>Le QR code s’y place aussitôt. Faites-le glisser pour l’ajuster.</small>
                  </div>
                </div>
                <div className={`bloc-etape bloc-taille-qr ${qrTropPetit ? 'erreur' : ''}`}>
                  <h3>Taille du QR code</h3>
                  <div className="mesure-qr">
                    <strong>{cm(qrCm)} cm</strong>
                    <span>
                      de côté une fois imprimé en {a.format ?? 'A3'}
                      <br />
                      minimum {QR_MIN_CM} cm · lisible jusqu’à environ {cm(Math.max(0.3, qrCm / 10))} m
                    </span>
                  </div>
                  <input
                    type="range"
                    className="curseur-qr"
                    aria-label="Taille du QR code"
                    aria-valuetext={`${cm(qrCm)} cm`}
                    min={qrTailleMin}
                    max={qrTailleMax}
                    step={0.0025}
                    value={Math.min(qrTailleMax, Math.max(qr.taille, qrTailleMin))}
                    disabled={lectureSeule}
                    onChange={(e) => {
                      const taille = Math.max(qrTailleMin, Number(e.target.value))
                      majQr({ taille, x: Math.min(qr.x, 1 - taille) })
                    }}
                  />
                  <div className="bornes-curseur" aria-hidden="true">
                    <span>{QR_MIN_CM} cm (minimum)</span>
                    <span>{cm(qrImprimeCm(qrTailleMax, a.format, a.image?.largeur, a.image?.hauteur))} cm</span>
                  </div>
                  {qrTropPetit && (
                    <p className="erreur-acces" role="alert">
                      <Icone nom="alerte" taille={15} />
                      <span>
                        QR code trop petit pour être scanné facilement.{' '}
                        <button type="button" className="lien-panneau" onClick={() => majQr({ taille: qrTailleMin, x: Math.min(qr.x, 1 - qrTailleMin) })} disabled={lectureSeule}>
                          Agrandir à {QR_MIN_CM} cm
                        </button>
                      </span>
                    </p>
                  )}
                </div>
                <div className="bloc-etape">
                  <h3>Position rapide</h3>
                  <div className="positions-qr" role="group" aria-label="Positions rapides">
                    {ALIGNEMENTS.map((p) => (
                      <button key={p.libelle} type="button" onClick={() => aligner(p)} disabled={lectureSeule}>
                        {p.libelle}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bloc-etape">
                  <h3>Apparence</h3>
                  <label className="case">
                    <input type="checkbox" checked={qr.fond} onChange={(e) => majQr({ fond: e.target.checked })} disabled={lectureSeule} />
                    Fond blanc autour du QR code (conseillé sur une image sombre ou chargée)
                  </label>
                  <label className="case">
                    <input type="checkbox" checked={qr.mention} onChange={(e) => majQr({ mention: e.target.checked })} disabled={lectureSeule} />
                    Ajouter « Scannez · expérience RA » sous le QR code
                  </label>
                </div>
              </>
            )}

            {etape === 5 && (
              <>
                <ol className="parcours-publication">
                  <li className={publiee ? 'fait' : pret ? 'actif' : 'bloque'}>
                    <span className="numero">{publiee ? <Icone nom="check" taille={16} /> : 1}</span>
                    <div>
                      <strong>{publiee ? 'Affiche publiée : son QR code est actif' : 'Publier l’affiche'}</strong>
                      <small>
                        {publiee
                          ? `Les visiteurs qui scannent le QR code voient l’animation du ${jour(a.debut)} au ${jour(a.fin)}.`
                          : pret
                            ? 'Le QR code lancera l’animation aux dates prévues. Publiée sans validation préalable : vous restez responsable du contenu.'
                            : `Pas encore possible. Il manque : ${manquants.join(', ')}.`}
                      </small>
                    </div>
                    {!publiee && (
                      <button type="button" className="btn btn-primaire btn-publier" disabled={!pret || lectureSeule || !!envoi} onClick={() => void publier()}>
                        {envoi === 'publication' ? <span className="spinner" /> : <Icone nom="check" taille={17} />} Publier l’affiche
                      </button>
                    )}
                  </li>
                  <li className={publiee ? 'actif' : 'en-attente'}>
                    <span className="numero">2</span>
                    <div>
                      <strong>Télécharger le fichier à imprimer</strong>
                      <small>
                        {publiee
                          ? `Votre affiche au format ${a.format ?? 'A3'}, avec le QR code incrusté, prête pour l’imprimeur.`
                          : 'Disponible dès que l’affiche est publiée : on imprime ainsi une affiche dont le QR code fonctionne.'}
                      </small>
                    </div>
                    <div className="actions-telechargement">
                      <button type="button" className={`btn ${publiee ? 'btn-primaire' : 'btn-fantome'}`} disabled={!pret || !publiee || !!export_} onClick={() => void exporter('pdf')}>
                        {export_ === 'pdf' ? <span className="spinner" /> : <Icone nom="telecharger" taille={16} />}
                        PDF {a.format ?? 'A3'}
                      </button>
                      <button type="button" className="btn btn-fantome" disabled={!pret || !publiee || !!export_} onClick={() => void exporter('png')}>
                        {export_ === 'png' ? <span className="spinner" /> : <Icone nom="image" taille={16} />}
                        Image PNG
                      </button>
                    </div>
                  </li>
                </ol>

                {/* L'emplacement se choisit désormais à l'étape 1 ; ici, seulement son état dans les conditions. */}
                {zone && tropGrand(zone.format) && (
                  <p className="erreur-acces" role="status">
                    <Icone nom="alerte" taille={15} />
                    <span>
                      Votre affiche est en {a.format ?? 'A3'}, plus grande que ce qu’accepte « {zone.nom} » (jusqu’au {zone.format}).{' '}
                      <button type="button" className="lien-panneau" onClick={() => majFormat(zone.format)} disabled={lectureSeule}>
                        Passer en {zone.format}
                      </button>
                    </span>
                  </p>
                )}

                <div className="bloc-etape">
                  <h3>Avant de publier</h3>
                  <ul className="conditions">
                    {ligneCondition(conditions.compteVerifie, 'Compte vérifié par la mairie', nomProprietaire(etat, a.proprietaireId))}
                    {ligneCondition(conditions.fichiersConformes, 'Image et modèle 3D vérifiés', 'Vérification automatique des fichiers importés', <Link to="/backoffice/fichiers" className="lien-panneau">Voir les fichiers</Link>)}
                    {ligneCondition(conditions.charteAcceptee, 'Charte d’utilisation acceptée', 'Version 1.0', <Link to="/backoffice/charte" className="lien-panneau">Accepter</Link>)}
                    {ligneCondition(
                      conditions.zoneAttribuee,
                      'Emplacement d’affichage validé par la mairie',
                      etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? `Demandé : ${etat.zones.find((z) => z.id === a.zoneProposeeId)?.nom} — en attente` : 'À choisir à l’étape 1'),
                      <button type="button" className="lien-panneau" onClick={() => setEtape(1)}>
                        {a.zoneProposeeId ? 'Changer' : 'Choisir'}
                      </button>,
                    )}
                    {ligneCondition(
                      !qrTropPetit,
                      'QR code d’au moins 3 cm',
                      `${cm(qrCm)} cm en ${a.format ?? 'A3'}`,
                      <button type="button" className="lien-panneau" onClick={() => setEtape(4)}>
                        Agrandir
                      </button>,
                    )}
                  </ul>
                  <details className="details-verifications">
                    <summary>Détail de l’affiche</summary>
                    <ul className="verifications">
                      {controle(imagePrete, <>Image de l’affiche {a.image ? `(${a.image.largeur} × ${a.image.hauteur} px)` : ''}</>)}
                      {controle(!!anim.modeleId, <>Animation 3D : {fichierModele?.nomOriginal ?? 'aucun modèle'}</>)}
                      {controle(!alerteAnim, anim.statut === 'PUBLIEE' ? 'L’animation est active pendant toute la période de l’affiche' : 'L’animation sera activée en même temps que l’affiche', true)}
                    </ul>
                  </details>
                  {alerteAnim && (
                    <p className="erreur-acces" role="status">
                      <Icone nom="alerte" taille={15} />
                      <span>
                        {alerteAnim}{' '}
                        <button type="button" className="lien-panneau" onClick={() => setEtape(3)}>
                          Revoir l’animation
                        </button>
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Barre d'actions collée en bas du formulaire : toujours visible, rien ne la recouvre. */}
          <div className="pied-editeur">
            <button type="button" className="btn btn-fantome" onClick={() => (etape === 1 ? navigate('/backoffice/affiches') : setEtape(etape - 1))}>
              {etape === 1 ? (
                'Annuler'
              ) : (
                <>
                  <Icone nom="gauche" taille={15} /> {ETAPES[etape - 2].titre}
                </>
              )}
            </button>
            <div className="pied-droite">
              <button type="button" className="btn btn-secondaire" onClick={() => void sauver()} disabled={lectureSeule || !a.imageId || !!envoi}>
                {envoi === 'enregistrement' ? <span className="spinner" /> : null}
                {publiee ? 'Enregistrer les modifications' : 'Enregistrer le brouillon'}
              </button>
              {etape < 5 && (
                <button type="button" className="btn btn-primaire" onClick={() => void suivant()} disabled={!!envoi}>
                  {etape === 3 && !a.id ? 'Créer l’affiche et son QR code' : `Continuer : ${ETAPES[etape].titre}`} <Icone nom="droite" taille={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {!atelierPleineLargeur && (
          <aside className={`editeur-apercu ${etape === 4 ? 'etape-qr' : ''}`} aria-label="Aperçu de l’affiche">
            <div className="libelle-apercu">
              {etape === 5 ? (
                <div className="onglets onglets-apercu" role="tablist" aria-label="Type d’aperçu">
                  <button type="button" role="tab" aria-selected={vue === 'affiche'} className={vue === 'affiche' ? 'actif' : ''} onClick={() => setVue('affiche')}>
                    <Icone nom="affiche" taille={14} /> L’affiche
                  </button>
                  <button type="button" role="tab" aria-selected={vue === 'ra'} className={vue === 'ra' ? 'actif' : ''} onClick={() => setVue('ra')} disabled={!imagePrete}>
                    <Icone nom="cube" taille={14} /> L’animation sur un téléphone
                  </button>
                </div>
              ) : (
                <strong className="titre-apercu">
                  <Icone nom={etape === 4 ? 'viseur' : 'oeil'} taille={17} />
                  {etape === 4 ? 'Cliquez sur l’affiche pour placer le QR code' : etape === 2 ? 'Ce que verra le visiteur' : 'Aperçu de votre affiche'}
                </strong>
              )}
              <span className="pill pill-stone">
                {a.format ?? 'A3'} · {cm(largeurMm / 10)} × {cm(hauteurMm / 10)} cm
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
                        className={`apercu-editeur ${etape === 4 ? 'qr-a-placer' : ''}`}
                        sansQr={!qrVisible}
                      />
                    )}
                  </div>
                </div>
                {Math.abs(ratio - ratioPage) > 0.02 && a.image && (
                  <p className="note-apercu">
                    <Icone nom="info" taille={14} /> Les proportions de votre image diffèrent du format {a.format ?? 'A3'} : des marges blanches apparaîtront à l’impression.
                    {!lectureSeule && etape === 1 && (
                      <button type="button" className="lien-bouton" onClick={() => void recadrerImage()} disabled={!!envoi}>
                        Recadrer au format
                      </button>
                    )}
                  </p>
                )}
                {etape === 2 && (
                  <div className="apercu-fiche-app" aria-label="Aperçu sur le téléphone du visiteur">
                    <small>Sur le téléphone, après l’animation</small>
                    {a.accroche && <span className="eyebrow">{a.accroche}</span>}
                    <strong>{a.nom || 'Nom de l’affiche'}</strong>
                    <p>{a.texte || 'La description de l’affiche apparaîtra ici.'}</p>
                    {lieuPromu && (
                      <span className="pill pill-green">
                        <Icone nom="pin" taille={12} /> {lieuPromu.nomCourt || lieuPromu.nom}
                        {animL ? ` · ${animL.titre}` : ''}
                      </span>
                    )}
                  </div>
                )}
                {etape === 4 && <EchelleFormat format={a.format ?? 'A3'} paysage={paysage} image={image} qr={qr} qrCm={qrCm} />}
              </>
            )}
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
            majFormat(format)
            setInfoImport(`Image recadrée au format ${format}.`)
            void envoyer(fichier, r.nom)
          }}
        />
      )}
      {toast.element}
    </>
  )
}
