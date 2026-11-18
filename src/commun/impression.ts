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
