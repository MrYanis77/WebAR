// Animation « toutes ensemble » ajoutée au GLB. <model-viewer> (RA du visiteur) ne joue qu'une
// animation glTF à la fois : quand un modèle en contient plusieurs (une par pièce, par exemple),
// on ajoute à la fin du fichier une animation qui réunit toutes leurs pistes. Les animations
// d'origine gardent leur position (indice enregistré dans fichier_clip) ; aucune donnée n'est copiée,
// les échantillonneurs réutilisent les mêmes accesseurs.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readFile, writeFile } from 'node:fs/promises'
import { MODELE_3D_MAX_MO, NOM_ANIMATION_COMBINEE } from '../../../src/commun/constantes.js'

/** Extensions de compression : réécrire le fichier demanderait leurs encodeurs, on n'y touche pas. */
const COMPRESSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']

/**
 * Ajoute l'animation combinée si le modèle a au moins 2 animations non vides.
 * Renvoie la nouvelle taille du fichier, ou null s'il n'a pas été modifié.
 */
export async function ajouterAnimationCombinee(chemin: string): Promise<number | null> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.readBinary(new Uint8Array(await readFile(chemin)))
  const racine = doc.getRoot()
  if (racine.listExtensionsUsed().some((e) => COMPRESSIONS.includes(e.extensionName))) return null
  const animations = racine.listAnimations()
  if (animations.some((a) => a.getName() === NOM_ANIMATION_COMBINEE)) return null
  const nonVides = animations.filter((a) => a.listChannels().length > 0 && a.listSamplers().some((s) => (s.getInput()?.getMax([])[0] ?? 0) > 0))
  if (nonVides.length < 2) return null

  const combinee = doc.createAnimation(NOM_ANIMATION_COMBINEE)
  for (const anim of nonVides) {
    for (const canal of anim.listChannels()) {
      const source = canal.getSampler()
      const cible = canal.getTargetNode()
      const propriete = canal.getTargetPath()
      if (!source || !cible || !propriete) continue
      const echantillon = doc
        .createAnimationSampler()
        .setInput(source.getInput())
        .setOutput(source.getOutput())
        .setInterpolation(source.getInterpolation())
      combinee.addSampler(echantillon)
      combinee.addChannel(doc.createAnimationChannel().setTargetNode(cible).setTargetPath(propriete).setSampler(echantillon))
    }
  }
  const octets = await io.writeBinary(doc)
  // Le fichier ne doit pas dépasser la taille maximale autorisée par la base (ck_fichier_taille).
  if (octets.byteLength > MODELE_3D_MAX_MO * 1_000_000) return null
  await writeFile(chemin, octets)
  return octets.byteLength
}
