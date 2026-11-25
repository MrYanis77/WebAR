import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Coordonnees } from '../../commun/geo'

// Position du visiteur : demandée juste avant usage (BF-04), suivie avec watchPosition,
// jamais envoyée ni enregistrée (BNF-09). Une position simulée sert aux démonstrations.

export type EtatPosition = 'inconnu' | 'demande' | 'accorde' | 'refuse' | 'indisponible'

/** En dessous de cette précision (m), toute nouvelle mesure est acceptée (le visiteur se déplace). */
const PRECISION_SUFFISANTE_M = 25
/** Une mesure moins précise n'est acceptée qu'une fois la bonne mesure plus vieille que ce délai. */
const DUREE_VALIDITE_MS = 20_000

interface ContextePosition {
  etat: EtatPosition
  coords: Coordonnees | null
  /** Précision de la position en mètres (rayon à 68 %), utile au placement GPS en réalité augmentée. */
  precisionM: number | null
  simulee: boolean
  /** Demande la position réelle (et quitte la position simulée de démonstration). */
  demander: () => void
  simuler: (c: Coordonnees | null) => void
}

const Contexte = createContext<ContextePosition | null>(null)

export function FournisseurPosition({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatPosition>('inconnu')
  const [coords, setCoords] = useState<Coordonnees | null>(null)
  const [precisionM, setPrecisionM] = useState<number | null>(null)
  const [simulee, setSimulee] = useState<Coordonnees | null>(null)
  const surveillance = useRef<number | null>(null)
  const dejaLocalise = useRef(false)
  /** Dernière position retenue : sa précision et l'heure de la mesure. */
  const retenue = useRef<{ precision: number; heure: number } | null>(null)

  const arreter = useCallback(() => {
    if (surveillance.current !== null) navigator.geolocation.clearWatch(surveillance.current)
    surveillance.current = null
  }, [])

  /**
   * Une mesure moins précise ne remplace pas une bonne mesure récente : la position rapide (réseau, Wi-Fi,
   * parfois à plusieurs centaines de mètres) arrivait après le GPS et déplaçait le visiteur sur la carte.
   */
  const recevoir = useCallback((p: GeolocationPosition) => {
    const precision = p.coords.accuracy
    const heure = p.timestamp || Date.now()
    const r = retenue.current
    const moinsPrecise = !!r && precision > Math.max(r.precision * 1.5, PRECISION_SUFFISANTE_M)
    if (moinsPrecise && heure - r.heure < DUREE_VALIDITE_MS) return
    retenue.current = { precision, heure }
    dejaLocalise.current = true
    setEtat('accorde')
    setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude })
    setPrecisionM(precision)
  }, [])

  const demarrer = useCallback(() => {
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      // La géolocalisation n'existe qu'en HTTPS (ou sur localhost).
      setEtat('indisponible')
      return
    }
    if (surveillance.current !== null) return
    if (!dejaLocalise.current) setEtat('demande')
    const echec = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setEtat('refuse')
        arreter()
        return
      }
      // Délai dépassé ou signal GPS absent : le suivi continue (le GPS peut revenir), on ne signale
      // l'échec que si aucune position n'a encore été obtenue.
      if (!dejaLocalise.current) setEtat('indisponible')
    }
    // Première position rapide (réseau / Wi-Fi), puis suivi précis par GPS, toujours avec des mesures fraîches.
    navigator.geolocation.getCurrentPosition(recevoir, () => {}, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 8000 })
    surveillance.current = navigator.geolocation.watchPosition(recevoir, echec, { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 })
  }, [recevoir, arreter])

  /** Nouvel essai demandé par le visiteur : on relance le suivi et on quitte la position de démonstration. */
  const demander = useCallback(() => {
    setSimulee(null)
    if (etat === 'refuse' || etat === 'indisponible') arreter()
    demarrer()
  }, [etat, arreter, demarrer])

  // Si l'autorisation a déjà été donnée lors d'une visite précédente, on reprend le suivi sans redemander ;
  // si le visiteur l'accorde ensuite dans les réglages du navigateur, le suivi démarre aussitôt.
  useEffect(() => {
    let annule = false
    let statut: PermissionStatus | null = null
    const appliquer = () => {
      if (annule || !statut) return
      if (statut.state === 'granted') demarrer()
      if (statut.state === 'denied') {
        arreter()
        setEtat('refuse')
      }
    }
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((r) => {
        statut = r
        appliquer()
        r.addEventListener('change', appliquer)
      })
      .catch(() => {})
    return () => {
      annule = true
      statut?.removeEventListener('change', appliquer)
    }
  }, [demarrer, arreter])

  useEffect(() => arreter, [arreter])

  const valeur = useMemo<ContextePosition>(
    () => ({
      etat: simulee ? 'accorde' : etat,
      coords: simulee ?? coords,
      precisionM: simulee ? 5 : precisionM,
      simulee: !!simulee,
      demander,
      simuler: setSimulee,
    }),
    [etat, coords, precisionM, simulee, demander],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

// eslint-disable-next-line react/only-export-components
export function usePosition() {
  const c = useContext(Contexte)
  if (!c) throw new Error('usePosition doit être utilisé dans FournisseurPosition')
  return c
}
