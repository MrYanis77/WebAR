import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { chargerGlb } from '../../visiteur/ra/contenu3d'
import { NOM_ANIMATION_COMBINEE } from '../../commun/constantes'

/** Aperçu 3D avant validation de l'enregistrement (BF-36) : glisser pour tourner, animations jouées en boucle. */
export default function ApercuModele3D({ url }: { url: string }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    setErreur(null)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 100)
    camera.position.set(0, 1.6, 5.2)
    camera.lookAt(0, 0.8, 0)
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5f52, 1.6))
    const soleil = new THREE.DirectionalLight(0xffffff, 1.4)
    soleil.position.set(3, 5, 4)
    scene.add(soleil)
    const sol = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ color: 0xd8d2c6 }))
    sol.rotation.x = -Math.PI / 2
    scene.add(sol)
    const pivot = new THREE.Group()
    scene.add(pivot)

    // Modèle servi par l'API (/uploads/3d/...) : chargé tel qu'il sera diffusé, animations intégrées comprises.
    let actif = true
    chargerGlb(url, renderer)
      .then((gltf) => {
        if (!actif) return
        const boite = new THREE.Box3().setFromObject(gltf.scene)
        const taille = boite.getSize(new THREE.Vector3())
        const ech = 2.4 / Math.max(taille.x, taille.y, taille.z, 0.001)
        gltf.scene.scale.setScalar(ech)
        const centre = boite.getCenter(new THREE.Vector3()).multiplyScalar(ech)
        gltf.scene.position.set(-centre.x, -boite.min.y * ech, -centre.z)
        pivot.add(gltf.scene)
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene)
          gltf.animations.filter((c) => c.name !== NOM_ANIMATION_COMBINEE).forEach((clip) => mixer!.clipAction(clip).play())
        }
      })
      .catch(() => actif && setErreur('Aperçu impossible : modèle illisible.'))

    let mixer: THREE.AnimationMixer | null = null
    const horloge = new THREE.Clock()
    let angle = 0.5
    let glisse: number | null = null
    const bas = (e: PointerEvent) => (glisse = e.clientX)
    const bouge = (e: PointerEvent) => {
      if (glisse === null) return
      angle += (e.clientX - glisse) * 0.01
      glisse = e.clientX
    }
    const haut = () => (glisse = null)
    renderer.domElement.addEventListener('pointerdown', bas)
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', haut)

    let raf = 0
    const boucle = () => {
      if (glisse === null) angle += 0.006
      pivot.rotation.y = angle
      mixer?.update(horloge.getDelta())
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
      actif = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', bas)
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', haut)
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
  }, [url])

  return (
    <div className="apercu-3d" ref={conteneur} aria-label="Aperçu 3D du modèle, glisser pour tourner" role="img">
      {erreur && <p className="erreur-apercu">{erreur}</p>}
      <span className="aide-apercu">Glissez pour faire tourner</span>
    </div>
  )
}
