// Optimisation d'un modèle 3D par le serveur (atelier 3D, section 5.2) avec glTF-Transform, en tâche de fond :
//  - nettoyage : données en double, éléments inutilisés, images clés redondantes des animations ;
//  - simplification facultative de la géométrie (Meshopt), pour rentrer dans le budget de triangles ;
//  - textures redimensionnées et réencodées en WebP (sharp) ;
//  - compression de la géométrie (EXT_meshopt_compression), décodée par Three.js dans le téléphone.
// L'original est conservé (chemin_original) et peut être restauré ; le fichier optimisé reçoit un nouveau
// nom (les fichiers de /uploads sont mis en cache longtemps sous leur nom).
import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { randomUUID } from 'node:crypto'
import { rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { BUDGETS_3D } from '../../../src/commun/constantes.js'
import type { MesureModele, Optimisation, ParametresOptimisation } from '../../../src/commun/types.js'
import { versLocal } from '../dates.js'
import { prisma } from '../db.js'
import { ajouterTraitement } from '../services/file.js'
import { cheminAbsolu } from '../services/stockage.js'
import { ioGltf, mesurerDocument } from './gltf.js'

async function mesurerFichier(chemin: string): Promise<MesureModele> {
  const io = await ioGltf()
  const doc = await io.read(cheminAbsolu(chemin))
  const { triangles, textureMax } = mesurerDocument(doc)
  return { octets: (await stat(cheminAbsolu(chemin))).size, triangles, texturePx: textureMax }
}

/** Produit le GLB optimisé à partir de l'original. */
export async function optimiserGlb(source: string, p: ParametresOptimisation): Promise<Uint8Array> {
  const io = await ioGltf()
  const doc = await io.read(source)
  await doc.transform(dedup(), prune({ keepAttributes: true, keepLeaves: false }), resample())
  if (p.simplification > 0) {
    await MeshoptSimplifier.ready
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 1 - p.simplification, error: 0.01 }))
  }
  if (p.textureMaxPx || p.webp)
    await doc.transform(
      textureCompress({
        encoder: sharp,
        ...(p.webp ? { targetFormat: 'webp' as const, quality: 85 } : {}),
        ...(p.textureMaxPx ? { resize: [p.textureMaxPx, p.textureMaxPx] as [number, number] } : {}),
      }),
    )
  if (p.compression) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  return io.writeBinary(doc)
}

const enregistrerEtat = (id: number, o: Optimisation) => prisma.fichier.update({ where: { id }, data: { optimisation: JSON.stringify(o) } })

/**
 * Lance l'optimisation en tâche de fond. Le résultat apparaît dans le back-office (état, mesures avant /
 * après) ; un modèle refusé pour dépassement du budget redevient « à valider » s'il y rentre désormais.
 */
export async function planifierOptimisation(id: number, parametres: ParametresOptimisation) {
  const f = await prisma.fichier.findUniqueOrThrow({ where: { id } })
  const original = f.chemin_original ?? f.chemin
  const avant = await mesurerFichier(original)
  const etat: Optimisation = { etat: 'EN_COURS', parametres, avant, le: versLocal(new Date())! }
  await enregistrerEtat(id, etat)

  ajouterTraitement(`optimisation:${id}`, async () => {
    try {
      const octets = await optimiserGlb(cheminAbsolu(original), parametres)
      const nouveau = path.posix.join('3d', `${randomUUID()}.glb`)
      await writeFile(cheminAbsolu(nouveau), octets)
      const apres = await mesurerFichier(nouveau)
      const actuel = await prisma.fichier.findUniqueOrThrow({ where: { id } })
      const budget = BUDGETS_3D[actuel.usage_fichier ?? 'AFFICHE']
      const depassements: string[] = []
      if (apres.triangles > budget.triangles) depassements.push(`${apres.triangles.toLocaleString('fr-FR')} triangles (max. ${budget.triangles.toLocaleString('fr-FR')})`)
      if (apres.texturePx > budget.texturePx) depassements.push(`texture ${apres.texturePx} px (max. ${budget.texturePx} px)`)
      await prisma.fichier.update({
        where: { id },
        data: {
          chemin: nouveau,
          chemin_original: original,
          taille_octets: octets.byteLength,
          nb_triangles: apres.triangles,
          texture_max_px: Math.min(apres.texturePx, 65535),
          optimisation: JSON.stringify({ ...etat, etat: 'TERMINEE', apres } satisfies Optimisation),
          // Budget respecté : un modèle refusé pour dépassement repasse « à valider » ; sinon il est refusé.
          ...(depassements.length
            ? { statut_controle: 'REFUSE', raison_refus: depassements.join(' · ') }
            : actuel.statut_controle === 'REFUSE'
              ? { statut_controle: 'EN_COURS', raison_refus: null }
              : {}),
        },
      })
      // L'ancien fichier optimisé est remplacé (l'original reste).
      if (actuel.chemin !== original && actuel.chemin !== nouveau) await rm(cheminAbsolu(actuel.chemin), { force: true })
    } catch (e) {
      await enregistrerEtat(id, { ...etat, etat: 'ECHEC', erreur: (e as Error).message.slice(0, 300) })
    }
  })
}

/** Remet le modèle d'origine (le fichier optimisé est supprimé) et ses mesures. */
export async function restaurerOriginal(id: number) {
  const f = await prisma.fichier.findUniqueOrThrow({ where: { id } })
  if (!f.chemin_original) return
  const mesure = await mesurerFichier(f.chemin_original)
  const budget = BUDGETS_3D[f.usage_fichier ?? 'AFFICHE']
  const depasse = mesure.triangles > budget.triangles || mesure.texturePx > budget.texturePx
  await prisma.fichier.update({
    where: { id },
    data: {
      chemin: f.chemin_original,
      chemin_original: null,
      taille_octets: mesure.octets,
      nb_triangles: mesure.triangles,
      texture_max_px: Math.min(mesure.texturePx, 65535),
      optimisation: null,
      ...(depasse ? { statut_controle: 'REFUSE', raison_refus: `Original hors budget : ${mesure.triangles.toLocaleString('fr-FR')} triangles, texture ${mesure.texturePx} px.` } : {}),
    },
  })
  await rm(cheminAbsolu(f.chemin), { force: true })
}
