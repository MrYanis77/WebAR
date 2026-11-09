import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/** Aperçu 3D avant enregistrement (BF-36) : le modèle importé, ou une maquette de démonstration. */
export default function ApercuModele3D({ fichier, theme = 'chateau' }: { fichier?: File; theme?: 'chateau' | 'stade' | 'affiche' }) {
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

    const pierre = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.9 })
    const toit = new THREE.MeshStandardMaterial({ color: 0x5c6670, roughness: 0.6 })
    const vin = new THREE.MeshStandardMaterial({ color: 0x7b1e2e, roughness: 0.5 })
    const cyan = new THREE.MeshStandardMaterial({ color: 0x4fd1c5, emissive: 0x4fd1c5, emissiveIntensity: 0.5 })

    if (fichier) {
      fichier
        .arrayBuffer()
        .then((b) => new GLTFLoader().parseAsync(b, ''))
        .then((gltf) => {
          const boite = new THREE.Box3().setFromObject(gltf.scene)
          const taille = boite.getSize(new THREE.Vector3())
          const ech = 2.4 / Math.max(taille.x, taille.y, taille.z, 0.001)
          gltf.scene.scale.setScalar(ech)
          const centre = boite.getCenter(new THREE.Vector3()).multiplyScalar(ech)
          gltf.scene.position.set(-centre.x, -boite.min.y * ech, -centre.z)
          pivot.add(gltf.scene)
        })
        .catch(() => setErreur('Aperçu impossible : modèle illisible.'))
    } else if (theme === 'stade') {
      const tribune = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 1.4), pierre)
      tribune.position.y = 0.25
      pivot.add(tribune)
      const toitTribune = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.6), toit)
      toitTribune.position.y = 1.3
      pivot.add(toitTribune)
      for (const x of [-1.3, 1.3]) {
        const pilier = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8), toit)
        pilier.position.set(x, 0.9, 0.6)
        pivot.add(pilier)
      }
      const ecran = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.08), vin)
      ecran.position.set(0, 2, 0)
      pivot.add(ecran)
      const bandeau = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.1), cyan)
      bandeau.position.set(0, 1.6, 0.05)
      pivot.add(bandeau)
    } else if (theme === 'affiche') {
      const cadre = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 0.06), vin)
      cadre.position.y = 1.1
      pivot.add(cadre)
      const porte = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 12, 40, Math.PI), cyan)
      porte.position.set(0, 1.1, 0.08)
      pivot.add(porte)
      for (let i = 0; i < 14; i++) {
        const flocon = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), cyan)
        flocon.position.set(Math.sin(i * 2.1) * 1.1, 0.6 + (i % 7) * 0.3, 0.4 + Math.cos(i) * 0.4)
        pivot.add(flocon)
      }
    } else {
      for (const x of [-0.8, 0.8]) {
        const tour = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.9, 32), pierre)
        tour.position.set(x, 0.95, 0)
        pivot.add(tour)
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toit)
        dome.position.set(x, 1.9, 0)
        pivot.add(dome)
      }
      const corps = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.9), pierre)
      corps.position.set(0, 0.7, -0.1)
      pivot.add(corps)
      const arche = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 12, 48, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffe39b, emissive: 0xffd36b, emissiveIntensity: 0.8 }))
      arche.position.set(0, 1.2, 0.5)
      pivot.add(arche)
    }

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
  }, [fichier, theme])

  return (
    <div className="apercu-3d" ref={conteneur} aria-label="Aperçu 3D du modèle, glisser pour tourner" role="img">
      {erreur && <p className="erreur-apercu">{erreur}</p>}
      <span className="aide-apercu">Glissez pour faire tourner</span>
    </div>
  )
}
