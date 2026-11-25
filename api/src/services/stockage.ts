// Service « stockage » : enregistre, renomme et sert les fichiers du dossier uploads/ (BNF-19).
// Le nom est généré par le serveur ; le type réel est lu dans le contenu (file-type), jamais l'extension.
import { fileTypeFromFile } from 'file-type'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'
import { MODELE_3D_MAX_MO } from '../../../src/commun/constantes.js'
import { config } from '../config.js'
import { ErreurApi } from '../erreurs.js'

export const racineUploads = path.resolve(config.dossierUploads)
const temporaire = path.join(racineUploads, 'tmp')
mkdirSync(temporaire, { recursive: true })

/**
 * Chemin sur le disque d'un fichier enregistré en base. La colonne « chemin » est relative au dossier
 * des imports (ex. « 3d/<uuid>.glb ») : le dossier peut changer (DOSSIER_UPLOADS) sans toucher la base.
 */
export const cheminAbsolu = (chemin: string) => {
  const relatif = path.posix.normalize(chemin.replace(/\\/g, '/')).replace(/^(\.\.\/)+/, '')
  return path.join(racineUploads, relatif)
}

/** Réception multipart : taille maximale = celle d'un modèle 3D, contrôlée ensuite par type. */
export const reception = multer({
  dest: temporaire,
  limits: { fileSize: MODELE_3D_MAX_MO * 1_000_000, files: 1 },
})

type TypeFichier = 'MODELE_3D' | 'SON' | 'IMAGE'

/** Formats acceptés (mêmes valeurs que la contrainte ck_fichier_mime de la base). */
const FORMATS: Record<string, { type: TypeFichier; mime: string; dossier: string; maxOctets: number }> = {
  glb: { type: 'MODELE_3D', mime: 'model/gltf-binary', dossier: '3d', maxOctets: MODELE_3D_MAX_MO * 1_000_000 },
  mp3: { type: 'SON', mime: 'audio/mpeg', dossier: 'sons', maxOctets: 2_000_000 },
  m4a: { type: 'SON', mime: 'audio/mp4', dossier: 'sons', maxOctets: 2_000_000 },
  mp4: { type: 'SON', mime: 'audio/mp4', dossier: 'sons', maxOctets: 2_000_000 },
  aac: { type: 'SON', mime: 'audio/aac', dossier: 'sons', maxOctets: 2_000_000 },
  png: { type: 'IMAGE', mime: 'image/png', dossier: 'images', maxOctets: 30_000_000 },
  jpg: { type: 'IMAGE', mime: 'image/jpeg', dossier: 'images', maxOctets: 30_000_000 },
  webp: { type: 'IMAGE', mime: 'image/webp', dossier: 'images', maxOctets: 30_000_000 },
}

/**
 * Vérifie le type réel du fichier reçu puis le range dans uploads/<dossier>/<uuid>.<ext>.
 * Un fichier non conforme est supprimé immédiatement et refusé (400 ou 413).
 */
export async function rangerFichier(fichier: Express.Multer.File) {
  const detecte = await fileTypeFromFile(fichier.path)
  const format = detecte ? FORMATS[detecte.ext] : undefined
  if (!format) {
    await rm(fichier.path, { force: true })
    if (detecte?.ext === 'pdf')
      throw new ErreurApi(400, `« ${fichier.originalname} » refusé : les PDF ne sont pas acceptés. Exportez votre affiche en image (PNG ou JPEG) depuis votre logiciel de mise en page.`)
    throw new ErreurApi(400, `« ${fichier.originalname} » refusé : seuls les formats GLB, MP3, AAC (M4A), PNG, JPEG et WebP sont acceptés.`)
  }
  if (fichier.size > format.maxOctets) {
    await rm(fichier.path, { force: true })
    throw new ErreurApi(413, `« ${fichier.originalname} » refusé : ${(fichier.size / 1_000_000).toFixed(1).replace('.', ',')} Mo, maximum ${format.maxOctets / 1_000_000} Mo pour ce type de fichier.`)
  }
  const nom = `${randomUUID()}.${detecte!.ext === 'mp4' ? 'm4a' : detecte!.ext}`
  const relatif = path.posix.join(format.dossier, nom)
  await mkdir(path.join(racineUploads, format.dossier), { recursive: true })
  await rename(fichier.path, cheminAbsolu(relatif))
  return { ...format, chemin: relatif }
}
