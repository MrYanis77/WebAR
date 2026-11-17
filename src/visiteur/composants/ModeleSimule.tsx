// Aperçu simulé, sans moteur de réalité augmentée : ordinateur (le SLAM de 8th Wall ne fonctionne que sur
// smartphone), caméra refusée ou démonstration. Le modèle de l'animation est rendu avec Three.js au
// centre de l'écran, par-dessus la webcam ou le visuel du lieu, et tourne lentement.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useLangue } from '../../commun/i18n'
import type { Animation } from '../../commun/types'
import { chargerGlb, eclairer, ModeleAnime } from '../ra/contenu3d'

export default function ModeleSimule({ animation, cycle }: { animation: Animation; cycle: number }) {
  const { t } = useLangue()
  const conteneur = useRef<HTMLDivElement>(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    const el = conteneur.current
    if (!el || !animation.modeleUrl) return
    setErreur(false)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(1, el.clientHeight), 0.05, 100)
    camera.position.set(0, 0.55, 3.2)
    camera.lookAt(0, 0.5, 0)
    const eclairage = eclairer(scene, renderer)
    let modele: ModeleAnime | null = null
    let annule = false

    chargerGlb(animation.modeleUrl, renderer)
      .then((gltf) => {
        if (annule) return
        modele = new ModeleAnime(gltf, animation)
        eclairage.regler(modele.luminosite)
        modele.racine.scale.setScalar(1.3)
        modele.racine.position.y = -0.15
        scene.add(modele.racine)
        modele.lancer()
      })
      .catch(() => !annule && setErreur(true))

    let precedent = performance.now()
    renderer.setAnimationLoop((maintenant) => {
      const dt = Math.min(0.1, (maintenant - precedent) / 1000)
      precedent = maintenant
      if (modele) {
        modele.racine.rotation.y += dt * 0.25
        modele.mettreAJour(dt)
      }
      renderer.render(scene, camera)
    })
    const observateur = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight)
      camera.updateProjectionMatrix()
    })
    observateur.observe(el)

    return () => {
      annule = true
      renderer.setAnimationLoop(null)
      observateur.disconnect()
      modele?.liberer()
      eclairage.liberer()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation.modeleUrl, animation.clipIndice, animation.lecture, animation.reglages3d, cycle])

  return (
    <div className="modele-ra" ref={conteneur} aria-hidden="true">
      {erreur && <span className="erreur-modele-ra">{t('ra.modeleIndisponible')}</span>}
    </div>
  )
}
