// Calculs de position faits dans le téléphone : aucune position n'est envoyée au serveur (BNF-09).

export interface Coordonnees {
  latitude: number
  longitude: number
}

const R = 6_371_000

export function distanceM(a: Coordonnees, b: Coordonnees): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formaterDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

/** Temps de marche à 4,5 km/h, arrondi à la minute. */
export function minutesAPied(m: number): number {
  return Math.max(1, Math.round(m / 75))
}

// Emprise de la carte stylisée du centre de Montbéliard (environ 2 km × 3 km).
export const EMPRISE = {
  ouest: 6.7897,
  est: 6.8163,
  nord: 47.523,
  sud: 47.496,
  largeur: 400,
  hauteur: 600,
}

export function projeter(c: Coordonnees): { x: number; y: number } {
  const x = ((c.longitude - EMPRISE.ouest) / (EMPRISE.est - EMPRISE.ouest)) * EMPRISE.largeur
  const y = ((EMPRISE.nord - c.latitude) / (EMPRISE.nord - EMPRISE.sud)) * EMPRISE.hauteur
  return { x, y }
}

export function deprojeter(x: number, y: number): Coordonnees {
  return {
    longitude: EMPRISE.ouest + (x / EMPRISE.largeur) * (EMPRISE.est - EMPRISE.ouest),
    latitude: EMPRISE.nord - (y / EMPRISE.hauteur) * (EMPRISE.nord - EMPRISE.sud),
  }
}

/** Mètres par unité de carte, pour dessiner un rayon de proximité à l'échelle. */
export const METRES_PAR_UNITE = distanceM(
  { latitude: EMPRISE.nord, longitude: EMPRISE.ouest },
  { latitude: EMPRISE.nord, longitude: EMPRISE.est },
) / EMPRISE.largeur
