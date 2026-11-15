// Service « journaliser » : chaque étape est horodatée avec son auteur (BNF-17).
// Il reçoit le client de transaction pour être écrit dans la même transaction que l'action.
import type { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../db.js'

export interface Auteur {
  compteId: number | null
  libelle: string
}

/** Auteur d'un signalement : aucun identifiant n'est conservé (BF-47). */
export const VISITEUR_ANONYME: Auteur = { compteId: null, libelle: 'Visiteur anonyme' }

export async function journaliser(
  auteur: Auteur,
  action: string,
  objetType: string,
  objetId: number | null,
  objetLibelle: string,
  details?: Record<string, string | number>,
  tx: Prisma.TransactionClient = prisma,
) {
  await tx.journal.create({
    data: {
      auteur_id: auteur.compteId,
      auteur_libelle: auteur.libelle.slice(0, 150),
      action,
      objet_type: objetType,
      objet_id: objetId,
      objet_libelle: objetLibelle.slice(0, 150),
      // Colonne JSON (MariaDB la stocke en texte vérifié par JSON_VALID).
      details: details ? JSON.stringify(details) : null,
    },
  })
}
