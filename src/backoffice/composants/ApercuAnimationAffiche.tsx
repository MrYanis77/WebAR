import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Icone } from '../../commun/Icone'
import { lireFichierBinaire, lireImageAffiche } from '../../commun/imagesAffiches'
import type { Animation, PlacementQr } from '../../commun/types'
import { arreterSon, couperSon, deverrouillerSon, jouerTheme } from '../../visiteur/services/son'
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

/** Choisit l'objet de démonstration selon l'animation : chaque animation garde une apparence distincte. */
function themeDemo(a?: Animation): 'chateau' | 'stade' | 'mascotte' | 'chalets' | 'jardin' | 'porte' | 'etoiles' {
  if (!a) return 'porte'
  const titre = a.titre.toLowerCase()
  if (a.lieuId === 'stade' || /match|bonal|stade|sport/.test(titre)) return 'stade'
  if (/mascotte|mômes|momes|enfant/.test(titre)) return 'mascotte'
  if (/march|chalet|flocon|noël|noel/.test(titre)) return 'chalets'
  if (a.lieuId === 'parc' || /jardin|parc|nature/.test(titre)) return 'jardin'
  if (a.lieuId === 'chateau' || /château|chateau|duc|lumière|legende|légende/.test(titre)) return 'chateau'
  if (/porte|temps/.test(titre)) return 'porte'
  return 'etoiles'
}

/** Objet de démonstration quand le modèle GLB de l'animation n'a pas été importé dans ce navigateur. */
function objetDemo(a?: Animation): THREE.Group {
  const g = new THREE.Group()
  const mat = (color: number, emissive = 0, intensite = 0.6) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? intensite : 0, roughness: 0.55 })
  const or = mat(0xffe39b, 0xffc94d, 0.7)
  const cyan = mat(0x4fd1c5, 0x4fd1c5)
  const vin = mat(0x7b1e2e)
  const pierre = mat(0xa39684)
  const ardoise = mat(0x55606b)
  const ajouter = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, nom?: string) => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z)
    if (nom) mesh.name = nom
    g.add(mesh)
    return mesh
  }
  switch (themeDemo(a)) {
    case 'chateau':
      for (const x of [-0.13, 0.13]) {
        ajouter(new THREE.CylinderGeometry(0.07, 0.075, 0.26, 24), pierre, x, 0, 0)
        ajouter(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ardoise, x, 0.13, 0)
      }
      ajouter(new THREE.BoxGeometry(0.2, 0.18, 0.1), pierre, 0, -0.04, -0.01)
      ajouter(new THREE.TorusGeometry(0.2, 0.012, 12, 48, Math.PI), or, 0, 0.06, 0.06)
      ajouter(new THREE.OctahedronGeometry(0.04), or, 0, 0.28, 0.04, 'etoile')
      break
    case 'stade': {
      ajouter(new THREE.BoxGeometry(0.42, 0.2, 0.03), mat(0x1e2024), 0, 0.06, 0)
      ajouter(new THREE.BoxGeometry(0.38, 0.03, 0.035), cyan, 0, -0.02, 0.005)
      for (const [x, c] of [[-0.09, 0x7b1e2e], [0.09, 0x2d5fa8]] as const) ajouter(new THREE.BoxGeometry(0.1, 0.1, 0.04), mat(c, c, 0.4), x, 0.08, 0.01)
      ajouter(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), mat(0x888888), -0.16, -0.12, 0)
      ajouter(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), mat(0x888888), 0.16, -0.12, 0)
      ajouter(new THREE.IcosahedronGeometry(0.05, 1), mat(0xffffff), 0, 0.24, 0.05, 'etoile')
      break
    }
    case 'mascotte':
      ajouter(new THREE.SphereGeometry(0.12, 32, 24), mat(0xf2a33a), 0, -0.02, 0)
      ajouter(new THREE.SphereGeometry(0.08, 32, 24), mat(0xf6c06a), 0, 0.15, 0.01)
      for (const x of [-0.03, 0.03]) ajouter(new THREE.SphereGeometry(0.014, 12, 8), mat(0x1e2024), x, 0.17, 0.08)
      for (const x of [-0.06, 0.06]) ajouter(new THREE.ConeGeometry(0.03, 0.07, 12), mat(0xf2a33a), x, 0.24, 0)
      for (const x of [-0.15, 0.15]) ajouter(new THREE.CapsuleGeometry(0.025, 0.08, 4, 8), mat(0xf2a33a), x, 0.02, 0, x < 0 ? 'bras-g' : 'bras-d')
      break
    case 'chalets':
      for (const [x, z] of [[-0.14, 0], [0, 0.04], [0.14, 0]] as const) {
        ajouter(new THREE.BoxGeometry(0.1, 0.08, 0.08), mat(0x8a5a35), x, -0.06, z)
        const toit = ajouter(new THREE.ConeGeometry(0.085, 0.07, 4), mat(0xf4f1ea), x, 0.015, z)
        toit.rotation.y = Math.PI / 4
        ajouter(new THREE.BoxGeometry(0.03, 0.03, 0.01), or, x, -0.06, z + 0.045)
      }
      for (let i = 0; i < 6; i++) ajouter(new THREE.OctahedronGeometry(0.018), mat(0xffffff, 0xffffff, 0.5), -0.18 + i * 0.07, 0.12 + (i % 2) * 0.06, 0.02)
      ajouter(new THREE.OctahedronGeometry(0.035), or, 0, 0.24, 0.03, 'etoile')
      break
    case 'jardin':
      ajouter(new THREE.CylinderGeometry(0.02, 0.025, 0.16, 8), mat(0x6b4a2f), 0, -0.06, 0)
      ajouter(new THREE.IcosahedronGeometry(0.12, 1), mat(0x4f8a4b), 0, 0.09, 0)
      for (let i = 0; i < 5; i++) ajouter(new THREE.SphereGeometry(0.022, 12, 8), mat(0xe86b8a, 0xe86b8a, 0.3), Math.cos(i * 1.3) * 0.14, -0.12, Math.sin(i * 1.3) * 0.06)
      ajouter(new THREE.OctahedronGeometry(0.03), cyan, 0, 0.26, 0.03, 'etoile')
      break
    case 'porte':
      ajouter(new THREE.TorusGeometry(0.2, 0.025, 16, 48, Math.PI), or, 0, 0.1, 0)
      for (const x of [-0.2, 0.2]) ajouter(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 16), or, x, -0.01, 0)
      ajouter(new THREE.BoxGeometry(0.3, 0.2, 0.02), vin, 0, -0.01, -0.01)
      ajouter(new THREE.OctahedronGeometry(0.06), cyan, 0, 0.2, 0.05, 'etoile')
      break
    default:
      for (let i = 0; i < 7; i++) {
        const etoile = ajouter(new THREE.OctahedronGeometry(0.03 + (i % 3) * 0.015), i % 2 ? cyan : or, Math.cos(i) * 0.15, Math.sin(i * 1.7) * 0.12, Math.sin(i) * 0.05)
        if (i === 0) etoile.name = 'etoile'
      }
  }
  return g
}

/**
 * Aperçu de l'expérience visiteur : l'affiche imprimée au mur, sa détection, puis l'animation 3D
 * qui sort de l'affiche (modèle GLB importé, ou objet de démonstration).
 */
export default function ApercuAnimationAffiche({
  afficheId,
  code,
  qr,
  ratio,
  animation,
}: {
  afficheId: string
  code: string
  qr: PlacementQr
  ratio: number
  animation?: Animation
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('detection')
  const [pause, setPause] = useState(false)
  const [son, setSon] = useState(false)
  const [source, setSource] = useState<'glb' | 'demo' | 'chargement'>('chargement')
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
    let objet: THREE.Object3D = objetDemo(animation)
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
    void lireImageAffiche(afficheId)
      .then((b) => (b ? composerAffiche(b, code, qr, 1600) : null))
      .then((toile) => {
        if (!toile || annule) return
        const tex = new THREE.CanvasTexture(toile)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        materielAffiche.map = tex
        materielAffiche.needsUpdate = true
      })
    const modeleId = animation?.modeleId
    void (modeleId ? lireFichierBinaire(modeleId) : Promise.resolve(undefined))
      .then(async (b) => {
        if (!b || annule) {
          setSource('demo')
          return
        }
        const gltf = await new GLTFLoader().parseAsync(await b.arrayBuffer(), '')
        if (annule) return
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
          for (const clip of choisi ? [choisi] : gltf.animations) {
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
      .catch(() => setSource('demo'))

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
        if (p === 'sortie' && sonRef.current) jouerTheme('affiche')
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
  }, [afficheId, code, qr, ratio, animation?.id, animation?.modeleId, animation?.clipIndice, animation?.lecture, animation?.dureeS, cycle])

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
        {source === 'demo' && ' · objet de démonstration (importez le modèle GLB dans « Fichiers 3D & sons » pour le voir ici)'}
        {source === 'glb' && ' · modèle 3D importé'}
        <br />
        Glissez pour changer l’angle de vue.
      </p>
    </div>
  )
}
