// Service « fileTraitements » : file en mémoire (p-queue) pour les traitements en arrière-plan
// (contrôle des fichiers, mails). Les contrôles inachevés sont relancés au démarrage (voir reprise).
import PQueue from 'p-queue'
import { journalApi } from '../journaux.js'

const file = new PQueue({ concurrency: 2 })

export function ajouterTraitement(nom: string, tache: () => Promise<void>) {
  void file.add(async () => {
    try {
      await tache()
    } catch (e) {
      journalApi.error({ traitement: nom, erreur: (e as Error).message }, 'Traitement en échec')
    }
  })
}

/** Attend la fin des traitements en cours (tests automatiques). */
export function attendreTraitements() {
  return file.onIdle()
}
