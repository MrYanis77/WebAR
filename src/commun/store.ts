// Store de démonstration partagé par l'application visiteur et le back-office.
// Il joue le rôle de l'API (routes /public et /admin) : une action faite dans le back-office
// (score, suspension, zone…) est visible immédiatement côté visiteur, et inversement pour les signalements.
import { useSyncExternalStore } from 'react'
import {
  VILLE_ID,
  affichesInitiales,
  animationsInitiales,
  decisionsInitiales,
  fichiersInitiaux,
  journalInitial,
  lieuxInitiaux,
  modelesInitiaux,
  partenairesInitiaux,
  signalementsInitiaux,
  zonesInitiales,
} from './donnees'
import { LIMITE_SIGNALEMENTS_PAR_HEURE, VERSION_CHARTE } from './constantes'
import type {
  ActionDecision,
  Affiche,
  Animation,
  Decision,
  EntreeJournal,
  Fichier,
  Lieu,
  ModeleAffiche,
  MotifSignalement,
  Partenaire,
  Session,
  Signalement,
  StatutCompte,
  StatutContenu,
  Zone,
} from './types'

export interface EtatDemo {
  lieux: Lieu[]
  animations: Animation[]
  affiches: Affiche[]
  partenaires: Partenaire[]
  zones: Zone[]
  modeles: ModeleAffiche[]
  fichiers: Fichier[]
  signalements: Signalement[]
  decisions: Decision[]
  journal: EntreeJournal[]
  session: Session | null
  charteVilleAcceptee: boolean
}

const CLE = 'montbeliard-demo-v1'

function etatInitial(): EtatDemo {
  return {
    lieux: lieuxInitiaux,
    animations: animationsInitiales,
    affiches: affichesInitiales,
    partenaires: partenairesInitiaux,
    zones: zonesInitiales,
    modeles: modelesInitiaux,
    fichiers: fichiersInitiaux,
    signalements: signalementsInitiaux,
    decisions: decisionsInitiales,
    journal: journalInitial,
    session: null,
    charteVilleAcceptee: true,
  }
}

function charger(): EtatDemo {
  try {
    const brut = localStorage.getItem(CLE)
    if (brut) return { ...etatInitial(), ...(JSON.parse(brut) as Partial<EtatDemo>) }
  } catch {
    /* stockage indisponible : on repart des données de démonstration */
  }
  return etatInitial()
}

let etat: EtatDemo = charger()
const abonnes = new Set<() => void>()

function sauver() {
  try {
    localStorage.setItem(CLE, JSON.stringify(etat))
  } catch {
    /* navigation privée : l'état reste en mémoire */
  }
}

function ecrire(maj: (e: EtatDemo) => EtatDemo) {
  etat = maj(etat)
  sauver()
  abonnes.forEach((f) => f())
}

function abonner(f: () => void) {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export function useEtat(): EtatDemo {
  return useSyncExternalStore(abonner, () => etat, () => etat)
}

export function lireEtat(): EtatDemo {
  return etat
}

// ---------------------------------------------------------------- utilitaires

export function uid(prefixe: string) {
  return `${prefixe}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Code unique de 128 bits en base64url (22 caractères), comme le QR code d'une affiche. */
export function genererCodeQr(): string {
  const octets = new Uint8Array(16)
  crypto.getRandomValues(octets)
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const maintenant = () => new Date().toISOString().slice(0, 19)

function entree(auteur: string, action: string, objetType: string, objet: string, details?: string): EntreeJournal {
  return { id: uid('j'), date: maintenant(), auteur, action, objetType, objet, details }
}

function auteurCourant(e: EtatDemo) {
  return e.session ? (e.session.role === 'AGENT' ? e.session.nom : e.session.structure) : 'Système'
}

export function nomProprietaire(e: EtatDemo, id: string) {
  if (id === VILLE_ID) return 'Ville de Montbéliard'
  return e.partenaires.find((p) => p.id === id)?.nomStructure ?? 'Partenaire inconnu'
}

// ---------------------------------------------------------------- règles métier

export function animationActive(a: Animation, date = new Date()): boolean {
  if (a.statut !== 'PUBLIEE') return false
  if (new Date(a.debut) > date) return false
  if (a.fin && new Date(a.fin) < date) return false
  return true
}

export interface ConditionsPublication {
  compteVerifie: boolean
  fichiersConformes: boolean
  charteAcceptee: boolean
  zoneAttribuee: boolean
}

/** Seul endroit qui vérifie les 4 conditions de BF-42 (service reglePublication). */
export function reglePublication(e: EtatDemo, a: Affiche): ConditionsPublication {
  const ville = a.proprietaireId === VILLE_ID
  const partenaire = e.partenaires.find((p) => p.id === a.proprietaireId)
  const anim = e.animations.find((x) => x.id === a.animationAfficheId)
  const fichiers = [anim?.modeleId, anim?.sonId].filter(Boolean) as string[]
  return {
    compteVerifie: ville || partenaire?.statut === 'VERIFIE',
    fichiersConformes:
      !!anim && fichiers.every((id) => e.fichiers.find((f) => f.id === id)?.statutControle === 'CONFORME'),
    charteAcceptee: ville ? e.charteVilleAcceptee : !!partenaire?.charteAccepteeLe,
    zoneAttribuee: !!a.zoneId,
  }
}

export function publiable(c: ConditionsPublication) {
  return c.compteVerifie && c.fichiersConformes && c.charteAcceptee && c.zoneAttribuee
}

/** Ce que renverrait GET /public/affiches/:code : l'affiche si elle est diffusable, sinon la raison. */
export function afficheDiffusee(
  e: EtatDemo,
  code: string,
): { affiche: Affiche; raison: null } | { affiche: Affiche | undefined; raison: 'INCONNUE' | 'RETIREE' | 'EXPIREE' } {
  const affiche = e.affiches.find((a) => a.codeQr === code)
  if (!affiche) return { affiche, raison: 'INCONNUE' }
  if (affiche.statut === 'SUSPENDUE' || affiche.statut === 'RETIREE') return { affiche, raison: 'RETIREE' }
  const now = new Date()
  if (new Date(affiche.fin) < now || affiche.statut !== 'PUBLIEE' || !publiable(reglePublication(e, affiche)))
    return { affiche, raison: 'EXPIREE' }
  return { affiche, raison: null }
}

// ---------------------------------------------------------------- actions publiques (visiteur)

const CLE_LIMITE = 'montbeliard-signalements'

export function signaler(cible: { afficheId?: string; animationId?: string }, motif: MotifSignalement, commentaire: string) {
  // Limitation par appareil (BF-51) : seuls des horodatages restent dans l'appareil, rien n'identifie l'auteur.
  let horodatages: number[] = []
  try {
    horodatages = (JSON.parse(localStorage.getItem(CLE_LIMITE) ?? '[]') as number[]).filter(
      (t) => Date.now() - t < 3_600_000,
    )
  } catch {
    horodatages = []
  }
  if (horodatages.length >= LIMITE_SIGNALEMENTS_PAR_HEURE) return { ok: false as const, raison: 'LIMITE' as const }
  try {
    localStorage.setItem(CLE_LIMITE, JSON.stringify([...horodatages, Date.now()]))
  } catch {
    /* ignoré */
  }
  ecrire((e) => {
    const s: Signalement = { id: uid('s'), ...cible, motif, commentaire: commentaire || undefined, statut: 'NOUVEAU', creeLe: maintenant() }
    const nom = cible.afficheId
      ? e.affiches.find((a) => a.id === cible.afficheId)?.nom
      : e.animations.find((a) => a.id === cible.animationId)?.titre
    return {
      ...e,
      signalements: [s, ...e.signalements],
      journal: [entree('Visiteur anonyme', 'SIGNALEMENT', cible.afficheId ? 'Affiche' : 'Animation', nom ?? '—', `Motif : ${motif.toLowerCase()}`), ...e.journal],
    }
  })
  return { ok: true as const }
}

export function compterScan(afficheId: string) {
  ecrire((e) => ({ ...e, affiches: e.affiches.map((a) => (a.id === afficheId ? { ...a, scans: a.scans + 1 } : a)) }))
}

export function compterLancement(animationId: string) {
  ecrire((e) => ({
    ...e,
    animations: e.animations.map((a) => (a.id === animationId ? { ...a, lancements: a.lancements + 1 } : a)),
  }))
}

// ---------------------------------------------------------------- session

export function connexion(session: Session) {
  ecrire((e) => ({ ...e, session, journal: [entree(session.role === 'AGENT' ? session.nom : session.structure, 'CONNEXION', 'Compte', session.email), ...e.journal] }))
}

export function deconnexion() {
  ecrire((e) => ({ ...e, session: null }))
}

export function reinitialiserDemo() {
  const session = etat.session
  ecrire(() => ({ ...etatInitial(), session }))
}

// ---------------------------------------------------------------- partenaires & comptes

export function inscrirePartenaire(p: Omit<Partenaire, 'id' | 'compteId' | 'statut' | 'creeLe'>) {
  const id = uid('p')
  ecrire((e) => ({
    ...e,
    partenaires: [...e.partenaires, { ...p, id, compteId: uid('c'), statut: 'EN_ATTENTE', creeLe: maintenant() }],
    journal: [entree(p.nomStructure, 'INSCRIPTION', 'Compte', p.nomStructure), ...e.journal],
  }))
  return id
}

export function deciderCompte(partenaireId: string, statut: StatutCompte, motif?: string) {
  ecrire((e) => {
    const p = e.partenaires.find((x) => x.id === partenaireId)
    const action = statut === 'VERIFIE' ? (p?.statut === 'SUSPENDU' ? 'REACTIVATION' : 'COMPTE_VERIFIE') : statut === 'REFUSE' ? 'COMPTE_REFUSE' : 'SUSPENSION'
    const decisions =
      statut === 'SUSPENDU' || (statut === 'VERIFIE' && p?.statut === 'SUSPENDU')
        ? [
            {
              id: uid('d'),
              agent: auteurCourant(e),
              signalementIds: [],
              contenuType: 'COMPTE' as const,
              contenuId: partenaireId,
              action: (statut === 'SUSPENDU' ? 'SUSPENDRE' : 'REACTIVER') as ActionDecision,
              motif: motif ?? 'Compte conforme',
              decideLe: maintenant(),
              reexamenDemande: false,
            },
            ...e.decisions,
          ]
        : e.decisions
    return {
      ...e,
      decisions,
      partenaires: e.partenaires.map((x) => (x.id === partenaireId ? { ...x, statut, motifStatut: motif } : x)),
      journal: [entree(auteurCourant(e), action, 'Compte', p?.nomStructure ?? partenaireId, motif), ...e.journal],
    }
  })
}

export function accepterCharte() {
  ecrire((e) => {
    const s = e.session
    if (!s) return e
    if (s.role === 'AGENT') return { ...e, charteVilleAcceptee: true }
    return {
      ...e,
      partenaires: e.partenaires.map((p) => (p.id === s.partenaireId ? { ...p, charteAccepteeLe: maintenant() } : p)),
      journal: [entree(s.structure, 'CHARTE_ACCEPTEE', 'Compte', s.structure, `Version ${VERSION_CHARTE}`), ...e.journal],
    }
  })
}

// ---------------------------------------------------------------- fichiers

export function ajouterFichier(f: Omit<Fichier, 'id' | 'creeLe'>) {
  const id = uid('f')
  ecrire((e) => ({
    ...e,
    fichiers: [{ ...f, id, creeLe: maintenant() }, ...e.fichiers],
    journal: [entree(auteurCourant(e), 'IMPORT_FICHIER', 'Fichier', f.nomOriginal, 'Contrôle automatique lancé'), ...e.journal],
  }))
  return id
}

export function majFichier(id: string, patch: Partial<Fichier>) {
  ecrire((e) => ({ ...e, fichiers: e.fichiers.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
}

// ---------------------------------------------------------------- animations

export function enregistrerAnimation(a: Animation) {
  ecrire((e) => {
    const existe = e.animations.some((x) => x.id === a.id)
    return {
      ...e,
      animations: existe ? e.animations.map((x) => (x.id === a.id ? a : x)) : [a, ...e.animations],
      journal: [entree(auteurCourant(e), existe ? 'MODIFICATION' : 'CREATION', 'Animation', a.titre), ...e.journal],
    }
  })
}

export function basculerAnimation(id: string) {
  ecrire((e) => {
    const a = e.animations.find((x) => x.id === id)
    if (!a || a.statut === 'RETIREE' || a.statut === 'SUSPENDUE') return e
    const statut: StatutContenu = a.statut === 'PUBLIEE' ? 'BROUILLON' : 'PUBLIEE'
    return {
      ...e,
      animations: e.animations.map((x) => (x.id === id ? { ...x, statut, modifieLe: maintenant() } : x)),
      journal: [entree(auteurCourant(e), statut === 'PUBLIEE' ? 'ACTIVATION' : 'DESACTIVATION', 'Animation', a.titre), ...e.journal],
    }
  })
}

// ---------------------------------------------------------------- affiches & zones

export function enregistrerAffiche(a: Affiche) {
  ecrire((e) => {
    const existe = e.affiches.some((x) => x.id === a.id)
    return {
      ...e,
      affiches: existe ? e.affiches.map((x) => (x.id === a.id ? a : x)) : [a, ...e.affiches],
      journal: [entree(auteurCourant(e), existe ? 'MODIFICATION' : 'CREATION', 'Affiche', a.nom), ...e.journal],
    }
  })
}

export function publierAffiche(id: string) {
  ecrire((e) => {
    const a = e.affiches.find((x) => x.id === id)
    if (!a || !publiable(reglePublication(e, a))) return e
    return {
      ...e,
      affiches: e.affiches.map((x) => (x.id === id ? { ...x, statut: 'PUBLIEE', modifieLe: maintenant() } : x)),
      journal: [entree(auteurCourant(e), 'PUBLICATION', 'Affiche', a.nom), ...e.journal],
    }
  })
}

export function attribuerZone(afficheId: string, zoneId: string | undefined, refusProposition = false) {
  ecrire((e) => {
    const a = e.affiches.find((x) => x.id === afficheId)
    const z = e.zones.find((x) => x.id === zoneId)
    return {
      ...e,
      affiches: e.affiches.map((x) =>
        x.id === afficheId ? { ...x, zoneId: refusProposition ? x.zoneId : zoneId, zoneProposeeId: undefined } : x,
      ),
      journal: [
        entree(auteurCourant(e), refusProposition ? 'ZONE_PROPOSEE_REFUSEE' : 'ZONE_ATTRIBUEE', 'Affiche', a?.nom ?? afficheId, z?.nom),
        ...e.journal,
      ],
    }
  })
}

export function proposerZone(afficheId: string, zoneId: string) {
  ecrire((e) => ({
    ...e,
    affiches: e.affiches.map((x) => (x.id === afficheId ? { ...x, zoneProposeeId: zoneId } : x)),
    journal: [entree(auteurCourant(e), 'ZONE_PROPOSEE', 'Affiche', e.affiches.find((x) => x.id === afficheId)?.nom ?? '', e.zones.find((z) => z.id === zoneId)?.nom), ...e.journal],
  }))
}

export function enregistrerZone(z: Zone) {
  ecrire((e) => ({
    ...e,
    zones: e.zones.some((x) => x.id === z.id) ? e.zones.map((x) => (x.id === z.id ? z : x)) : [...e.zones, z],
    journal: [entree(auteurCourant(e), 'ZONE_MAJ', 'Zone', z.nom), ...e.journal],
  }))
}

export function enregistrerModele(m: ModeleAffiche) {
  ecrire((e) => ({
    ...e,
    modeles: e.modeles.some((x) => x.id === m.id) ? e.modeles.map((x) => (x.id === m.id ? m : x)) : [...e.modeles, m],
  }))
}

// ---------------------------------------------------------------- lieux & score

export function enregistrerLieu(l: Lieu) {
  ecrire((e) => {
    const existe = e.lieux.some((x) => x.id === l.id)
    return {
      ...e,
      lieux: existe ? e.lieux.map((x) => (x.id === l.id ? l : x)) : [...e.lieux, l],
      journal: [entree(auteurCourant(e), existe ? 'LIEU_MAJ' : 'LIEU_CREE', 'Lieu', l.nom), ...e.journal],
    }
  })
}

export function majScore(lieuId: string, patch: Pick<Lieu, 'scoreDomicile' | 'scoreExterieur' | 'equipeDomicile' | 'equipeExterieur' | 'competition' | 'minute'>) {
  ecrire((e) => ({
    ...e,
    lieux: e.lieux.map((l) => (l.id === lieuId ? { ...l, ...patch, scoreMajLe: maintenant() } : l)),
    journal: [
      entree(auteurCourant(e), 'SCORE_MAJ', 'Lieu', e.lieux.find((l) => l.id === lieuId)?.nom ?? lieuId, `${patch.equipeDomicile} ${patch.scoreDomicile} – ${patch.scoreExterieur} ${patch.equipeExterieur}`),
      ...e.journal,
    ],
  }))
}

// ---------------------------------------------------------------- signalements & modération

export function prendreEnCharge(ids: string[]) {
  ecrire((e) => ({
    ...e,
    signalements: e.signalements.map((s) => (ids.includes(s.id) && s.statut === 'NOUVEAU' ? { ...s, statut: 'EN_COURS' } : s)),
  }))
}

const statutApres: Record<ActionDecision, StatutContenu | null> = {
  MAINTENIR: null,
  SUSPENDRE: 'SUSPENDUE',
  SUPPRIMER: 'RETIREE',
  REACTIVER: 'PUBLIEE',
}

/** Décision d'un agent sur un contenu (affiche ou animation), avec ou sans signalement (BF-44, BF-49). */
export function decider(
  contenuType: 'AFFICHE' | 'ANIMATION',
  contenuId: string,
  action: ActionDecision,
  motif: string,
  signalementIds: string[] = [],
) {
  ecrire((e) => {
    const nouveau = statutApres[action]
    const nom =
      contenuType === 'AFFICHE'
        ? e.affiches.find((a) => a.id === contenuId)?.nom
        : e.animations.find((a) => a.id === contenuId)?.titre
    const decision: Decision = {
      id: uid('d'),
      agent: auteurCourant(e),
      signalementIds,
      contenuType,
      contenuId,
      action,
      motif,
      decideLe: maintenant(),
      reexamenDemande: false,
    }
    return {
      ...e,
      decisions: [decision, ...e.decisions],
      signalements: e.signalements.map((s) => (signalementIds.includes(s.id) ? { ...s, statut: 'TRAITE' } : s)),
      affiches:
        contenuType === 'AFFICHE' && nouveau
          ? e.affiches.map((a) => (a.id === contenuId ? { ...a, statut: nouveau, modifieLe: maintenant() } : a))
          : e.affiches,
      animations:
        contenuType === 'ANIMATION' && nouveau
          ? e.animations.map((a) => (a.id === contenuId ? { ...a, statut: nouveau, modifieLe: maintenant() } : a))
          : e.animations,
      journal: [
        entree(auteurCourant(e), `DECISION_${action}`, contenuType === 'AFFICHE' ? 'Affiche' : 'Animation', nom ?? contenuId, motif),
        ...e.journal,
      ],
    }
  })
}

export function cloreReexamen(decisionId: string, conclusion: string) {
  ecrire((e) => ({
    ...e,
    decisions: e.decisions.map((d) => (d.id === decisionId ? { ...d, reexamenDemande: false } : d)),
    journal: [entree(auteurCourant(e), 'REEXAMEN_CLOS', 'Décision', decisionId, conclusion), ...e.journal],
  }))
}

export function repondreDecision(decisionId: string, reponse: string, reexamen: boolean) {
  ecrire((e) => ({
    ...e,
    decisions: e.decisions.map((d) => (d.id === decisionId ? { ...d, reponsePartenaire: reponse, reexamenDemande: reexamen } : d)),
    journal: [entree(auteurCourant(e), reexamen ? 'REEXAMEN_DEMANDE' : 'REPONSE_PARTENAIRE', 'Décision', decisionId, reponse.slice(0, 80)), ...e.journal],
  }))
}
