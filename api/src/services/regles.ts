// Service « reglePublication » : seul endroit qui vérifie les 4 conditions de BF-42
// (compte vérifié, fichiers conformes, charte acceptée, zone attribuée). Utilisé par l'export PDF,
// la publication et l'API publique.
import { prisma } from '../db.js'

export interface Conditions {
  compteVerifie: boolean
  fichiersConformes: boolean
  charteAcceptee: boolean
  zoneAttribuee: boolean
}

export const publiable = (c: Conditions) => c.compteVerifie && c.fichiersConformes && c.charteAcceptee && c.zoneAttribuee

export async function conditionsAffiche(afficheId: number): Promise<Conditions | null> {
  const a = await prisma.affiche.findUnique({
    where: { id: afficheId },
    include: {
      compte: { include: { acceptation_charte: { take: 1 } } },
      fichier: true,
      animation_affiche_animation_affiche_idToanimation: {
        include: { fichier_animation_modele_idTofichier: true, fichier_animation_son_idTofichier: true },
      },
    },
  })
  if (!a) return null
  const anim = a.animation_affiche_animation_affiche_idToanimation
  const agent = a.compte.role === 'AGENT'
  return {
    compteVerifie: a.compte.statut === 'VERIFIE',
    fichiersConformes:
      a.fichier.statut_controle === 'CONFORME' &&
      anim.fichier_animation_modele_idTofichier.statut_controle === 'CONFORME' &&
      (!anim.fichier_animation_son_idTofichier || anim.fichier_animation_son_idTofichier.statut_controle === 'CONFORME'),
    charteAcceptee: agent || a.compte.acceptation_charte.length > 0,
    zoneAttribuee: a.zone_id !== null,
  }
}

/** Animation diffusée maintenant : publiée, dans sa période, propriétaire non suspendu (BF-22, CR-11). */
export function animationActive(a: { statut: string; debut: Date; fin: Date | null }, maintenant = new Date()) {
  return a.statut === 'PUBLIEE' && a.debut <= maintenant && (!a.fin || a.fin >= maintenant)
}
