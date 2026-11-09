import { useEffect, useRef, useState } from 'react'

/** Teste au démarrage caméra, WebGL et WebAssembly (useCompatibilite). */
export function useCompatibilite() {
  const [resultat] = useState(() => {
    let webgl = false
    try {
      const c = document.createElement('canvas')
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      webgl = false
    }
    const wasm = typeof WebAssembly === 'object'
    const camera = !!navigator.mediaDevices?.getUserMedia
    return { webgl, wasm, camera, compatible: webgl && wasm && camera }
  })
  return resultat
}

/** Suit l'état du réseau (BNF-06). */
export function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setEnLigne(true)
    const off = () => setEnLigne(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return enLigne
}

export type EtatCamera = 'attente' | 'demande' | 'active' | 'refusee' | 'absente'

/** Ouvre la caméra arrière (getUserMedia) au moment de viser, et la libère en quittant. */
export function useCamera(actif: boolean) {
  const [etat, setEtat] = useState<EtatCamera>('attente')
  const [flux, setFlux] = useState<MediaStream | null>(null)

  useEffect(() => {
    if (!actif) return
    let annule = false
    let courant: MediaStream | null = null
    if (!navigator.mediaDevices?.getUserMedia) {
      setEtat('absente')
      return
    }
    setEtat('demande')
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (annule) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        courant = s
        setFlux(s)
        setEtat('active')
      })
      .catch((e: DOMException) => {
        if (annule) return
        setEtat(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'refusee' : 'absente')
      })
    return () => {
      annule = true
      courant?.getTracks().forEach((t) => t.stop())
      setFlux(null)
    }
  }, [actif])

  return { etat, flux }
}

/** Mesure la luminosité moyenne de l'image dans le téléphone (useLuminosite) : rien n'est envoyé. */
export function useLuminosite(video: HTMLVideoElement | null, actif: boolean) {
  const [sombre, setSombre] = useState(false)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!video || !actif) return
    canvas.current ??= document.createElement('canvas')
    const c = canvas.current
    c.width = 32
    c.height = 24
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const id = window.setInterval(() => {
      if (!ctx || video.readyState < 2) return
      ctx.drawImage(video, 0, 0, 32, 24)
      const d = ctx.getImageData(0, 0, 32, 24).data
      let somme = 0
      for (let i = 0; i < d.length; i += 4) somme += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      setSombre(somme / (d.length / 4) < 38)
    }, 2000)
    return () => window.clearInterval(id)
  }, [video, actif])
  return sombre
}
