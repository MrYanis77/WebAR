import { animationActive, type EtatDemo } from '../commun/store'
import type { Animation, Lieu } from '../commun/types'

/** Animations d'un lieu : celle en cours (l'événementielle prime sur la permanente) et les prochaines (BF-22). */
export function animationsDuLieu(etat: EtatDemo, lieuId: string, date = new Date()) {
  const duLieu = etat.animations.filter((a) => a.type === 'LIEU' && a.lieuId === lieuId && a.statut === 'PUBLIEE')
  const actives = duLieu.filter((a) => animationActive(a, date)).sort((a, b) => Number(!!b.fin) - Number(!!a.fin))
  const prochaines = duLieu
    .filter((a) => new Date(a.debut) > date)
    .sort((a, b) => a.debut.localeCompare(b.debut))
  return { active: actives[0] as Animation | undefined, actives, prochaines }
}

export function lieuxVisibles(etat: EtatDemo): Lieu[] {
  return etat.lieux.filter((l) => l.actif)
}

const CLE_CONSIGNES = 'montbeliard-consignes-vues'

export function consignesVues(): boolean {
  try {
    return localStorage.getItem(CLE_CONSIGNES) === '1'
  } catch {
    return false
  }
}

export function marquerConsignesVues(valeur = true) {
  try {
    if (valeur) localStorage.setItem(CLE_CONSIGNES, '1')
    else localStorage.removeItem(CLE_CONSIGNES)
  } catch {
    /* ignoré */
  }
}

export function heure(iso: string) {
  return iso.slice(11, 16).replace(':', 'h')
}
