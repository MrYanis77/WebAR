// Pré-contrôle dans le navigateur de l'éditeur (le serveur refait le contrôle complet avec
// glTF-Validator, glTF-Transform, file-type et ffprobe — section 5.2 du cahier des charges technique).
import type { Object3D } from 'three'

export interface Analyse3D {
  triangles: number
  textureMax: number
  externe: boolean
}

export function compterScene(racine: Object3D): Analyse3D {
  let triangles = 0
  let textureMax = 0
  racine.traverse((o) => {
    const m = o as Object3D & { isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position?: { count: number } } }; material?: unknown }
    if (!m.isMesh || !m.geometry) return
    triangles += (m.geometry.index ? m.geometry.index.count : (m.geometry.attributes.position?.count ?? 0)) / 3
    const materiaux = (Array.isArray(m.material) ? m.material : [m.material]) as { [k: string]: unknown }[]
    for (const mat of materiaux) {
      for (const v of Object.values(mat ?? {})) {
        const img = (v as { isTexture?: boolean; image?: { width?: number; height?: number } } | null)?.isTexture ? (v as { image?: { width?: number; height?: number } }).image : null
        if (img) textureMax = Math.max(textureMax, img.width ?? 0, img.height ?? 0)
      }
    }
  })
  return { triangles: Math.round(triangles), textureMax, externe: false }
}

/** Lit l'en-tête binaire d'un GLB (« glTF », version 2) puis le charge pour compter triangles et textures. */
export async function analyserGLB(fichier: File): Promise<Analyse3D> {
  const tampon = await fichier.arrayBuffer()
  const vue = new DataView(tampon)
  if (tampon.byteLength < 20 || vue.getUint32(0, true) !== 0x46546c67) throw new Error('Signature GLB absente : le fichier n’est pas un modèle glTF binaire.')
  if (vue.getUint32(4, true) !== 2) throw new Error('Version glTF non prise en charge (2.0 attendue).')
  const json = new TextDecoder().decode(new Uint8Array(tampon, 20, vue.getUint32(12, true)))
  const externe = /"uri"\s*:\s*"(?!data:)/.test(json)
  if (externe) throw new Error('Le modèle appelle une ressource externe : seuls les GLB autonomes sont acceptés.')
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new GLTFLoader().parseAsync(tampon, '')
  return compterScene(gltf.scene)
}

export function dureeAudio(fichier: File): Promise<number> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier)
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      ok(a.duration)
    }
    a.onerror = () => {
      URL.revokeObjectURL(url)
      ko(new Error('Son illisible ou format non pris en charge.'))
    }
    a.src = url
  })
}

export function dimensionsImage(fichier: File): Promise<{ l: number; h: number }> {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      ok({ l: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      ko(new Error('Image illisible.'))
    }
    img.src = url
  })
}
