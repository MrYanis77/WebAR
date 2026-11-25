// Géométrie d'une affiche imprimée (PDF produit par l'API) et de sa cible de reconnaissance 8th Wall,
// en mètres. Partagée par l'aperçu 3D du back-office et l'application visiteur : le modèle d'une
// animation d'affiche est posé au même endroit, à la même taille, dans les deux.

/** Dimensions des formats d'impression, en millimètres (portrait). */
export const FORMATS_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
}

export interface GeometrieAffiche {
  format: string
  /** Page imprimée, orientée comme l'image (mètres). */
  pageL: number
  pageH: number
  /** Image ajustée dans la page sans déformation et centrée, comme dans genererPDF.ts (mètres). */
  imageL: number
  imageH: number
  /**
   * Hauteur réelle de la cible 8th Wall : recadrage 3:4 centré de l'image mise en portrait (cibleImage.ts).
   * Dans la scène RA elle mesure `scale` unités : c'est l'échelle des tailles et des décalages du modèle.
   */
  hauteurCible: number
}

/**
 * Géométrie d'une affiche au format donné, pour une image de `imageLargeur` × `imageHauteur` pixels
 * (sans image : gabarit qui remplit la page). Format inconnu : A3.
 */
export function geometrieAffiche(format: string | undefined, imageLargeur?: number, imageHauteur?: number): GeometrieAffiche {
  const f = format && FORMATS_MM[format] ? format : 'A3'
  const [l, h] = FORMATS_MM[f]
  const avecImage = !!imageLargeur && !!imageHauteur
  const lPx = avecImage ? imageLargeur : l
  const hPx = avecImage ? imageHauteur : h
  const paysage = lPx > hPx
  const pageL = (paysage ? h : l) / 1000
  const pageH = (paysage ? l : h) / 1000
  const ech = Math.min(pageL / lPx, pageH / hPx)
  const imageL = lPx * ech
  const imageH = hPx * ech
  // La cible est calculée sur l'image tournée en portrait, recadrée au plus grand 3:4 centré.
  const [portraitL, portraitH] = paysage ? [imageH, imageL] : [imageL, imageH]
  const hauteurCible = portraitL / 3 > portraitH / 4 ? portraitH : (portraitL * 4) / 3
  return { format: f, pageL, pageH, imageL, imageH, hauteurCible }
}

/** Taille minimale du QR code imprimé pour qu'il se scanne facilement (cahier des charges). */
export const QR_MIN_CM = 3
/** Bornes de la taille du QR code, en fraction de la largeur de l'image imprimée (schéma de l'API). */
export const QR_TAILLE_MIN = 0.05
export const QR_TAILLE_MAX = 0.4

/**
 * Côté du QR code imprimé, en centimètres. Sa taille est une fraction de la largeur de l'image ajustée
 * dans la page, exactement comme dans le PDF produit par l'API (genererPDF.ts).
 */
export function qrImprimeCm(taille: number, format: string | undefined, imageLargeur?: number, imageHauteur?: number): number {
  return taille * geometrieAffiche(format, imageLargeur, imageHauteur).imageL * 100
}

/** Plus petite taille du QR code (fraction de la largeur de l'image) qui donne au moins 3 cm imprimés. */
export function tailleQrMinimale(format: string | undefined, imageLargeur?: number, imageHauteur?: number): number {
  const largeurCm = geometrieAffiche(format, imageLargeur, imageHauteur).imageL * 100
  // Arrondi au demi-millième supérieur : le curseur ne descend jamais sous 3 cm.
  return Math.min(QR_TAILLE_MAX, Math.max(QR_TAILLE_MIN, Math.ceil((QR_MIN_CM / largeurCm) * 2000) / 2000))
}
