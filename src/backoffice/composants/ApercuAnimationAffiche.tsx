import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { NOM_ANIMATION_COMBINEE } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import type { Animation, PlacementQr } from '../../commun/types'
import { arreterSon, couperSon, deverrouillerSon, jouerFichier } from '../../visiteur/services/son'
import { composerAffiche } from './exportAffiche'

type Phase = 'detection' | 'sortie' | 'animation' | 'retour'

const LIBELLES: Record<Phase, string> = {
  detection: 'Affiche détectée',
  sortie: 'L’animation sort de l’affiche',
  animation: 'Animation en cours',
  retour: 'Fin de l’animation',
}

const facile = (t: number) => 1 - (1 - t) ** 3
const rebond = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2

/** Repère lumineux affiché pendant le chargement du modèle GLB (ou s'il est illisible). */
function objetAttente(): THREE.Group {
  const g = new THREE.Group()
  const or = new THREE.MeshStandardMaterial({ color: 0xffe39b, emissive: 0xffc94d, emissiveIntensity: 0.7, roughness: 0.55 })
  const cyan = new THREE.MeshStandardMaterial({ color: 0x4fd1c5, emissive: 0x4fd1c5, emissiveIntensity: 0.6, roughness: 0.55 })
  for (let i = 0; i < 7; i++) {
    const etoile = new THREE.Mesh(new THREE.OctahedronGeometry(0.03 + (i % 3) * 0.015), i % 2 ? cyan : or)
    etoile.position.set(Math.cos(i) * 0.15, Math.sin(i * 1.7) * 0.12, Math.sin(i) * 0.05)
    if (i === 0) etoile.name = 'etoile'
    g.add(etoile)
  }
  return g
}

/**
 * Aperçu de l'expérience visiteur : l'affiche imprimée au mur, sa détection, puis l'animation 3D
 * qui sort de l'affiche (modèle GLB servi par l'API, avec le clip et le mode de lecture choisis).
 */
export default function ApercuAnimationAffiche({
  image,
  code,
  qr,
  ratio,
  animation,
}: {
  /** URL du fichier de l'affiche (/uploads/images/...). */
  image: string
  code: string
  qr: PlacementQr
  ratio: number
  animation?: Animation
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('detection')
  const [pause, setPause] = useState(false)
  const [son, setSon] = useState(false)
  const [source, setSource] = useState<'glb' | 'indisponible' | 'chargement'>('chargement')
  const [cycle, setCycle] = useState(0)
  const pauseRef = useRef(pause)
  pauseRef.current = pause
  const sonRef = useRef(son)
  sonRef.current = son

  useEffect(() => {
    const el = conteneur.current
    if (!el) return
    let annule = false
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.05, 50)
    camera.position.set(0.25, 0.08, 2.9)
    camera.lookAt(0, 0.05, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x50463c, 1.5))
    const soleil = new THREE.DirectionalLight(0xffffff, 1.6)
    soleil.position.set(1.5, 2, 3)
    scene.add(soleil)

    const racine = new THREE.Group()
    scene.add(racine)
    const l = ratio >= 1 ? 1.1 : 0.85
    const h = l / ratio

    // Mur et affiche.
    const mur = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshStandardMaterial({ color: 0x8c857b, roughness: 1 }))
    mur.position.z = -0.02
    racine.add(mur)
    const materielAffiche = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
    const affiche = new THREE.Mesh(new THREE.PlaneGeometry(l, h), materielAffiche)
    racine.add(affiche)

    // Repères de détection (coins cyan).
    const coins = new THREE.Group()
    const matCoin = new THREE.LineBasicMaterial({ color: 0x4fd1c5, transparent: true })
    const c = 0.12
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const x = (sx * l) / 2 + sx * 0.03
      const y = (sy * h) / 2 + sy * 0.03
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - sx * c, y, 0.01), new THREE.Vector3(x, y, 0.01), new THREE.Vector3(x, y - sy * c, 0.01)])
      coins.add(new THREE.Line(g, matCoin))
    }
    racine.add(coins)

    // Objet qui sort de l'affiche.
    const pivot = new THREE.Group()
    racine.add(pivot)
    let objet: THREE.Object3D = objetAttente()
    let mixer: THREE.AnimationMixer | null = null
    pivot.add(objet)

    // Particules émises par l'affiche.
    const matPart = new THREE.MeshStandardMaterial({ color: 0x4fd1c5, emissive: 0x4fd1c5, emissiveIntensity: 0.8, transparent: true })
    const particules = Array.from({ length: 36 }, (_, i) => {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.012 + (i % 3) * 0.006), matPart)
      p.userData = { depart: Math.random() * 2, vx: (Math.random() - 0.5) * 0.5, vy: 0.15 + Math.random() * 0.35, x0: (Math.random() - 0.5) * l * 0.8, y0: (Math.random() - 0.5) * h * 0.6 }
      racine.add(p)
      return p
    })

    // Chargements : affiche composée avec son QR code, puis modèle 3D de l'animation.
    void fetch(image)
      .then((reponse) => (reponse.ok ? reponse.blob() : null))
      .then((b) => (b ? composerAffiche(b, code, qr, 1600) : null))
      .then((toile) => {
        if (!toile || annule) return
        const tex = new THREE.CanvasTexture(toile)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        materielAffiche.map = tex
        materielAffiche.needsUpdate = true
      })
    const modeleUrl = animation?.modeleUrl
    void (modeleUrl ? new GLTFLoader().loadAsync(modeleUrl) : Promise.resolve(undefined))
      .then((gltf) => {
        if (!gltf || annule) {
          if (!annule) setSource('indisponible')
          return
        }
        const boite = new THREE.Box3().setFromObject(gltf.scene)
        const taille = boite.getSize(new THREE.Vector3())
        const ech = (l * 0.6) / Math.max(taille.x, taille.y, taille.z, 0.001)
        gltf.scene.scale.setScalar(ech)
        const centre = boite.getCenter(new THREE.Vector3()).multiplyScalar(ech)
        gltf.scene.position.set(-centre.x, -centre.y, -centre.z)
        const enveloppe = new THREE.Group()
        enveloppe.add(gltf.scene)
        pivot.remove(objet)
        objet = enveloppe
        pivot.add(objet)
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene)
          const choisi = animation?.clipIndice !== undefined ? gltf.animations[animation.clipIndice] : undefined
          // Sans clip choisi : toutes les animations d'origine (l'animation combinée ferait doublon).
          for (const clip of choisi ? [choisi] : gltf.animations.filter((c) => c.name !== NOM_ANIMATION_COMBINEE)) {
            const action = mixer.clipAction(clip)
            if (animation?.lecture === 'UNE_FOIS') {
              action.setLoop(THREE.LoopOnce, 1)
              action.clampWhenFinished = true
            }
            action.play()
          }
        }
        setSource('glb')
      })
      .catch(() => setSource('indisponible'))

    // Rotation de la vue au glisser.
    let rotY = -0.25
    let rotX = 0.05
    let glisse: { x: number; y: number } | null = null
    const bas = (e: PointerEvent) => (glisse = { x: e.clientX, y: e.clientY })
    const bouge = (e: PointerEvent) => {
      if (!glisse) return
      rotY = Math.max(-0.8, Math.min(0.8, rotY + (e.clientX - glisse.x) * 0.006))
      rotX = Math.max(-0.35, Math.min(0.35, rotX + (e.clientY - glisse.y) * 0.004))
      glisse = { x: e.clientX, y: e.clientY }
    }
    const haut = () => (glisse = null)
    renderer.domElement.addEventListener('pointerdown', bas)
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', haut)

    const duree = Math.min(14, Math.max(8, animation?.dureeS ?? 10))
    const total = duree + 0.8
    let t = 0
    let precedent = performance.now()
    let phaseCourante: Phase | null = null
    const horloge = new THREE.Clock()
    let raf = 0

    const boucle = () => {
      const maintenant = performance.now()
      const dt = Math.min(0.05, (maintenant - precedent) / 1000)
      precedent = maintenant
      if (!pauseRef.current) t = (t + dt) % total
      const delta = horloge.getDelta()
      if (mixer && !pauseRef.current) mixer.update(delta)

      let p: Phase
      let sortie = 0
      if (t < 0.9) {
        p = 'detection'
      } else if (t < 2.4) {
        p = 'sortie'
        sortie = (t - 0.9) / 1.5
      } else if (t < duree - 1) {
        p = 'animation'
        sortie = 1
      } else if (t < duree) {
        p = 'retour'
        sortie = 1 - (t - (duree - 1))
      } else {
        p = 'retour'
        sortie = 0
      }
      if (p !== phaseCourante) {
        phaseCourante = p
        setPhase(p)
        // Son importé avec l'animation (facultatif), comme dans l'application visiteur.
        if (p === 'sortie' && sonRef.current && animation?.sonUrl) jouerFichier(animation.sonUrl, animation.lecture !== 'UNE_FOIS')
        if (p === 'retour') arreterSon()
      }

      matCoin.opacity = p === 'detection' ? Math.min(1, t / 0.4) : Math.max(0, 1 - (t - 0.9) / 0.6)
      const s = p === 'sortie' ? Math.max(0.001, rebond(facile(sortie))) : Math.max(0.001, sortie)
      pivot.scale.setScalar(s)
      pivot.position.set(0, h * 0.02 + (p === 'animation' ? Math.sin(t * 2) * 0.02 : 0), -0.05 + 0.5 * facile(Math.min(1, sortie)))
      pivot.rotation.y = p === 'animation' ? Math.sin(t * 0.9) * 0.6 : 0
      const etoile = objet.getObjectByName('etoile')
      if (etoile) etoile.rotation.y += dt * 3
      const brasG = objet.getObjectByName('bras-g')
      const brasD = objet.getObjectByName('bras-d')
      if (brasG && brasD) {
        brasG.rotation.z = 0.6 + Math.sin(t * 6) * 0.5
        brasD.rotation.z = -0.6 - Math.sin(t * 6) * 0.5
      }

      for (const part of particules) {
        const d = part.userData as { depart: number; vx: number; vy: number; x0: number; y0: number }
        const vie = (t - 0.9 - d.depart + 4) % 2
        const actif = (p === 'sortie' || p === 'animation') && sortie > 0
        part.visible = actif
        if (actif) {
          part.position.set(d.x0 + d.vx * vie, d.y0 + d.vy * vie, 0.02 + vie * 0.35)
          part.rotation.set(vie * 4, vie * 3, 0)
        }
      }
      matPart.opacity = 0.9

      racine.rotation.set(rotX, rotY, 0)
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
      arreterSon()
      renderer.domElement.removeEventListener('pointerdown', bas)
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', haut)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[]
        mats.forEach((x) => {
          ;(x as THREE.MeshStandardMaterial).map?.dispose()
          x.dispose()
        })
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, code, qr, ratio, animation?.id, animation?.modeleUrl, animation?.clipIndice, animation?.lecture, animation?.dureeS, cycle])

  return (
    <div className="apercu-animation-affiche">
      <div className="scene-apercu" ref={conteneur} role="img" aria-label="Aperçu 3D : l’animation sort de l’affiche. Glissez pour changer l’angle de vue." />
      <span className={`phase-apercu ${phase}`}>{LIBELLES[phase]}</span>
      <div className="commandes-apercu">
        <button type="button" onClick={() => setCycle((c) => c + 1)} aria-label="Rejouer">
          <Icone nom="relancer" taille={16} />
        </button>
        <button type="button" onClick={() => setPause(!pause)} aria-label={pause ? 'Reprendre' : 'Pause'}>
          <Icone nom={pause ? 'lecture' : 'pause'} taille={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            deverrouillerSon()
            couperSon(son)
            setSon(!son)
          }}
          aria-label={son ? 'Couper le son' : 'Activer le son'}
          aria-pressed={son}
        >
          <Icone nom={son ? 'son' : 'muet'} taille={16} />
        </button>
      </div>
      <p className="legende-apercu">
        {animation ? <strong>{animation.titre}</strong> : 'Aucune animation associée'}
        {source === 'indisponible' && ' · modèle 3D illisible ou absent'}
        {source === 'glb' && ' · modèle 3D importé'}
        <br />
        Glissez pour changer l’angle de vue.
      </p>
    </div>
  )
}
