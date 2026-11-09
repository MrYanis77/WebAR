import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Coordonnees } from '../../commun/geo'

// Position du visiteur : demandée juste avant usage (BF-04), suivie avec watchPosition,
// jamais envoyée ni enregistrée (BNF-09). Une position simulée sert aux démonstrations.

export type EtatPosition = 'inconnu' | 'demande' | 'accorde' | 'refuse' | 'indisponible'

interface ContextePosition {
  etat: EtatPosition
  coords: Coordonnees | null
  simulee: boolean
  demander: () => void
  simuler: (c: Coordonnees | null) => void
}

const Contexte = createContext<ContextePosition | null>(null)

export function FournisseurPosition({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatPosition>('inconnu')
  const [coords, setCoords] = useState<Coordonnees | null>(null)
  const [simulee, setSimulee] = useState<Coordonnees | null>(null)
  const surveillance = useRef<number | null>(null)

  const demarrer = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setEtat('indisponible')
      return
    }
    if (surveillance.current !== null) return
    setEtat('demande')
    surveillance.current = navigator.geolocation.watchPosition(
      (p) => {
        setEtat('accorde')
        setCoords({ latitude: p.coords.latitude, longitude: p.coords.longitude })
      },
      (err) => {
        setEtat(err.code === err.PERMISSION_DENIED ? 'refuse' : 'indisponible')
        if (surveillance.current !== null) navigator.geolocation.clearWatch(surveillance.current)
        surveillance.current = null
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }, [])

  // Si l'autorisation a déjà été donnée lors d'une visite précédente, on reprend le suivi sans redemander.
  useEffect(() => {
    let annule = false
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((r) => {
        if (!annule && r.state === 'granted') demarrer()
        if (!annule && r.state === 'denied') setEtat('refuse')
      })
      .catch(() => {})
    return () => {
      annule = true
    }
  }, [demarrer])

  useEffect(
    () => () => {
      if (surveillance.current !== null) navigator.geolocation.clearWatch(surveillance.current)
    },
    [],
  )

  const valeur = useMemo<ContextePosition>(
    () => ({
      etat: simulee ? 'accorde' : etat,
      coords: simulee ?? coords,
      simulee: !!simulee,
      demander: demarrer,
      simuler: setSimulee,
    }),
    [etat, coords, simulee, demarrer],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

// eslint-disable-next-line react/only-export-components
export function usePosition() {
  const c = useContext(Contexte)
  if (!c) throw new Error('usePosition doit être utilisé dans FournisseurPosition')
  return c
}
