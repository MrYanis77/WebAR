import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import { FournisseurLangue } from './commun/i18n'
import { Icone } from './commun/Icone'
import Visiteur from './visiteur/Visiteur'

// Le back-office est chargé à part : il n'alourdit pas l'application visiteur (code initial ≤ 300 Ko).
const BackOffice = lazy(() => import('./backoffice/BackOffice'))

/** Bascule « Application visiteur / Back-office » reprise de la maquette (écrans larges uniquement). */
function BasculePrototype() {
  const { pathname } = useLocation()
  const back = pathname.startsWith('/backoffice')
  return (
    <nav className="bascule-prototype" aria-label="Choisir l’application">
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
  )
}
