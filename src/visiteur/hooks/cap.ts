import { useEffect, useRef, useState } from 'react'
import { suivreCap } from '../ra/moteur'

/**
 * Cap de la caméra arrière (0 = nord), lu sur la boussole du téléphone, pour indiquer au visiteur où
 * regarder. Mis à jour au plus 5 fois par seconde et seulement s'il change de plus de 2° (pas de rendu
 * React à chaque mesure). null : pas encore de mesure (ordinateur, boussole absente ou refusée).
 * Fichier séparé de capteurs.ts : le moteur de RA (Three.js) n'est chargé qu'avec la vue RA.
 */
export function useCap(actif: boolean): number | null {
  const [cap, setCap] = useState<number | null>(null)
  const dernier = useRef<{ valeur: number; instant: number } | null>(null)
  useEffect(() => {
    if (!actif) return
    return suivreCap((valeur) => {
      const maintenant = performance.now()
      const d = dernier.current
      if (d && maintenant - d.instant < 200) return
      if (d && Math.abs(((valeur - d.valeur + 540) % 360) - 180) < 2) return
      dernier.current = { valeur, instant: maintenant }
      setCap(valeur)
    })
  }, [actif])
  return cap
}
