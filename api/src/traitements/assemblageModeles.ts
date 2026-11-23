// Assemblage de plusieurs modèles 3D en un seul GLB (studio d'assemblage du back-office), avec
// glTF-Transform : chaque modèle est copié dans un nouveau document, sous un nœud qui porte sa place
// dans la scène (matrice calculée par le studio : position, rotation, taille et réglages de l'atelier).
// Ses animations intégrées sont conservées et jouent ensemble. Le résultat est un modèle comme un autre :
// il passe ensuite par le contrôle automatique (validation, triangles, animations).
import { Document, type mat4, type Scene } from '@gltf-transform/core'
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions'
import { NOM_ANIMATION_COMBINEE } from '../../../src/commun/constantes.js'
import { ioGltf } from './gltf.js'

export interface ElementAssemblage {
  /** Chemin absolu du GLB source. */
  source: string
  /** Nom du modèle, repris pour le nœud et les animations. */
  nom: string
  /** Matrice 4 × 4 (ordre colonne, comme glTF et Three.js) de la scène du modèle dans l'assemblage. */
  matrice: number[]
}

export async function assemblerGlb(elements: ElementAssemblage[]): Promise<Uint8Array> {
  const io = await ioGltf()
  const cible = new Document()
  const scene = cible.createScene('Assemblage')
  cible.getRoot().setDefaultScene(scene)

  for (const e of elements) {
    const source = await io.read(e.source)
    const racine = source.getRoot()
    // L'animation « toutes ensemble » ajoutée au contrôle est recalculée pour l'assemblage.
    for (const a of racine.listAnimations()) {
      if (a.getName() === NOM_ANIMATION_COMBINEE) a.dispose()
      else a.setName(`${e.nom} · ${a.getName() || 'animation'}`)
    }
    const sceneSource = racine.getDefaultScene() ?? racine.listScenes()[0]
    if (!sceneSource) continue
    const copies = mergeDocuments(cible, source)
    const sceneCopiee = copies.get(sceneSource) as Scene
    const enveloppe = cible.createNode(e.nom).setMatrix(e.matrice as unknown as mat4)
    for (const enfant of sceneCopiee.listChildren()) {
      sceneCopiee.removeChild(enfant)
      enveloppe.addChild(enfant)
    }
    scene.addChild(enveloppe)
    sceneCopiee.dispose()
  }

  // Un seul tampon binaire (GLB), sans ressources inutilisées ni doublons.
  await cible.transform(unpartition(), prune({ keepAttributes: true, keepLeaves: false }), dedup())
  return io.writeBinary(cible)
}
