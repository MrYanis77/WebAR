import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Icone, type NomIcone } from '../commun/Icone'
import { deconnexion, useEtat, useNotifications, type EtatDonnees } from '../commun/store'
import type { Role, Session } from '../commun/types'
import './backoffice.css'
import { signalementsDuPartenaire } from './session'
import { PageConnexion, PageInscription } from './pages/Acces'
import PageAffiches from './pages/PageAffiches'
import PageCharte from './pages/PageCharte'
import PageEditeurAffiche from './pages/PageEditeurAffiche'
import PageEditeurMonument from './pages/PageEditeurMonument'
import PageFichiers from './pages/PageFichiers'
import PageJournal from './pages/PageJournal'
import PageLieux from './pages/PageLieux'
import PageAnimationsMonuments from './pages/PageAnimationsMonuments'
import { PageAttributions, PageZones } from './pages/PageZones'
import PageMesSignalements from './pages/PageMesSignalements'
import PageModeration from './pages/PageModeration'
import PagePartenaires from './pages/PagePartenaires'
import PageScore from './pages/PageScore'
import PageSignalements from './pages/PageSignalements'
import PageStatistiques from './pages/PageStatistiques'
import PageTableauDeBord from './pages/PageTableauDeBord'
import PageVoirAffiche from './pages/PageVoirAffiche'

interface ElementNav {
  to: string
  libelle: string
  /** Libellé montré aux partenaires, s'il diffère. */
  libellePartenaire?: string
  icone: NomIcone
  role?: Role
  badge?: (e: EtatDonnees, s: Session) => number
  /** Sous-menu : le parent s'ouvre et se ferme, il ne mène à aucune page. */
  sous?: ElementNav[]
  /** Lien exact (n'est pas actif sur les sous-pages). */
  exact?: boolean
}

const attenteZone = (e: EtatDonnees) => e.affiches.filter((a) => a.zoneProposeeId || (!a.zoneId && a.proprietaireId !== 'ville')).length

const NAVIGATION: { groupe?: string; elements: ElementNav[] }[] = [
  { elements: [{ to: '/backoffice', libelle: 'Vue d’ensemble', icone: 'grille' }] },
  {
    groupe: 'Contenus',
    elements: [
      // Un monument sert à placer une animation 3D ; une zone d'affichage sert aux affiches.
      {
        to: '/backoffice/lieux',
        libelle: 'Monuments',
        icone: 'pin',
        role: 'AGENT',
        sous: [
          { to: '/backoffice/lieux', libelle: 'Tous les monuments', icone: 'carte', exact: true },
          { to: '/backoffice/lieux/animations', libelle: 'Animations 3D', icone: 'cube' },
          { to: '/backoffice/lieux/nouveau', libelle: 'Créer un monument', icone: 'plus' },
        ],
      },
      {
        to: '/backoffice/affiches',
        libelle: 'Affiches',
        icone: 'affiche',
        sous: [
          { to: '/backoffice/affiches', libelle: 'Toutes les affiches', libellePartenaire: 'Mes affiches', icone: 'affiche', exact: true },
          { to: '/backoffice/affiches/nouvelle', libelle: 'Créer une affiche', icone: 'plus' },
          { to: '/backoffice/affiches/zones', libelle: 'Zones d’affichage', icone: 'zone', role: 'AGENT' },
          { to: '/backoffice/affiches/attributions', libelle: 'Zones à attribuer', icone: 'drapeau', role: 'AGENT', badge: attenteZone },
        ],
      },
      { to: '/backoffice/fichiers', libelle: 'Fichiers 3D & sons', icone: 'cube' },
    ],
  },
  {
    groupe: 'Ville',
    elements: [
      { to: '/backoffice/score', libelle: 'Score du match', icone: 'trophee', role: 'AGENT' },
    ],
  },
  {
    groupe: 'Contrôle',
    elements: [
      { to: '/backoffice/partenaires', libelle: 'Partenaires', icone: 'utilisateurs', role: 'AGENT', badge: (e) => e.partenaires.filter((p) => p.statut === 'EN_ATTENTE').length },
      { to: '/backoffice/signalements', libelle: 'Signalements', icone: 'drapeau', role: 'AGENT', badge: (e) => e.signalements.filter((s) => s.statut !== 'TRAITE').length },
      { to: '/backoffice/moderation', libelle: 'Modération', icone: 'marteau', role: 'AGENT', badge: (e) => e.decisions.filter((d) => d.reexamenDemande).length },
      { to: '/backoffice/journal', libelle: 'Journal', icone: 'historique', role: 'AGENT' },
    ],
  },
  {
    groupe: 'Mon espace',
    elements: [
      { to: '/backoffice/mes-signalements', libelle: 'Signalements reçus', icone: 'drapeau', role: 'PARTENAIRE', badge: (e, s) => signalementsDuPartenaire(e, s.partenaireId).filter((x) => x.statut !== 'TRAITE').length },
      { to: '/backoffice/charte', libelle: 'Charte d’utilisation', icone: 'bouclier', role: 'PARTENAIRE' },
    ],
  },
  { groupe: 'Suivi', elements: [{ to: '/backoffice/statistiques', libelle: 'Statistiques', icone: 'graphique' }] },
]

/** Dernières notifications du compte (journal filtré par l'API) ; elles sont aussi envoyées par mail. */
function Notifications() {
  const [ouvert, setOuvert] = useState(false)
  const elements = useNotifications(true).data ?? []
  return (
    <div className="notifications">
      <button type="button" className="bo-icone notif" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} aria-label="Notifications">
        <Icone nom="cloche" taille={18} />
      </button>
      {ouvert && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <strong>Notifications</strong>
          <small>Également envoyées par mail (Mailpit en local)</small>
          <ul>
            {elements.map((j) => (
              <li key={j.id}>
                <span className="point" />
                <div>
                  <b>{j.action.replace(/_/g, ' ').toLowerCase()}</b> — {j.objet}
                  <small>
                    {j.auteur} · {new Date(j.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </small>
                </div>
              </li>
            ))}
            {elements.length === 0 && <li>Aucune notification.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function LienNav({ element: e, etat, session, sous = false }: { element: ElementNav; etat: EtatDonnees; session: Session; sous?: boolean }) {
  const badge = e.badge?.(etat, session) ?? 0
  return (
    <NavLink to={e.to} end={e.exact || e.to === '/backoffice'} className={sous ? 'sous-lien' : undefined}>
      <Icone nom={e.icone} taille={sous ? 15 : 18} />
      {session.role === 'PARTENAIRE' ? (e.libellePartenaire ?? e.libelle) : e.libelle}
      {badge > 0 && <b>{badge}</b>}
    </NavLink>
  )
}

/** Entrée à sous-menu : ouverte d'office quand on est dans l'une de ses pages. */
function SousMenu({ element: e, etat, session }: { element: ElementNav; etat: EtatDonnees; session: Session }) {
  const { pathname } = useLocation()
  const dedans = pathname === e.to || pathname.startsWith(`${e.to}/`)
  const [ouvert, setOuvert] = useState(dedans)
  useEffect(() => {
    if (dedans) setOuvert(true)
  }, [dedans])
  const sous = (e.sous ?? []).filter((x) => !x.role || x.role === session.role)
  const badge = sous.reduce((n, x) => n + (x.badge?.(etat, session) ?? 0), 0)
  const id = `sous-menu-${e.to.split('/').pop()}`
  return (
    <div className={`groupe-sous-menu ${dedans ? 'dedans' : ''}`}>
      <button type="button" className="parent-sous-menu" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert(!ouvert)}>
        <Icone nom={e.icone} taille={18} />
        {e.libelle}
        {!ouvert && badge > 0 && <b>{badge}</b>}
        <Icone nom={ouvert ? 'haut' : 'bas'} taille={15} className="chevron" />
      </button>
      {ouvert && (
        <div id={id} className="liste-sous-menu">
          {sous.map((x) => (
            <LienNav key={x.to} element={x} etat={etat} session={session} sous />
          ))}
        </div>
      )}
    </div>
  )
}

function MiseEnPage({ session, children }: { session: Session; children: ReactNode }) {
  const etat = useEtat()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const partenaire = etat.partenaires.find((p) => p.id === session.partenaireId)
  const initiales = session.nom
    .split(' ')
    .map((m) => m[0])
    .join('')
    .slice(0, 2)

  useEffect(() => setMenuOuvert(false), [pathname])

  return (
    <div className={`bo-app ${menuOuvert ? 'menu-ouvert' : ''}`}>
      <aside className="bo-barre">
        <Link to="/backoffice" className="bo-logo">
          <span className="marque">M</span>
          <span>
            <strong>MINDI</strong>
            <small>BACK-OFFICE</small>
          </span>
        </Link>
        <div className="bo-espace">
          <span>ESPACE</span>
          <div className="bo-espace-actuel">
            <i>{session.role === 'AGENT' ? 'VM' : initiales}</i>
            <div>
              <strong>{session.structure}</strong>
              <small>{session.role === 'AGENT' ? 'Agent municipal' : 'Partenaire'}</small>
            </div>
          </div>
        </div>
        <nav className="bo-nav" aria-label="Back-office">
          {NAVIGATION.map((g, gi) => {
            const elements = g.elements.filter((e) => !e.role || e.role === session.role)
            if (elements.length === 0) return null
            return (
              <div key={gi}>
                {g.groupe && <span className="bo-groupe">{g.groupe}</span>}
                {elements.map((e) =>
                  e.sous ? (
                    <SousMenu key={e.to} element={e} etat={etat} session={session} />
                  ) : (
                    <LienNav key={e.to} element={e} etat={etat} session={session} />
                  ),
                )}
              </div>
            )
          })}
        </nav>
        <div className="bo-aide">
          <Icone nom="info" taille={18} />
          <strong>Besoin d’aide ?</strong>
          <p>Les décisions et alertes sont aussi envoyées par mail. Contact : service communication de la Ville.</p>
        </div>
        <div className="bo-utilisateur">
          <span>{initiales}</span>
          <div>
            <strong>{session.nom}</strong>
            <small>{session.role === 'AGENT' ? 'Agent · double authentification' : partenaire?.secteur}</small>
          </div>
          <button
            type="button"
            className="bo-icone sombre"
            aria-label="Se déconnecter"
            onClick={() => {
              void deconnexion().finally(() => navigate('/backoffice/connexion'))
            }}
          >
            <Icone nom="sortie" taille={16} />
          </button>
        </div>
      </aside>
      <div className="bo-principal">
        <div className="bo-barre-mobile">
          <button type="button" className="bo-icone" onClick={() => setMenuOuvert(!menuOuvert)} aria-label="Menu">
            <Icone nom="menu" taille={20} />
          </button>
          <strong>Mindi</strong>
          <Notifications />
        </div>
        <div className="bo-notif-bureau">
          <Notifications />
        </div>
        {session.role === 'PARTENAIRE' && partenaire && !partenaire.charteAccepteeLe && !pathname.endsWith('/charte') && (
          <div className="bo-alerte">
            <Icone nom="bouclier" taille={16} />
            Acceptez la charte d’utilisation pour importer des fichiers et créer des affiches.
            <Link to="/backoffice/charte">Lire la charte</Link>
          </div>
        )}
        {children}
      </div>
      <button type="button" className="bo-voile-menu" aria-label="Fermer le menu" onClick={() => setMenuOuvert(false)} />
    </div>
  )
}

/** Ancienne page « Animations » : elle est désormais rangée avec les monuments (mairie) ou les affiches. */
function RedirectionAnimations() {
  const { session } = useEtat()
  return <Navigate to={session?.role === 'AGENT' ? '/backoffice/lieux' : '/backoffice/affiches'} replace />
}

function PageInterdite() {
  return (
    <div className="bo-defilement">
      <div className="interdit">
        <span>
          <Icone nom="cadenas" taille={28} />
        </span>
        <h1>Accès réservé aux agents de la mairie</h1>
        <p>
          Cette page n’est pas disponible pour un compte partenaire. L’API refuse aussi ces actions côté serveur (réponse 403), même en
          contournant l’interface.
        </p>
        <Link to="/backoffice" className="btn btn-primaire">
          Retour à la vue d’ensemble
        </Link>
      </div>
    </div>
  )
}

/** Pages réservées : la session est lue auprès de l'API (cookie httpOnly) avant tout affichage. */
function Protegee({ role, sansMenu, children }: { role?: Role; sansMenu?: boolean; children: ReactNode }) {
  const { session, chargement } = useEtat()
  const { pathname } = useLocation()
  if (chargement && !session) return <div className="chargement-plein">Chargement…</div>
  if (!session) return <Navigate to="/backoffice/connexion" replace state={{ depuis: pathname }} />
  if (sansMenu) return <>{children}</>
  return <MiseEnPage session={session}>{role && session.role !== role ? <PageInterdite /> : children}</MiseEnPage>
}

export default function BackOffice() {
  useEffect(() => {
    document.title = 'Back-office — Mindi'
    return () => {
      document.title = 'Mindi'
    }
  }, [])
  return (
    <Routes>
      <Route path="connexion" element={<PageConnexion />} />
      <Route path="inscription" element={<PageInscription />} />
      <Route index element={<Protegee><PageTableauDeBord /></Protegee>} />
      {/* Animations de monument : avec les monuments ; animations d'affiche : avec les affiches. */}
      <Route path="animations" element={<Protegee><RedirectionAnimations /></Protegee>} />
      <Route path="affiches" element={<Protegee><PageAffiches /></Protegee>} />
      <Route path="affiches/zones" element={<Protegee role="AGENT"><PageZones /></Protegee>} />
      <Route path="affiches/attributions" element={<Protegee role="AGENT"><PageAttributions /></Protegee>} />
      <Route path="affiches/nouvelle" element={<Protegee><PageEditeurAffiche /></Protegee>} />
      <Route path="affiches/:id" element={<Protegee><PageEditeurAffiche /></Protegee>} />
      <Route path="affiches/:id/voir" element={<Protegee sansMenu><PageVoirAffiche /></Protegee>} />
      <Route path="fichiers" element={<Protegee><PageFichiers /></Protegee>} />
      <Route path="statistiques" element={<Protegee><PageStatistiques /></Protegee>} />
      <Route path="charte" element={<Protegee><PageCharte /></Protegee>} />
      <Route path="mes-signalements" element={<Protegee role="PARTENAIRE"><PageMesSignalements /></Protegee>} />
      <Route path="lieux" element={<Protegee role="AGENT"><PageLieux /></Protegee>} />
      <Route path="lieux/animations" element={<Protegee role="AGENT"><PageAnimationsMonuments /></Protegee>} />
      <Route path="lieux/nouveau" element={<Protegee role="AGENT"><PageEditeurMonument /></Protegee>} />
      <Route path="lieux/:id" element={<Protegee role="AGENT"><PageEditeurMonument /></Protegee>} />
      <Route path="score" element={<Protegee role="AGENT"><PageScore /></Protegee>} />
      <Route path="partenaires" element={<Protegee role="AGENT"><PagePartenaires /></Protegee>} />
      <Route path="signalements" element={<Protegee role="AGENT"><PageSignalements /></Protegee>} />
      <Route path="moderation" element={<Protegee role="AGENT"><PageModeration /></Protegee>} />
      <Route path="journal" element={<Protegee role="AGENT"><PageJournal /></Protegee>} />
      <Route path="*" element={<Navigate to="/backoffice" replace />} />
    </Routes>
  )
}
