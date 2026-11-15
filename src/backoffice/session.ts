// Aides liées à la session du back-office. Les droits sont vérifiés par l'API (réponses 401/403) ;
// ces fonctions ne servent qu'à adapter l'interface au rôle de l'utilisateur.
import { useEtat, type EtatDonnees } from '../commun/store'
import type { Session } from '../commun/types'

/** Identifiant des contenus de la Ville (créés par un agent). */
export const VILLE_ID = 'ville'

/** Session courante (les pages protégées ne sont rendues qu'avec une session). */
export function useSession(): Session {
  const s = useEtat().session
  if (!s) throw new Error('Session absente : page protégée affichée sans connexion.')
  return s
}

/** Identifiant du propriétaire des contenus créés par la session (Ville ou partenaire). */
export function proprietaireDe(s: Session) {
  return s.role === 'AGENT' ? VILLE_ID : (s.partenaireId ?? '')
}

/** Un agent voit tout ; un partenaire ne voit que ses contenus (BNF-25). */
export function visible(s: Session, proprietaireId: string) {
  return s.role === 'AGENT' || proprietaireId === s.partenaireId
}

/** L'API ne renvoie au partenaire que les signalements de ses contenus. */
export function signalementsDuPartenaire(e: EtatDonnees, partenaireId?: string) {
  if (!partenaireId) return []
  const affiches = new Set(e.affiches.filter((a) => a.proprietaireId === partenaireId).map((a) => a.id))
  const anims = new Set(e.animations.filter((a) => a.proprietaireId === partenaireId).map((a) => a.id))
  return e.signalements.filter((s) => (s.afficheId && affiches.has(s.afficheId)) || (s.animationId && anims.has(s.animationId)))
}

/** Le partenaire peut-il importer et créer ? (compte vérifié et charte acceptée, BF-41) */
export function peutCreer(e: EtatDonnees, s: Session) {
  if (s.role === 'AGENT') return true
  const p = e.partenaires.find((x) => x.id === s.partenaireId)
  return !!p && p.statut === 'VERIFIE' && !!p.charteAccepteeLe
}
