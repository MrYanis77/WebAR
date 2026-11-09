import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router'
import { distanceM } from '../commun/geo'
import { useLangue } from '../commun/i18n'
import { Icone } from '../commun/Icone'
import { useEtat } from '../commun/store'
import { EcranContexte } from './composants/Couche'
import { FournisseurPosition, usePosition } from './contexte/position'
import { useCompatibilite, useEnLigne } from './hooks/capteurs'
import PageCarte from './pages/PageCarte'
import { animationsDuLieu, lieuxVisibles } from './utils'
import './visiteur.css'

const PageLieu = lazy(() => import('./pages/PageLieu'))
const PageRA = lazy(() => import('./pages/PageRA'))
const PageAffiche = lazy(() => import('./pages/PageAffiche'))
const PageAgenda = lazy(() => import('./pages/PageAgenda'))
const PageScanner = lazy(() => import('./pages/PageScanner'))
const PageMentions = lazy(() => import('./pages/PageMentions'))

/** Bandeau « Vous êtes arrivé » quand le visiteur entre dans le rayon d'un lieu (BF-08). */
function MessageProximite() {
  const { t } = useLangue()
  const etat = useEtat()
  const { coords } = usePosition()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const dejaVus = useRef(new Set<string>())
  const [lieuId, setLieuId] = useState<string | null>(null)

  useEffect(() => {
    if (!coords) return
    const proche = lieuxVisibles(etat).find(
      (l) => distanceM(coords, l) <= l.rayonM && !!animationsDuLieu(etat, l.id).active && !dejaVus.current.has(l.id),
    )
    if (proche) {
      dejaVus.current.add(proche.id)
      setLieuId(proche.id)
    }
  }, [coords, etat])

  useEffect(() => {
    if (!lieuId) return
    const id = window.setTimeout(() => setLieuId(null), 12000)
    return () => window.clearTimeout(id)
  }, [lieuId])

  const lieu = etat.lieux.find((l) => l.id === lieuId)
  if (!lieu || pathname.includes('/ra') || pathname.startsWith('/a/')) return null
  return (
    <div className="message-proximite" role="status">
      <span className="icone-proximite">
        <Icone nom="pin" taille={20} />
      </span>
      <div>
        <strong>{t('prox.titre')}</strong>
        <p>{t('prox.texte', { lieu: lieu.nomCourt, r: lieu.rayonM })}</p>
      </div>
      <button
        type="button"
        className="btn btn-cyan"
        onClick={() => {
          setLieuId(null)
          navigate(`/lieux/${lieu.id}/ra`)
        }}
      >
        {t('prox.action')}
      </button>
      <button type="button" className="fermer-proximite" onClick={() => setLieuId(null)} aria-label={t('commun.fermer')}>
        <Icone nom="fermer" taille={14} />
      </button>
    </div>
  )
}

function Bandeaux() {
  const { t } = useLangue()
  const enLigne = useEnLigne()
  const compat = useCompatibilite()
  const [masque, setMasque] = useState(false)
  if (!enLigne)
    return (
      <div className="bandeau-systeme" role="status">
        <Icone nom="wifiOff" taille={15} />
        {t('reseau.horsLigne')}
      </div>
    )
  if (!compat.compatible && !masque)
    return (
      <div className="bandeau-systeme" role="status">
        <Icone nom="telephone" taille={15} />
        {t('compat.sansRA')}
        <button type="button" onClick={() => setMasque(true)} aria-label={t('commun.fermer')}>
          <Icone nom="fermer" taille={13} />
        </button>
      </div>
    )
  return null
}

export default function Visiteur() {
  const [ecran, setEcran] = useState<HTMLElement | null>(null)

  return (
    <FournisseurPosition>
      <div className="scene-visiteur">
        <div className="telephone">
          <div className="ecran" ref={setEcran} id="ecran-visiteur">
            <EcranContexte.Provider value={ecran}>
              <Suspense fallback={<div className="page page-centree"><span className="spinner" /></div>}>
                <Routes>
                  <Route index element={<PageCarte />} />
                  <Route path="lieux/:id" element={<PageLieu />} />
                  <Route path="lieux/:id/ra" element={<PageRA />} />
                  <Route path="a/:code" element={<PageAffiche />} />
                  <Route path="agenda" element={<PageAgenda />} />
                  <Route path="scanner" element={<PageScanner />} />
                  <Route path="mentions" element={<PageMentions />} />
                  <Route path="*" element={<PageCarte />} />
                </Routes>
              </Suspense>
              <Bandeaux />
              <MessageProximite />
            </EcranContexte.Provider>
          </div>
        </div>
      </div>
    </FournisseurPosition>
  )
}
