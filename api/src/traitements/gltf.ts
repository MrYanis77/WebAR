// Outils glTF partagés par le contrôle et l'optimisation des modèles 3D (glTF-Transform).
import { NodeIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

/** Lecteur / écrivain glTF qui comprend toutes les extensions, y compris la géométrie compressée Meshopt. */
export async function ioGltf() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}

/** Triangles et côté maximal des textures d'un modèle. */
export function mesurerDocument(doc: Document) {
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
  return { triangles: Math.round(triangles), textureMax }
}
