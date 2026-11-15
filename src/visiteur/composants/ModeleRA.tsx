// Rendu Three.js du modèle 3D de l'animation, superposé au flux de la caméra (fond transparent).
// Le modèle GLB est servi par l'API ; le clip choisi par l'éditeur est joué en boucle ou une fois.
// La reconnaissance (MindAR pour l'affiche, LocAR pour le monument) placera ce groupe sur la cible ;
// en attendant, il est centré à l'écran et apparaît à la détection.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Animation } from '../../commun/types'

export default function ModeleRA({ animation, actif, cycle }: { animation: Animation; actif: boolean; cycle: number }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    const el = conteneur.current
    if (!el || !actif || !animation.modeleUrl) return
    setErreur(false)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(1, el.clientHeight), 0.05, 100)
    camera.position.set(0, 0.4, 4)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.8))
    const soleil = new THREE.DirectionalLight(0xffffff, 1.6)
    soleil.position.set(2, 4, 3)
    scene.add(soleil)
    const pivot = new THREE.Group()
    scene.add(pivot)

    let mixer: THREE.AnimationMixer | null = null
    let annule = false
    const horloge = new THREE.Clock()
    let apparition = 0

    new GLTFLoader()
      .loadAsync(animation.modeleUrl)
      .then((gltf) => {
        if (annule) return
        // Mise à l'échelle : le modèle tient dans un cube de 1,4 unité, posé au centre.
        const boite = new THREE.Box3().setFromObject(gltf.scene)
        const taille = boite.getSize(new THREE.Vector3())
        const ech = 1.4 / Math.max(taille.x, taille.y, taille.z, 0.001)
        gltf.scene.scale.setScalar(ech)
        const centre = boite.getCenter(new THREE.Vector3()).multiplyScalar(ech)
        gltf.scene.position.set(-centre.x, -centre.y, -centre.z)
        pivot.add(gltf.scene)
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene)
          const choisi = animation.clipIndice !== undefined ? gltf.animations[animation.clipIndice] : undefined
          for (const clip of choisi ? [choisi] : gltf.animations) {
            const action = mixer.clipAction(clip)
            if (animation.lecture === 'UNE_FOIS') {
              action.setLoop(THREE.LoopOnce, 1)
              action.clampWhenFinished = true
            }
            action.play()
          }
        }
      })
      .catch(() => !annule && setErreur(true))

    let raf = 0
    const boucle = () => {
      const dt = horloge.getDelta()
      // Sortie de l'animation : le modèle grandit en 0,8 s puis tourne lentement.
      apparition = Math.min(1, apparition + dt / 0.8)
      const e = 1 - (1 - apparition) ** 3
      pivot.scale.setScalar(Math.max(0.001, e))
      pivot.rotation.y += dt * 0.25
      mixer?.update(dt)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(boucle)
    }
    boucle()
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight)
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    return () => {
      annule = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.geometry.dispose()
          ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose())
        }
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [animation.modeleUrl, animation.clipIndice, animation.lecture, actif, cycle])

  return (
    <div className="modele-ra" ref={conteneur} aria-hidden="true">
      {erreur && <span className="erreur-modele-ra">Modèle 3D indisponible</span>}
    </div>
  )
}
