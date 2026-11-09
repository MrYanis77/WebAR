import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Icone, type NomIcone } from '../commun/Icone'
import { connexion, deconnexion, reinitialiserDemo, useEtat, type EtatDemo } from '../commun/store'
import type { Role, Session } from '../commun/types'
import './backoffice.css'
import { SESSION_AGENT, SESSION_PARTENAIRE, signalementsDuPartenaire } from './session'
import { PageConnexion, PageInscription } from './pages/Acces'
import PageAffiches from './pages/PageAffiches'
import PageAnimations from './pages/PageAnimations'
import PageCharte from './pages/PageCharte'
import PageEditeurAffiche from './pages/PageEditeurAffiche'
import PageFichiers from './pages/PageFichiers'
import PageJournal from './pages/PageJournal'
import PageLieux from './pages/PageLieux'
import PageMesSignalements from './pages/PageMesSignalements'
import PageModeles from './pages/PageModeles'
import PageModeration from './pages/PageModeration'
import PagePartenaires from './pages/PagePartenaires'
import PageScore from './pages/PageScore'
import PageSignalements from './pages/PageSignalements'
import PageStatistiques from './pages/PageStatistiques'
import PageTableauDeBord from './pages/PageTableauDeBord'

interface ElementNav {
  to: string
  libelle: string
  icone: NomIcone
  role?: Role
  badge?: (e: EtatDemo, s: Session) => number
}

const NAVIGATION: { groupe?: string; elements: ElementNav[] }[] = [
  { elements: [{ to: '/backoffice', libelle: 'Vue d’ensemble', icone: 'grille' }] },
  {
    groupe: 'Contenus',
    elements: [
      { to: '/backoffice/animations', libelle: 'Animations', icone: 'couches' },
      { to: '/backoffice/affiches', libelle: 'Affiches', icone: 'affiche' },
      { to: '/backoffice/fichiers', libelle: 'Fichiers 3D & sons', icone: 'cube' },
    ],
  },
  {
    groupe: 'Ville',
    elements: [
      { to: '/backoffice/lieux', libelle: 'Lieux & zones', icone: 'carte', role: 'AGENT', badge: (e) => e.affiches.filter((a) => a.zoneProposeeId || (!a.zoneId && a.proprietaireId !== 'ville')).length },
      { to: '/backoffice/score', libelle: 'Score du match', icone: 'trophee', role: 'AGENT' },
      { to: '/backoffice/modeles', libelle: 'Modèles d’affiche', icone: 'gabarit', role: 'AGENT' },
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

function Notifications({ session }: { session: Session }) {
  const etat = useEtat()
  const [ouvert, setOuvert] = useState(false)
  const elements = useMemo(() => {
    if (session.role === 'AGENT')
      return etat.journal.filter((j) => ['SIGNALEMENT', 'INSCRIPTION', 'REEXAMEN_DEMANDE', 'ZONE_PROPOSEE', 'IMPORT_FICHIER'].includes(j.action)).slice(0, 6)
    const nom = session.structure
    const mesContenus = new Set([
      ...etat.affiches.filter((a) => a.proprietaireId === session.partenaireId).map((a) => a.nom),
      ...etat.animations.filter((a) => a.proprietaireId === session.partenaireId).map((a) => a.titre),
      nom,
    ])
    return etat.journal.filter((j) => mesContenus.has(j.objet) && j.auteur !== nom).slice(0, 6)
  }, [etat, session])
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

function MiseEnPage({ session, children }: { session: Session; children: ReactNode }) {
  const etat = useEtat()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [espaces, setEspaces] = useState(false)
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
            <strong>MONTBÉLIARD</strong>
            <small>EXPÉRIENCES</small>
          </span>
        </Link>
        <div className="bo-espace">
          <span>ESPACE</span>
          <button type="button" onClick={() => setEspaces(!espaces)} aria-expanded={espaces}>
            <i>{session.role === 'AGENT' ? 'VM' : initiales}</i>
            <div>
              <strong>{session.structure}</strong>
              <small>{session.role === 'AGENT' ? 'Agent municipal' : 'Partenaire'}</small>
            </div>
            <Icone nom={espaces ? 'haut' : 'droite'} taille={16} />
          </button>
          {espaces && (
            <div className="bo-espaces-liste">
              <small>Démonstration : changer de rôle</small>
              <button type="button" onClick={() => { connexion(SESSION_AGENT); setEspaces(false); navigate('/backoffice') }}>
                Ville de Montbéliard — agent
              </button>
              <button type="button" onClick={() => { connexion(SESSION_PARTENAIRE); setEspaces(false); navigate('/backoffice') }}>
                Festival des Mômes — partenaire
              </button>
            </div>
          )}
        </div>
        <nav className="bo-nav" aria-label="Back-office">
          {NAVIGATION.map((g, gi) => {
            const elements = g.elements.filter((e) => !e.role || e.role === session.role)
            if (elements.length === 0) return null
            return (
              <div key={gi}>
                {g.groupe && <span className="bo-groupe">{g.groupe}</span>}
                {elements.map((e) => {
                  const badge = e.badge?.(etat, session) ?? 0
                  return (
                    <NavLink key={e.to} to={e.to} end={e.to === '/backoffice'}>
                      <Icone nom={e.icone} taille={18} />
                      {e.libelle}
                      {badge > 0 && <b>{badge}</b>}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="bo-aide">
          <Icone nom="info" taille={18} />
          <strong>Besoin d’aide ?</strong>
          <p>Données de démonstration stockées dans ce navigateur.</p>
          <button type="button" onClick={() => reinitialiserDemo()}>
            Réinitialiser la démo
          </button>
        </div>
        <div className="bo-utilisateur">
          <span>{initiales}</span>
          <div>
            <strong>{session.nom}</strong>
            <small>{session.role === 'AGENT' ? 'Administratrice · 2FA' : partenaire?.secteur}</small>
          </div>
          <button
            type="button"
            className="bo-icone sombre"
            aria-label="Se déconnecter"
            onClick={() => {
              deconnexion()
              navigate('/backoffice/connexion')
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
          <strong>Montbéliard Expériences</strong>
          <Notifications session={session} />
        </div>
        <div className="bo-notif-bureau">
          <Notifications session={session} />
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

function Protegee({ role, children }: { role?: Role; children: ReactNode }) {
  const { session } = useEtat()
  const { pathname } = useLocation()
  if (!session) return <Navigate to="/backoffice/connexion" replace state={{ depuis: pathname }} />
  return <MiseEnPage session={session}>{role && session.role !== role ? <PageInterdite /> : children}</MiseEnPage>
}

export default function BackOffice() {
  useEffect(() => {
    document.title = 'Back-office — Montbéliard Expériences'
    return () => {
      document.title = 'Montbéliard Expériences'
    }
  }, [])
  return (
    <Routes>
      <Route path="connexion" element={<PageConnexion />} />
      <Route path="inscription" element={<PageInscription />} />
      <Route index element={<Protegee><PageTableauDeBord /></Protegee>} />
      <Route path="animations" element={<Protegee><PageAnimations /></Protegee>} />
      <Route path="affiches" element={<Protegee><PageAffiches /></Protegee>} />
      <Route path="affiches/nouvelle" element={<Protegee><PageEditeurAffiche /></Protegee>} />
      <Route path="affiches/:id" element={<Protegee><PageEditeurAffiche /></Protegee>} />
      <Route path="fichiers" element={<Protegee><PageFichiers /></Protegee>} />
      <Route path="statistiques" element={<Protegee><PageStatistiques /></Protegee>} />
      <Route path="charte" element={<Protegee><PageCharte /></Protegee>} />
      <Route path="mes-signalements" element={<Protegee role="PARTENAIRE"><PageMesSignalements /></Protegee>} />
      <Route path="lieux" element={<Protegee role="AGENT"><PageLieux /></Protegee>} />
      <Route path="score" element={<Protegee role="AGENT"><PageScore /></Protegee>} />
      <Route path="modeles" element={<Protegee role="AGENT"><PageModeles /></Protegee>} />
      <Route path="partenaires" element={<Protegee role="AGENT"><PagePartenaires /></Protegee>} />
      <Route path="signalements" element={<Protegee role="AGENT"><PageSignalements /></Protegee>} />
      <Route path="moderation" element={<Protegee role="AGENT"><PageModeration /></Protegee>} />
      <Route path="journal" element={<Protegee role="AGENT"><PageJournal /></Protegee>} />
      <Route path="*" element={<Navigate to="/backoffice" replace />} />
    </Routes>
  )
}
