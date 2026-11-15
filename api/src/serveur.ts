// Point d'entrée de l'API : démarre Express et relance les contrôles de fichiers interrompus.
import { creerApplication } from './app.js'
import { config } from './config.js'
import { journalApi } from './journaux.js'
import { reprendreControles } from './traitements/controleFichiers.js'

creerApplication().listen(config.port, () => {
  journalApi.info(`API Montbéliard Expériences sur http://localhost:${config.port}/api/v1`)
  void reprendreControles()
})
