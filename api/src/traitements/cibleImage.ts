// Cible de reconnaissance 8th Wall (image target) générée à partir du visuel d'une affiche (section 5.3).
// Même résultat que l'outil officiel @8thwall/image-target-cli (licence MIT), mais sans question à
// poser : recadrage centré au format 3:4 (une image en paysage est tournée d'un quart de tour),
// image de luminance 480 × 640 en niveaux de gris, et description JSON passée telle quelle à
// XR8.XrController.configure({ imageTargetData }) dans le téléphone. Tout est fait avec sharp,
// sur le serveur : aucun service extérieur. Les cibles sont rangées dans uploads/cibles/.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { CibleImage } from '../../../src/commun/types.js'
import { journalApi } from '../journaux.js'
import { urlFichier } from '../services/serialiser.js'
import { cheminAbsolu, racineUploads } from '../services/stockage.js'

/** À augmenter si le format des cibles change : les cibles sont alors régénérées (nouveau nom, nouveau cache). */
const VERSION = 1
/** Taille minimale du recadrage exigée par 8th Wall (constantes de image-target-cli). */
export const CIBLE_LARGEUR_MIN = 480
export const CIBLE_HAUTEUR_MIN = 640

/** Recadrage centré au format 3:4 (portrait) le plus grand possible, comme getDefaultCrop() de l'outil officiel. */
export function recadrageCible(largeur: number, hauteur: number) {
  if (largeur / 3 > hauteur / 4) {
    const l = Math.round((hauteur * 3) / 4)
    return { left: Math.round((largeur - l) / 2), top: 0, width: l, height: hauteur }
  }
  const h = Math.round((largeur * 4) / 3)
  return { left: 0, top: Math.round((hauteur - h) / 2), width: largeur, height: h }
}

async function generer(cheminVisuel: string, nom: string): Promise<CibleImage | null> {
  const dossier = path.join(racineUploads, 'cibles')
  const fichierJson = path.join(dossier, `${nom}.json`)
  try {
    return JSON.parse(await readFile(fichierJson, 'utf8')) as CibleImage
  } catch {
    // Pas encore générée : on la crée.
  }
  // Orientation EXIF appliquée d'abord : la cible doit correspondre à l'affiche imprimée.
  const droite = await sharp(cheminAbsolu(cheminVisuel), { limitInputPixels: 20000 * 20000 }).rotate().toBuffer({ resolveWithObject: true })
  const paysage = droite.info.width > droite.info.height
  const image = paysage ? sharp(await sharp(droite.data).rotate(90).toBuffer()) : sharp(droite.data)
  const [largeur, hauteur] = paysage ? [droite.info.height, droite.info.width] : [droite.info.width, droite.info.height]
  const recadrage = recadrageCible(largeur, hauteur)
  // Visuel trop petit : 8th Wall ne peut pas en tirer une cible fiable.
  if (recadrage.width < CIBLE_LARGEUR_MIN || recadrage.height < CIBLE_HAUTEUR_MIN) return null

  const luminance = `${nom}_luminance.jpg`
  await mkdir(dossier, { recursive: true })
  await image.extract(recadrage).resize({ height: CIBLE_HAUTEUR_MIN }).toColourspace('b-w').jpeg({ quality: 90 }).toFile(path.join(dossier, luminance))
  const cible: CibleImage = {
    name: nom,
    type: 'PLANAR',
    imagePath: urlFichier(`cibles/${luminance}`)!,
    metadata: null,
    properties: { ...recadrage, isRotated: paysage, originalWidth: largeur, originalHeight: hauteur },
  }
  await writeFile(fichierJson, JSON.stringify(cible))
  return cible
}

const enCours = new Map<string, Promise<CibleImage | null>>()

/**
 * Cible 8th Wall d'un visuel (chemin relatif au dossier des imports), générée une seule fois puis relue
 * sur le disque. `nom` identifie la source (ex. « affiche-12 ») ; renvoie null si le visuel ne convient pas.
 */
export function cibleImage(cheminVisuel: string, nom: string): Promise<CibleImage | null> {
  const cle = `${nom}-v${VERSION}`
  let promesse = enCours.get(cle)
  if (!promesse) {
    promesse = generer(cheminVisuel, cle).catch((e: unknown) => {
      journalApi.warn({ err: e, cible: cle }, 'Cible de reconnaissance non générée')
      enCours.delete(cle) // nouvel essai à la prochaine demande
      return null
    })
    enCours.set(cle, promesse)
  }
  return promesse
}
