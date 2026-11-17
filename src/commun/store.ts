// Données du back-office, chargées depuis l'API (TanStack Query), et actions qui les modifient.
// Chaque action appelle une route de l'API puis invalide le cache : les écrans se mettent à jour
// avec l'état réel de la base. Les règles métier font foi côté serveur ; les fonctions pures
// ci-dessous ne servent qu'à l'affichage.
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { appelApi, clientRequetes, envoyerFichier, oublierJetonCsrf } from './api'
import type {
  ActionDecision,
  Affiche,
  ConditionsPublication,
  Animation,
  Decision,
  EntreeJournal,
  Fichier,
  Lieu,
  MotifSignalement,
  ParametresOptimisation,
  Partenaire,
  PointStat,
  Reglages3D,
  Session,
  Signalement,
  StatutCompte,
  Zone,
} from './types'

export interface EtatDonnees {
  session: Session | null
  lieux: Lieu[]
  animations: Animation[]
  affiches: Affiche[]
  partenaires: Partenaire[]
  zones: Zone[]
  fichiers: Fichier[]
  signalements: Signalement[]
  decisions: Decision[]
  journal: EntreeJournal[]
  /** Premier chargement en cours. */
  chargement: boolean
}

const vide: never[] = []

/** Session courante (null si personne n'est connecté). */
export function useSessionApi() {
  return useQuery({ queryKey: ['session'], queryFn: () => appelApi<{ session: Session | null }>('/auth/session').then((r) => r.session) })
}

/** Toutes les données visibles par l'utilisateur connecté (filtrées par l'API selon son rôle). */
export function useEtat(): EtatDonnees {
  const s = useSessionApi()
  const connecte = !!s.data
  const agent = s.data?.role === 'AGENT'
  const q = <T,>(cle: string, chemin: string, actif = connecte, options: { refetchInterval?: (d: T[] | undefined) => number | false } = {}) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: [cle],
      queryFn: () => appelApi<T[]>(chemin),
      enabled: actif,
      refetchInterval: options.refetchInterval ? (query) => options.refetchInterval!(query.state.data) : undefined,
    })
  const lieux = q<Lieu>('lieux', '/lieux')
  const animations = q<Animation>('animations', '/animations')
  const affiches = q<Affiche>('affiches', '/affiches')
  const partenaires = q<Partenaire>('partenaires', '/partenaires')
  const zones = q<Zone>('zones', '/zones')
  // Les fichiers en cours de contrôle sont relus toutes les 2 s jusqu'au résultat.
  const fichiers = q<Fichier>('fichiers', '/fichiers', connecte, {
    refetchInterval: (d) => (d?.some((f) => f.statutControle === 'EN_COURS' && !f.controleTermine) ? 2000 : false),
  })
  const signalements = q<Signalement>('signalements', '/signalements')
  const decisions = q<Decision>('decisions', '/decisions')
  const journal = q<EntreeJournal>('journal', '/admin/journal', connecte && agent)
  const chargement = s.isLoading || (connecte && (lieux.isLoading || animations.isLoading || affiches.isLoading))
  // Objet stable tant qu'aucune donnée ne change (TanStack Query conserve les mêmes références) :
  // les mémos et effets des pages qui en dépendent ne sont pas relancés à chaque rendu.
  return useMemo(
    () => ({
      session: s.data ?? null,
      lieux: lieux.data ?? vide,
      animations: animations.data ?? vide,
      affiches: affiches.data ?? vide,
      partenaires: partenaires.data ?? vide,
      zones: zones.data ?? vide,
      fichiers: fichiers.data ?? vide,
      signalements: signalements.data ?? vide,
      decisions: decisions.data ?? vide,
      journal: journal.data ?? vide,
      chargement,
    }),
    [s.data, lieux.data, animations.data, affiches.data, partenaires.data, zones.data, fichiers.data, signalements.data, decisions.data, journal.data, chargement],
  )
}

/** Statistiques anonymes sur N jours (BF-28, BF-43). */
export interface Statistiques {
  serie: PointStat[]
  precedent: { scans: number; lancements: number }
  parAffiche: { libelle: string; valeur: number }[]
  parAnimation: { libelle: string; valeur: number }[]
  parLieu: { libelle: string; valeur: number }[]
  parDeclencheur: { libelle: string; valeur: number }[]
}

export function useStatistiques(jours: number) {
  return useQuery({ queryKey: ['statistiques', jours], queryFn: () => appelApi<Statistiques>(`/statistiques?jours=${jours}`) })
}

export function useNotifications(actif: boolean) {
  return useQuery({ queryKey: ['notifications'], queryFn: () => appelApi<EntreeJournal[]>('/notifications'), enabled: actif, refetchInterval: 60_000 })
}

/** Après une modification : relit les données concernées. */
const rafraichir = (...cles: string[]) => Promise.all((cles.length ? cles : ['']).map((c) => clientRequetes.invalidateQueries(c ? { queryKey: [c] } : undefined)))

// ---------------------------------------------------------------- règles d'affichage

export function nomProprietaire(e: Pick<EtatDonnees, 'partenaires'>, id: string) {
  if (id === 'ville') return 'Ville de Montbéliard'
  return e.partenaires.find((p) => p.id === id)?.nomStructure ?? 'Partenaire'
}

export function animationActive(a: Animation, date = new Date()): boolean {
  if (a.statut !== 'PUBLIEE') return false
  if (new Date(a.debut) > date) return false
  if (a.fin && new Date(a.fin) < date) return false
  return true
}

export type { ConditionsPublication }

/** Conditions calculées par l'API (service reglePublication) ; brouillon non enregistré : rien n'est acquis. */
export function reglePublication(_e: unknown, a: Affiche): ConditionsPublication {
  return a.conditions ?? { compteVerifie: false, fichiersConformes: false, charteAcceptee: false, zoneAttribuee: !!a.zoneId }
}

export function publiable(c: ConditionsPublication) {
  return c.compteVerifie && c.fichiersConformes && c.charteAcceptee && c.zoneAttribuee
}

// ---------------------------------------------------------------- session

export async function connexion(email: string, motDePasse: string) {
  // « CODE » : agent, un code à 6 chiffres vient d'être envoyé par mail (double authentification).
  const r = await appelApi<{ etape: 'CODE' | 'CONNECTE' }>('/auth/connexion', { methode: 'POST', corps: { email, motDePasse }, publique: true })
  if (r.etape === 'CONNECTE') await finConnexion()
  return r.etape
}

/** 2e étape de connexion d'un agent : code reçu par mail. */
export async function validerCode(code: string) {
  await appelApi('/auth/code', { methode: 'POST', corps: { code }, publique: true })
  await finConnexion()
}

/** Demande un nouveau code par mail (30 s au moins après le précédent). */
export async function renvoyerCode() {
  await appelApi('/auth/code/renvoi', { methode: 'POST', publique: true })
}

async function finConnexion() {
  oublierJetonCsrf()
  clientRequetes.clear()
  await clientRequetes.fetchQuery({ queryKey: ['session'], queryFn: () => appelApi<{ session: Session | null }>('/auth/session').then((r) => r.session) })
}

export async function deconnexion() {
  await appelApi('/auth/deconnexion', { methode: 'POST', publique: true })
  oublierJetonCsrf()
  clientRequetes.clear()
}

export interface DonneesInscription {
  nomStructure: string
  secteur: string
  adresse: string
  contactNom: string
  contactTelephone?: string
  email: string
  motDePasse: string
  rgpd: true
  altcha: string
}

export function inscrirePartenaire(d: DonneesInscription) {
  return appelApi('/auth/inscription', { methode: 'POST', corps: d, publique: true })
}

// ---------------------------------------------------------------- partenaires et charte

export async function deciderCompte(partenaireId: string, statut: StatutCompte, motif?: string) {
  await appelApi(`/admin/comptes/${partenaireId}`, { methode: 'PATCH', corps: { statut, motif } })
  await rafraichir('partenaires', 'decisions', 'journal')
}

export async function accepterCharte() {
  await appelApi('/charte/acceptation', { methode: 'POST' })
  await rafraichir('partenaires', 'charte', 'affiches')
}

// ---------------------------------------------------------------- fichiers

export async function importerFichier(fichier: File, usage: 'AFFICHE' | 'LIEU', progression?: (p: number) => void) {
  const f = new FormData()
  f.append('usage', usage)
  f.append('fichier', fichier)
  const cree = await envoyerFichier<Fichier>('/fichiers', f, progression)
  await rafraichir('fichiers')
  return cree
}

export async function validerFichier(id: string) {
  await appelApi(`/fichiers/${id}/valider`, { methode: 'PATCH' })
  await rafraichir('fichiers', 'affiches')
}

export async function supprimerFichier(id: string) {
  await appelApi(`/fichiers/${id}`, { methode: 'DELETE' })
  await rafraichir('fichiers')
}

/** Atelier 3D : enregistre les réglages d'un modèle (taille, rotation, ancrage, vitesse, luminosité). */
export async function enregistrerReglages3D(id: string, reglages: Reglages3D) {
  const f = await appelApi<Fichier>(`/fichiers/${id}/reglages`, { methode: 'PATCH', corps: reglages })
  await rafraichir('fichiers', 'animations')
  return f
}

/** Atelier 3D : lance l'optimisation par le serveur puis attend son résultat. */
export async function optimiserModele(id: string, parametres: ParametresOptimisation, delaiMs = 5 * 60_000): Promise<Fichier> {
  await appelApi(`/fichiers/${id}/optimiser`, { methode: 'POST', corps: parametres })
  const debut = Date.now()
  for (;;) {
    const liste = await appelApi<Fichier[]>('/fichiers')
    const f = liste.find((x) => x.id === id)
    if (!f || f.optimisation?.etat !== 'EN_COURS') {
      clientRequetes.setQueryData(['fichiers'], liste)
      await rafraichir('animations')
      if (f?.optimisation?.etat === 'ECHEC') throw new Error(`Optimisation impossible : ${f.optimisation.erreur ?? 'erreur inconnue'}`)
      return f!
    }
    if (Date.now() - debut > delaiMs) throw new Error('L’optimisation prend trop de temps.')
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/** Atelier 3D : retour au modèle importé. */
export async function restaurerModele(id: string) {
  const f = await appelApi<Fichier>(`/fichiers/${id}/restaurer`, { methode: 'POST' })
  await rafraichir('fichiers', 'animations')
  return f
}

/** Attend la fin du contrôle automatique d'un fichier (image d'affiche, visuel de lieu). */
export async function attendreControle(id: string, delaiMs = 60_000): Promise<Fichier> {
  const debut = Date.now()
  for (;;) {
    const liste = await appelApi<Fichier[]>('/fichiers')
    const f = liste.find((x) => x.id === id)
    if (f && (f.controleTermine || f.statutControle !== 'EN_COURS')) {
      clientRequetes.setQueryData(['fichiers'], liste)
      return f
    }
    if (Date.now() - debut > delaiMs) throw new Error('Le contrôle du fichier prend trop de temps.')
    await new Promise((r) => setTimeout(r, 800))
  }
}

// ---------------------------------------------------------------- animations

/** Création (id vide) ou modification d'une animation ; « publier » l'active à ses dates. */
export async function enregistrerAnimation(a: Animation, publier: boolean) {
  const corps = {
    titre: a.titre,
    type: a.type,
    lieuId: a.type === 'LIEU' ? a.lieuId : null,
    modeleId: a.modeleId,
    sonId: a.sonId ?? null,
    clipIndice: a.clipIndice ?? null,
    lecture: a.lecture ?? 'BOUCLE',
    declencheur: a.declencheur,
    dureeS: a.dureeS,
    debut: a.debut,
    fin: a.fin ?? null,
    transcription: a.transcription,
    reglageAffiche: a.type === 'AFFICHE' ? (a.reglageAffiche ?? null) : null,
    placement: a.type === 'LIEU' && a.placement ? { ...a.placement, orientationDeg: a.placement.orientationDeg ?? null } : null,
    publier,
  }
  const r = a.id ? await appelApi<Animation>(`/animations/${a.id}`, { methode: 'PATCH', corps }) : await appelApi<Animation>('/animations', { methode: 'POST', corps })
  await rafraichir('animations', 'journal')
  return r
}

export async function basculerAnimation(id: string) {
  await appelApi(`/animations/${id}/statut`, { methode: 'PATCH' })
  await rafraichir('animations', 'journal')
}

export type ResultatSuppression = { ok: true } | { ok: false; raison: string }

async function supprimer(chemin: string, cles: string[]): Promise<ResultatSuppression> {
  try {
    await appelApi(chemin, { methode: 'DELETE' })
    await rafraichir(...cles, 'journal')
    return { ok: true }
  } catch (e) {
    return { ok: false, raison: (e as Error).message }
  }
}

export const supprimerAnimation = (id: string) => supprimer(`/animations/${id}`, ['animations'])
export const supprimerAffiche = (id: string) => supprimer(`/affiches/${id}`, ['affiches', 'signalements'])
export const supprimerLieu = (id: string) => supprimer(`/lieux/${id}`, ['lieux'])

// ---------------------------------------------------------------- affiches et zones

/** Création (id vide) ou modification d'une affiche ; le QR code est généré par le serveur. */
export async function enregistrerAffiche(a: Affiche) {
  const corps = {
    imageId: a.imageId,
    animationAfficheId: a.animationAfficheId,
    lieuId: a.lieuId,
    animationLieuId: a.animationLieuId || null,
    nom: a.nom,
    accroche: a.accroche,
    texte: a.texte,
    format: a.format ?? 'A3',
    qr: a.qr,
    debut: a.debut,
    fin: a.fin,
  }
  const r = a.id ? await appelApi<Affiche>(`/affiches/${a.id}`, { methode: 'PATCH', corps }) : await appelApi<Affiche>('/affiches', { methode: 'POST', corps })
  await rafraichir('affiches', 'journal')
  return r
}

export async function publierAffiche(id: string) {
  await appelApi(`/affiches/${id}/publier`, { methode: 'POST' })
  await rafraichir('affiches', 'journal')
}

export async function attribuerZone(afficheId: string, zoneId: string | undefined, refusProposition = false) {
  await appelApi(`/affiches/${afficheId}/zone`, { methode: 'PUT', corps: { zoneId: zoneId ?? null, refusProposition } })
  await rafraichir('affiches', 'journal')
}

export async function proposerZone(afficheId: string, zoneId: string) {
  await appelApi(`/affiches/${afficheId}/zone-proposee`, { methode: 'POST', corps: { zoneId } })
  await rafraichir('affiches')
}

/** Télécharge le PDF prêt à imprimer généré par l'API (pdf-lib + qrcode). */
export async function telechargerPdf(a: Affiche) {
  const blob = await appelApi<Blob>(`/affiches/${a.id}/pdf`)
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = `${a.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${a.format ?? 'A3'}.pdf`
  lien.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function enregistrerZone(z: Zone) {
  const corps = { nom: z.nom, adresse: z.adresse, latitude: z.latitude, longitude: z.longitude, format: z.format, regles: z.regles, active: z.active }
  if (z.id) await appelApi(`/zones/${z.id}`, { methode: 'PATCH', corps })
  else await appelApi('/zones', { methode: 'POST', corps })
  await rafraichir('zones')
}

// ---------------------------------------------------------------- lieux et score

export async function enregistrerLieu(l: Lieu) {
  const corps = {
    nom: l.nom,
    nomCourt: l.nomCourt,
    categorie: l.categorie,
    adresse: l.adresse,
    description: l.description,
    latitude: l.latitude,
    longitude: l.longitude,
    rayonM: l.rayonM,
    visuelId: l.visuelId ?? null,
    accesLibre: l.accesLibre,
    actif: l.actif,
  }
  const r = l.id ? await appelApi<Lieu>(`/lieux/${l.id}`, { methode: 'PATCH', corps }) : await appelApi<Lieu>('/lieux', { methode: 'POST', corps })
  await rafraichir('lieux', 'public-lieux', 'journal')
  return r
}


export async function majScore(
  lieuId: string,
  s: { equipeDomicile: string; equipeExterieur: string; scoreDomicile: number; scoreExterieur: number; competition: string; minute: string },
) {
  await appelApi(`/lieux/${lieuId}/score`, { methode: 'PUT', corps: s })
  await rafraichir('lieux', 'public-lieux', 'journal')
}

// ---------------------------------------------------------------- signalements et modération

export async function prendreEnCharge(ids: string[]) {
  await appelApi('/signalements/prise-en-charge', { methode: 'PATCH', corps: { ids } })
  await rafraichir('signalements')
}

/** Décision d'un agent sur une affiche ou une animation (BF-44, BF-49). */
export async function decider(contenuType: 'AFFICHE' | 'ANIMATION', contenuId: string, action: ActionDecision, motif: string, signalementIds: string[] = []) {
  await appelApi(`/admin/contenus/${contenuType.toLowerCase()}/${contenuId}/decision`, { methode: 'POST', corps: { action, motif, signalementIds } })
  await rafraichir('signalements', 'decisions', 'affiches', 'animations', 'journal')
}

export async function repondreDecision(decisionId: string, reponse: string, reexamen: boolean) {
  await appelApi(`/decisions/${decisionId}/reponse`, { methode: 'POST', corps: { reponse, reexamen } })
  await rafraichir('decisions')
}

/** Clôture d'un réexamen : « lever » réactive le contenu ou le compte visé. */
export async function cloreReexamen(decisionId: string, conclusion: string, lever: boolean) {
  await appelApi(`/admin/decisions/${decisionId}/cloture`, { methode: 'POST', corps: { conclusion, lever } })
  await rafraichir('decisions', 'partenaires', 'affiches', 'animations', 'journal')
}

// ---------------------------------------------------------------- API publique (application visiteur)

export interface CibleSignalementApi {
  afficheId?: string
  animationId?: string
}

/** Signalement anonyme avec la preuve ALTCHA du widget (BF-45 à BF-51). */
export async function signaler(cible: CibleSignalementApi, motif: MotifSignalement, commentaire: string, altcha: string) {
  await appelApi('/public/signalements', { methode: 'POST', corps: { ...cible, motif, commentaire, altcha }, publique: true })
}

/** Statistiques anonymes : aucune erreur n'est remontée au visiteur. */
export function compterScan(afficheId: string) {
  void appelApi('/public/statistiques', { methode: 'POST', corps: { type: 'SCAN', afficheId }, publique: true }).catch(() => {})
}

export function compterLancement(animationId: string, declencheur: 'AFFICHE' | 'MONUMENT' | 'MANUEL') {
  void appelApi('/public/statistiques', { methode: 'POST', corps: { type: 'LANCEMENT', animationId, declencheur }, publique: true }).catch(() => {})
}
