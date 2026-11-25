import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import { clientRequetes } from './commun/api'
import { FournisseurLangue } from './commun/i18n'
import { Icone } from './commun/Icone'
import Visiteur from './visiteur/Visiteur'

// Le back-office est chargé à part : il n'alourdit pas l'application visiteur (code initial ≤ 300 Ko).
const BackOffice = lazy(() => import('./backoffice/BackOffice'))

const CLE_POSITION = 'mindi-bascule-position'
type Position = { x: number; y: number }

/** Garde la bascule entièrement visible dans la fenêtre. */
function borner(p: Position, el: HTMLElement | null): Position {
  const l = el?.offsetWidth ?? 0
  const h = el?.offsetHeight ?? 0
  return { x: Math.min(Math.max(8, p.x), window.innerWidth - l - 8), y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8) }
}

function lirePosition(): Position | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_POSITION) ?? 'null') as Position | null
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
  } catch {
    return null
  }
}

/**
 * Bascule « Application visiteur / Back-office » reprise de la maquette (écrans larges uniquement).
 * Elle se déplace à la main par sa poignée (elle pouvait masquer des boutons) ; sa position reste
 * mémorisée sur l'appareil. Double-clic sur la poignée : retour en bas à droite.
 */
function BasculePrototype() {
  const { pathname } = useLocation()
  const back = pathname.startsWith('/backoffice')
  const nav = useRef<HTMLElement>(null)
  const [position, setPosition] = useState<Position | null>(lirePosition)
  const glisse = useRef<{ dx: number; dy: number } | null>(null)

  // La fenêtre change de taille : la bascule reste visible.
  useEffect(() => {
    if (!position) return
    const recaler = () => setPosition((p) => (p ? borner(p, nav.current) : p))
    recaler()
    window.addEventListener('resize', recaler)
    return () => window.removeEventListener('resize', recaler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position === null])

  const memoriser = (p: Position | null) => {
    try {
      if (p) localStorage.setItem(CLE_POSITION, JSON.stringify(p))
      else localStorage.removeItem(CLE_POSITION)
    } catch {
      /* stockage indisponible : la position n'est simplement pas gardée */
    }
  }

  const poignee = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      const r = nav.current?.getBoundingClientRect()
      if (!r) return
      glisse.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const g = glisse.current
      if (g) setPosition(borner({ x: e.clientX - g.dx, y: e.clientY - g.dy }, nav.current))
    },
    onPointerUp: () => {
      if (!glisse.current) return
      glisse.current = null
      setPosition((p) => {
        memoriser(p)
        return p
      })
    },
    onDoubleClick: () => {
      setPosition(null)
      memoriser(null)
    },
    // Clavier : flèches pour déplacer (Maj = plus vite), Échap pour revenir à la place d'origine.
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const pas = e.shiftKey ? 40 : 10
      const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key]
      if (e.key === 'Escape') return poignee.onDoubleClick()
      if (!d) return
      e.preventDefault()
      const r = nav.current!.getBoundingClientRect()
      const p = borner({ x: r.left + d[0], y: r.top + d[1] }, nav.current)
      setPosition(p)
      memoriser(p)
    },
  }

  // Dans le back-office, la bascule flottante recouvrait les boutons d'action (« Continuer », « Enregistrer »,
  // en bas à droite) : le menu latéral propose « Voir l'application visiteur » à la place. Elle reste sur
  // les pages de connexion et d'inscription, qui n'ont pas de menu.
  if (back && !/^\/backoffice\/(connexion|inscription)/.test(pathname)) return null

  return (
    <nav
      ref={nav}
      className={`bascule-prototype ${position ? 'deplacee' : ''}`}
      aria-label="Choisir l’application"
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      <button type="button" className="poignee-bascule" aria-label="Déplacer ce sélecteur (glisser, ou flèches du clavier ; double-clic pour le remettre en place)" title="Glisser pour déplacer · double-clic : remettre en place" {...poignee}>
        <Icone nom="deplacer" taille={15} />
      </button>
      <Link to="/" className={back ? '' : 'active'} title="Application visiteur">
        <Icone nom="appareil" taille={17} />
        <span>Application visiteur</span>
      </Link>
      <Link to="/backoffice" className={back ? 'active' : ''} title="Back-office">
        <Icone nom="grille" taille={17} />
        <span>Back-office</span>
      </Link>
    </nav>
  )
}

export default function App() {
  return (
    // Cache des requêtes vers l'API (TanStack Query) partagé par les deux applications.
    <QueryClientProvider client={clientRequetes}>
    <BrowserRouter>
      <FournisseurLangue>
        <BasculePrototype />
        <Routes>
          <Route
            path="/backoffice/*"
            element={
              <Suspense fallback={<div className="chargement-plein">Chargement du back-office…</div>}>
                <BackOffice />
              </Suspense>
            }
          />
          <Route path="/*" element={<Visiteur />} />
        </Routes>
      </FournisseurLangue>
    </BrowserRouter>
    </QueryClientProvider>
  )
}
