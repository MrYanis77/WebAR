// Calcul d'un itinéraire entre le visiteur et le monument (à pied, à vélo ou en voiture).
// Serveurs OSRM de FOSSGIS (données OpenStreetMap), appelés seulement quand le visiteur le demande :
// sa position n'est alors transmise qu'au calculateur, sans être enregistrée.
import type { Coordonnees } from '../../commun/geo'
import { distanceM } from '../../commun/geo'
import type { Langue } from '../../commun/types'

export type ModeTrajet = 'pied' | 'velo' | 'voiture'

const SERVEURS: Record<ModeTrajet, string> = {
  pied: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  velo: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
  voiture: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
}

/** Vitesses moyennes réalistes en ville (m/s) : 4,5 km/h à pied, 15 km/h à vélo. */
const VITESSE_MIN: Partial<Record<ModeTrajet, number>> = { pied: 1.25, velo: 4.2 }
/** Détour moyen d'un trajet réel par rapport au vol d'oiseau. */
const DETOUR = 1.3

export type Manoeuvre = 'depart' | 'arrivee' | 'gauche' | 'droite' | 'tout-droit' | 'demi-tour' | 'rond-point'

export interface EtapeItineraire {
  texte: string
  distanceM: number
  manoeuvre: Manoeuvre
}

export interface Itineraire {
  mode: ModeTrajet
  trace: [number, number][]
  distanceM: number
  dureeS: number
  etapes: EtapeItineraire[]
  approximatif: boolean
}

interface EtapeOsrm {
  name: string
  distance: number
  maneuver: { type: string; modifier?: string }
}

const MOTS: Record<Langue, Record<string, string>> = {
  fr: { depart: 'Partez', arrive: 'Arrivée au monument', left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour', tourner: 'Tournez', continuer: 'Continuez', sur: 'sur', rondpoint: 'Prenez le rond-point', sortie: 'sortie' },
  en: { depart: 'Head off', arrive: 'Arrive at the monument', left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right', 'sharp left': 'sharp left', 'sharp right': 'sharp right', straight: 'straight on', uturn: 'make a U-turn', tourner: 'Turn', continuer: 'Continue', sur: 'onto', rondpoint: 'Take the roundabout', sortie: 'exit' },
  de: { depart: 'Starten Sie', arrive: 'Ankunft am Denkmal', left: 'links', right: 'rechts', 'slight left': 'leicht links', 'slight right': 'leicht rechts', 'sharp left': 'scharf links', 'sharp right': 'scharf rechts', straight: 'geradeaus', uturn: 'wenden', tourner: 'Biegen Sie', continuer: 'Gehen Sie weiter', sur: 'auf', rondpoint: 'Nehmen Sie den Kreisverkehr', sortie: 'Ausfahrt' },
}

function manoeuvre(e: EtapeOsrm): Manoeuvre {
  const { type, modifier = 'straight' } = e.maneuver
  if (type === 'depart') return 'depart'
  if (type === 'arrive') return 'arrivee'
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') return 'rond-point'
  if (modifier === 'uturn') return 'demi-tour'
  if (modifier.includes('left')) return 'gauche'
  if (modifier.includes('right')) return 'droite'
  return 'tout-droit'
}

function texteEtape(e: EtapeOsrm, l: Langue): string {
  const m = MOTS[l]
  const rue = e.name ? ` ${m.sur} ${e.name}` : ''
  switch (e.maneuver.type) {
    case 'depart':
      return `${m.depart}${rue}`
    case 'arrive':
      return m.arrive
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return `${m.rondpoint}${rue}`
    default: {
      const mod = e.maneuver.modifier ?? 'straight'
      const verbe = mod === 'straight' ? m.continuer : m.tourner
      return `${verbe} ${m[mod] ?? m.straight}${rue}`
    }
  }
}

/** Fusionne les étapes « continuez tout droit » consécutives sur la même rue (liste plus lisible). */
function simplifier(etapes: EtapeItineraire[]): EtapeItineraire[] {
  const sortie: EtapeItineraire[] = []
  for (const e of etapes) {
    const prec = sortie[sortie.length - 1]
    if (prec && e.manoeuvre === 'tout-droit' && prec.texte === e.texte) prec.distanceM += e.distanceM
    else sortie.push({ ...e })
  }
  return sortie
}

/** Tracé direct si le calcul échoue (réseau absent, serveur indisponible). */
function volOiseau(mode: ModeTrajet, depart: Coordonnees, arrivee: Coordonnees): Itineraire {
  const d = distanceM(depart, arrivee) * DETOUR
  const vitesse = mode === 'pied' ? 1.25 : mode === 'velo' ? 4.2 : 8.3
  return {
    mode,
    trace: [
      [depart.longitude, depart.latitude],
      [arrivee.longitude, arrivee.latitude],
    ],
    distanceM: d,
    dureeS: d / vitesse,
    etapes: [],
    approximatif: true,
  }
}

export async function calculerItineraire(depart: Coordonnees, arrivee: Coordonnees, langue: Langue, signal?: AbortSignal, mode: ModeTrajet = 'pied'): Promise<Itineraire> {
  const url = `${SERVEURS[mode]}/${depart.longitude},${depart.latitude};${arrivee.longitude},${arrivee.latitude}?overview=full&geometries=geojson&steps=true`
  try {
    const r = await fetch(url, { signal })
    if (!r.ok) throw new Error(String(r.status))
    const json = (await r.json()) as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: EtapeOsrm[] }[] }[] }
    const route = json.routes?.[0]
    if (json.code !== 'Ok' || !route) throw new Error(json.code)
    const min = VITESSE_MIN[mode]
    return {
      mode,
      trace: route.geometry.coordinates,
      distanceM: route.distance,
      dureeS: min ? Math.max(route.duration, route.distance / min) : route.duration,
      etapes: simplifier(route.legs.flatMap((leg) => leg.steps).map((s) => ({ texte: texteEtape(s, langue), distanceM: s.distance, manoeuvre: manoeuvre(s) }))),
      approximatif: false,
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return volOiseau(mode, depart, arrivee)
  }
}

/**
 * Distance restant à parcourir le long du tracé depuis la position actuelle : on repère le point du
 * tracé le plus proche du visiteur, puis on additionne les segments qui suivent.
 */
export function distanceRestante(trace: [number, number][], position: Coordonnees): { restanteM: number; ecartM: number } {
  if (trace.length < 2) return { restanteM: 0, ecartM: 0 }
  const pt = (i: number): Coordonnees => ({ longitude: trace[i][0], latitude: trace[i][1] })
  let indice = 0
  let ecart = Infinity
  for (let i = 0; i < trace.length; i++) {
    const d = distanceM(position, pt(i))
    if (d < ecart) {
      ecart = d
      indice = i
    }
  }
  let restante = ecart
  for (let i = indice; i < trace.length - 1; i++) restante += distanceM(pt(i), pt(i + 1))
  return { restanteM: restante, ecartM: ecart }
}

/** Lien vers l'application de navigation du téléphone (destination seule : la position n'y figure pas). */
export function lienNavigation(arrivee: Coordonnees, mode: ModeTrajet): string {
  const travelmode = mode === 'pied' ? 'walking' : mode === 'velo' ? 'bicycling' : 'driving'
  return `https://www.google.com/maps/dir/?api=1&destination=${arrivee.latitude},${arrivee.longitude}&travelmode=${travelmode}`
}
