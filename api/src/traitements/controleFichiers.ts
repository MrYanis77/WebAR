// Contrôle automatique des fichiers importés (section 5.2, BF-36, BNF-19), en arrière-plan.
//  - Modèle 3D : glTF-Validator (fichier bien formé, pas de ressource externe) puis glTF-Transform
//    (triangles, textures, animations intégrées enregistrées dans fichier_clip).
//  - Son : ffprobe (format, durée).
//  - Image : sharp (dimensions, réencodage sans métadonnées).
// Un modèle ou un son conforme reste « EN_COURS » jusqu'à la validation de l'éditeur après aperçu ;
// une image conforme est validée directement.
import ffprobe from '@ffprobe-installer/ffprobe'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { execFile } from 'node:child_process'
import { readFile, rename, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { BUDGETS_3D } from '../../../src/commun/constantes.js'
import { prisma } from '../db.js'
import { ajouterTraitement } from '../services/file.js'
import { cheminAbsolu } from '../services/stockage.js'

// gltf-validator est un module CommonJS sans types.
import validateur from 'gltf-validator'
const { validateBytes } = validateur as unknown as {
  validateBytes: (donnees: Uint8Array, options?: Record<string, unknown>) => Promise<{ issues: { numErrors: number; messages: { severity: number; message: string; pointer?: string }[] } }>
}

const executer = promisify(execFile)
const DUREE_SON_MAX_S = 120

async function refuser(id: number, raison: string) {
  await prisma.fichier.update({ where: { id }, data: { statut_controle: 'REFUSE', raison_refus: raison.slice(0, 500), controle_termine_le: new Date() } })
}

async function controlerModele3D(id: number, chemin: string, usage: 'AFFICHE' | 'LIEU') {
  const octets = new Uint8Array(await readFile(cheminAbsolu(chemin)))
  // 1. Validation Khronos : refus d'un fichier mal formé ou qui appelle une ressource externe.
  const rapport = await validateBytes(octets, {
    maxIssues: 20,
    externalResourceFunction: () => Promise.reject(new Error('Ressource externe interdite')),
  })
  if (rapport.issues.numErrors > 0) {
    const premiere = rapport.issues.messages.find((m) => m.severity === 0)
    return refuser(id, `Modèle glTF invalide : ${premiere?.message ?? 'erreurs de structure'}`)
  }
  // 2. Mesures avec glTF-Transform.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.readBinary(octets)
  let triangles = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue // seuls les triangles comptent (mode TRIANGLES)
      const indices = prim.getIndices()
      triangles += (indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)) / 3
    }
  }
  let textureMax = 0
  for (const tex of doc.getRoot().listTextures()) {
    const taille = tex.getSize()
    if (taille) textureMax = Math.max(textureMax, taille[0], taille[1])
  }
  // 3. Animations intégrées : durée = plus grand instant des échantillonneurs.
  const clips = doc
    .getRoot()
    .listAnimations()
    .map((anim, indice) => {
      const duree = Math.max(0, ...anim.listSamplers().map((s) => s.getInput()?.getMax([])[0] ?? 0))
      return { indice, nom: (anim.getName() || `Animation ${indice + 1}`).slice(0, 100), duree, pistes: anim.listChannels().length }
    })
    .filter((c) => c.duree > 0 && c.pistes > 0)

  const budget = BUDGETS_3D[usage]
  const depassements: string[] = []
  if (triangles > budget.triangles) depassements.push(`${Math.round(triangles).toLocaleString('fr-FR')} triangles (max. ${budget.triangles.toLocaleString('fr-FR')})`)
  if (textureMax > budget.texturePx) depassements.push(`texture ${textureMax} px (max. ${budget.texturePx} px)`)

  await prisma.$transaction(async (tx) => {
    await tx.fichier_clip.deleteMany({ where: { fichier_id: id } })
    if (clips.length)
      await tx.fichier_clip.createMany({
        data: clips.map((c) => ({ fichier_id: id, indice: c.indice, nom: c.nom, duree_s: Math.round(c.duree * 1000) / 1000, nb_pistes: c.pistes })),
      })
    await tx.fichier.update({
      where: { id },
      data: {
        nb_triangles: Math.round(triangles),
        texture_max_px: Math.min(textureMax, 65535),
        nb_clips: clips.length,
        controle_termine_le: new Date(),
        ...(depassements.length ? { statut_controle: 'REFUSE', raison_refus: depassements.join(' · ') } : {}),
      },
    })
  })
}

async function controlerSon(id: number, chemin: string) {
  const { stdout } = await executer(ffprobe.path, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', cheminAbsolu(chemin)])
  const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] }
  if (!info.streams?.some((s) => s.codec_type === 'audio')) return refuser(id, 'Aucune piste audio lisible.')
  const duree = Number(info.format?.duration ?? 0)
  if (!duree) return refuser(id, 'Durée du son illisible.')
  if (duree > DUREE_SON_MAX_S) return refuser(id, `Son de ${Math.round(duree)} s (max. ${DUREE_SON_MAX_S} s).`)
  await prisma.fichier.update({ where: { id }, data: { duree_s: Math.round(duree * 100) / 100, controle_termine_le: new Date() } })
}

async function traiterImage(id: number, chemin: string, mime: string) {
  const source = cheminAbsolu(chemin)
  const image = sharp(source, { limitInputPixels: 20000 * 20000 }).rotate()
  const meta = await image.metadata()
  if (!meta.width || !meta.height) return refuser(id, 'Image illisible.')
  // Réencodage sans métadonnées ; le WebP devient PNG pour l'export PDF (pdf-lib).
  const sortiePng = mime === 'image/png' || mime === 'image/webp'
  const tmp = `${source}.tmp`
  await (sortiePng ? image.png({ compressionLevel: 8 }) : image.jpeg({ quality: 90, mozjpeg: true })).toFile(tmp)
  await rename(tmp, source)
  const finale = await sharp(source).metadata()
  await prisma.fichier.update({
    where: { id },
    data: {
      largeur_px: Math.min(finale.width ?? 0, 65535),
      hauteur_px: Math.min(finale.height ?? 0, 65535),
      type_mime: sortiePng ? 'image/png' : 'image/jpeg',
      statut_controle: 'CONFORME',
      controle_termine_le: new Date(),
    },
  })
}

/** Lance le contrôle d'un fichier dans la file de traitements. */
export function planifierControle(id: number) {
  ajouterTraitement(`controle:${id}`, async () => {
    const f = await prisma.fichier.findUnique({ where: { id } })
    if (!f || f.controle_termine_le) return
    try {
      if (f.type === 'MODELE_3D') await controlerModele3D(id, f.chemin, f.usage_fichier ?? 'AFFICHE')
      else if (f.type === 'SON') await controlerSon(id, f.chemin)
      else await traiterImage(id, f.chemin, f.type_mime)
    } catch (e) {
      await refuser(id, `Fichier illisible : ${(e as Error).message}`)
    }
  })
}

/** Relance au démarrage les contrôles interrompus (redémarrage du serveur). */
export async function reprendreControles() {
  const enAttente = await prisma.fichier.findMany({ where: { statut_controle: 'EN_COURS', controle_termine_le: null }, select: { id: true } })
  enAttente.forEach((f) => planifierControle(f.id))
}

/** Supprime un fichier du disque (refus avant enregistrement). */
export async function supprimerDuDisque(chemin: string) {
  await rm(cheminAbsolu(chemin), { force: true })
}
