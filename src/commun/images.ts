import chateau from '../assets/chateau.jpg'
import stade from '../assets/stade.jpg'

const images: Record<string, string> = { chateau, stade }

/** Résout la clé d'image d'un lieu (les URL Vite ne sont pas stockées dans l'état persistant). */
export function imageLieu(cle?: string): string | undefined {
  return cle ? images[cle] : undefined
}
