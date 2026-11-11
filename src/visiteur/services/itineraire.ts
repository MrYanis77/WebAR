// Calcul d'un itinéraire piéton entre le visiteur et le monument.
// Serveur OSRM piéton de FOSSGIS (données OpenStreetMap), appelé seulement quand le visiteur
// le demande : sa position n'est alors transmise qu'au calculateur, sans être enregistrée.
import type { Coordonnees } from '../../commun/geo'
import { distanceM } from '../../commun/geo'
import type { Langue } from '../../commun/types'

const SERVEUR = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

export interface Itineraire {
  trace: [number, number][]
  distanceM: number
  dureeS: number
  etapes: string[]
  approximatif: boolean
}

interface EtapeOsrm {
  name: string
  distance: number
  maneuver: { type: string; modifier?: string }
}

const MOTS: Record<Langue, Record<string, string>> = {
  fr: { depart: 'Partez', arrive: 'Arrivée au monument', left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour', tourner: 'Tournez', continuer: 'Continuez', sur: 'sur', rondpoint: 'Prenez le rond-point' },
  en: { depart: 'Head off', arrive: 'Arrive at the monument', left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right', 'sharp left': 'sharp left', 'sharp right': 'sharp right', straight: 'straight on', uturn: 'make a U-turn', tourner: 'Turn', continuer: 'Continue', sur: 'onto', rondpoint: 'Take the roundabout' },
  de: { depart: 'Starten Sie', arrive: 'Ankunft am Denkmal', left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts', 'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus', uturn: 'wenden', tourner: 'Biegen Sie', continuer: 'Gehen Sie weiter', sur: 'auf', rondpoint: 'Nehmen Sie den Kreisverkehr' },
}

function texteEtape(e: EtapeOsrm, l: Langue): string {
  const m = MOTS[l]
  const rue = e.name ? ` ${m.sur} ${e.name}` : ''
  const dist = e.distance >= 15 ? ` (${Math.round(e.distance / 10) * 10} m)` : ''
  switch (e.maneuver.type) {
    case 'depart':
      return `${m.depart}${rue}${dist}`
    case 'arrive':
      return m.arrive
    case 'roundabout':
    case 'rotary':
      return `${m.rondpoint}${rue}${dist}`
    default: {
      const mod = e.maneuver.modifier ?? 'straight'
      const verbe = mod === 'straight' ? m.continuer : m.tourner
      return `${verbe} ${m[mod] ?? m.straight}${rue}${dist}`
    }
  }
}

/** Tracé direct si le calcul échoue (réseau absent, serveur indisponible). */
function volOiseau(depart: Coordonnees, arrivee: Coordonnees): Itineraire {
  const d = distanceM(depart, arrivee)
  return {
    trace: [
      [depart.longitude, depart.latitude],
      [arrivee.longitude, arrivee.latitude],
    ],
    distanceM: d,
    dureeS: (d / 1.25) * 1.3,
    etapes: [],
    approximatif: true,
  }
}

export async function calculerItineraire(depart: Coordonnees, arrivee: Coordonnees, langue: Langue, signal?: AbortSignal): Promise<Itineraire> {
  const url = `${SERVEUR}/${depart.longitude},${depart.latitude};${arrivee.longitude},${arrivee.latitude}?overview=full&geometries=geojson&steps=true`
  try {
    const r = await fetch(url, { signal })
    if (!r.ok) throw new Error(String(r.status))
    const json = (await r.json()) as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: EtapeOsrm[] }[] }[] }
    const route = json.routes?.[0]
    if (json.code !== 'Ok' || !route) throw new Error(json.code)
    return {
      trace: route.geometry.coordinates,
      distanceM: route.distance,
      // Vitesse de marche de 4,5 km/h, plus réaliste que celle du profil OSRM.
      dureeS: Math.max(route.duration, route.distance / 1.25),
      etapes: route.legs.flatMap((leg) => leg.steps).map((s) => texteEtape(s, langue)),
      approximatif: false,
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return volOiseau(depart, arrivee)
  }
}
