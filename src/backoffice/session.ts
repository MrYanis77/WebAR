import { VILLE_ID } from '../commun/donnees'
import { useEtat, type EtatDemo } from '../commun/store'
import type { Session } from '../commun/types'

export const SESSION_AGENT: Session = { role: 'AGENT', nom: 'Claire Martin', email: 'c.martin@montbeliard.fr', structure: 'Ville de Montbéliard' }
export const SESSION_PARTENAIRE: Session = { role: 'PARTENAIRE', nom: 'Hugo Perrin', email: 'hugo@festival-momes.test', structure: 'Festival des Mômes', partenaireId: 'p2' }

/** Session courante (les pages protégées ne sont rendues qu'avec une session). */
export function useSession(): Session {
  return useEtat().session ?? SESSION_AGENT
}

/** Identifiant du propriétaire des contenus créés par la session (Ville ou partenaire). */
export function proprietaireDe(s: Session) {
  return s.role === 'AGENT' ? VILLE_ID : (s.partenaireId ?? '')
}

/** Un agent voit tout ; un partenaire ne voit que ses contenus (BNF-25). */
export function visible(s: Session, proprietaireId: string) {
  return s.role === 'AGENT' || proprietaireId === s.partenaireId
}

export function signalementsDuPartenaire(e: EtatDemo, partenaireId?: string) {
  if (!partenaireId) return []
  const affiches = new Set(e.affiches.filter((a) => a.proprietaireId === partenaireId).map((a) => a.id))
  const anims = new Set(e.animations.filter((a) => a.proprietaireId === partenaireId).map((a) => a.id))
  return e.signalements.filter((s) => (s.afficheId && affiches.has(s.afficheId)) || (s.animationId && anims.has(s.animationId)))
}

/** Le partenaire peut-il importer et créer ? (compte vérifié et charte acceptée, BF-41) */
export function peutCreer(e: EtatDemo, s: Session) {
  if (s.role === 'AGENT') return true
  const p = e.partenaires.find((x) => x.id === s.partenaireId)
  return !!p && p.statut === 'VERIFIE' && !!p.charteAccepteeLe
}
