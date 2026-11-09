import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { SECTEURS } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { connexion, inscrirePartenaire, useEtat } from '../../commun/store'
import { SESSION_AGENT } from '../session'

function CadreAcces({ children }: { children: ReactNode }) {
  return (
    <div className="acces">
      <aside className="acces-marque">
        <Link to="/backoffice" className="bo-logo">
          <span className="marque">M</span>
          <span>
            <strong>MONTBÉLIARD</strong>
            <small>EXPÉRIENCES</small>
          </span>
        </Link>
        <div>
          <span className="pill pill-cyan">Back-office</span>
          <h1>
            Faites vivre la ville, <em>affiche après affiche.</em>
          </h1>
          <p>Animations en réalité augmentée, affiches à QR code, zones d’affichage et modération : un même espace pour la mairie et ses partenaires.</p>
        </div>
        <ul>
          <li>
            <Icone nom="cadenas" taille={16} /> Connexion chiffrée (HTTPS) et mots de passe hachés
          </li>
          <li>
            <Icone nom="bouclier" taille={16} /> Double authentification pour les agents
          </li>
          <li>
            <Icone nom="check" taille={16} /> Publication après contrôle automatique des fichiers
          </li>
        </ul>
      </aside>
      <main className="acces-formulaire">{children}</main>
    </div>
  )
}

/** Connexion + code à usage unique pour les agents (BNF-10), blocage après 5 échecs. */
export function PageConnexion() {
  const etat = useEtat()
  const navigate = useNavigate()
  const location = useLocation()
  const depuis = (location.state as { depuis?: string } | null)?.depuis ?? '/backoffice'
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [etape, setEtape] = useState<'identifiants' | 'totp'>('identifiants')
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [echecs, setEchecs] = useState(0)

  function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (echecs >= 5) return
    const mail = email.trim().toLowerCase()
    if (!mail || mdp.length < 8) {
      const n = echecs + 1
      setEchecs(n)
      setErreur(n >= 5 ? 'Compte temporairement bloqué après 5 essais. Réessayez dans 15 minutes.' : `Identifiants incorrects (${n}/5). Le mot de passe compte au moins 8 caractères.`)
      return
    }
    if (mail.endsWith('@montbeliard.fr')) {
      setEtape('totp')
      return
    }
    const p = etat.partenaires.find((x) => x.email.toLowerCase() === mail)
    if (!p) return setErreur('Aucun compte ne correspond à cette adresse. Créez un compte partenaire.')
    if (p.statut === 'EN_ATTENTE') return setErreur('Votre compte est en attente de vérification par la mairie. Vous serez prévenu par mail.')
    if (p.statut === 'REFUSE') return setErreur(`Inscription refusée : ${p.motifStatut ?? 'motif communiqué par mail'}.`)
    if (p.statut === 'SUSPENDU') return setErreur(`Compte suspendu : ${p.motifStatut ?? 'motif communiqué par mail'}. Vous pouvez demander un réexamen.`)
    connexion({ role: 'PARTENAIRE', nom: p.contactNom, email: p.email, structure: p.nomStructure, partenaireId: p.id })
    navigate(depuis, { replace: true })
  }

  function valider(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setErreur('Saisissez les 6 chiffres affichés par votre application d’authentification.')
    connexion({ ...SESSION_AGENT, email: email.trim().toLowerCase() || SESSION_AGENT.email })
    navigate(depuis, { replace: true })
  }

  return (
    <CadreAcces>
      {etape === 'identifiants' ? (
        <form onSubmit={soumettre} className="carte-acces" noValidate>
          <h2>Connexion</h2>
          <p className="aide-acces">Agents de la mairie et partenaires vérifiés.</p>
          <label className="champ">
            <span className="etiquette">Adresse e-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="champ">
            <span className="etiquette">
              Mot de passe <Link to="#" onClick={(e) => e.preventDefault()}>Oublié ?</Link>
            </span>
            <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
          </label>
          {erreur && (
            <p className="erreur-acces" role="alert">
              <Icone nom="alerte" taille={15} />
              {erreur}
            </p>
          )}
          <button type="submit" className="btn btn-primaire btn-bloc" disabled={echecs >= 5}>
            Se connecter
          </button>
          <p className="lien-acces">
            Vous êtes un partenaire ? <Link to="/backoffice/inscription">Créer un compte</Link>
          </p>
          <div className="demo-acces">
            <strong>Comptes de démonstration</strong>
            <button type="button" onClick={() => { setEmail('c.martin@montbeliard.fr'); setMdp('demo-montbeliard') }}>
              <Icone nom="bouclier" taille={15} /> Agente : c.martin@montbeliard.fr
            </button>
            <button type="button" onClick={() => { setEmail('hugo@festival-momes.test'); setMdp('demo-partenaire') }}>
              <Icone nom="utilisateurs" taille={15} /> Partenaire : hugo@festival-momes.test
            </button>
            <button type="button" onClick={() => { setEmail('thomas@pages-or.test'); setMdp('demo-partenaire') }}>
              <Icone nom="horloge" taille={15} /> Partenaire en attente : thomas@pages-or.test
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={valider} className="carte-acces" noValidate>
          <button type="button" className="btn-texte retour-acces" onClick={() => setEtape('identifiants')}>
            <Icone nom="gauche" taille={15} /> Retour
          </button>
          <span className="icone-acces">
            <Icone nom="bouclier" taille={26} />
          </span>
          <h2>Double authentification</h2>
          <p className="aide-acces">Saisissez le code à 6 chiffres de votre application d’authentification (TOTP). En démonstration, tout code à 6 chiffres est accepté.</p>
          <input
            className="code-totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-label="Code à 6 chiffres"
            placeholder="••••••"
            autoFocus
          />
          {erreur && (
            <p className="erreur-acces" role="alert">
              <Icone nom="alerte" taille={15} />
              {erreur}
            </p>
          )}
          <button type="submit" className="btn btn-primaire btn-bloc">
            Valider
          </button>
        </form>
      )}
    </CadreAcces>
  )
}

/** Inscription d'un partenaire : compte inactif tant qu'un agent ne l'a pas vérifié (BF-34, BNF-20, BNF-23). */
export function PageInscription() {
  const [envoye, setEnvoye] = useState(false)
  const [robot, setRobot] = useState<'non' | 'calcul' | 'ok'>('non')
  const [tente, setTente] = useState(false)
  const [f, setF] = useState({ nomStructure: '', secteur: '', adresse: '', contactNom: '', contactTelephone: '', email: '', mdp: '', rgpd: false })
  const maj = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const erreurs = {
    nomStructure: !f.nomStructure.trim(),
    secteur: !f.secteur,
    adresse: !f.adresse.trim(),
    contactNom: !f.contactNom.trim(),
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email),
    mdp: f.mdp.length < 12,
    rgpd: !f.rgpd,
  }
  const valide = !Object.values(erreurs).some(Boolean) && robot === 'ok'

  function soumettre(e: FormEvent) {
    e.preventDefault()
    setTente(true)
    if (!valide) return
    inscrirePartenaire({
      nomStructure: f.nomStructure.trim(),
      secteur: f.secteur,
      adresse: f.adresse.trim(),
      contactNom: f.contactNom.trim(),
      contactTelephone: f.contactTelephone.trim() || undefined,
      email: f.email.trim().toLowerCase(),
    })
    setEnvoye(true)
  }

  const champ = (k: keyof typeof erreurs, libelle: string, input: ReactNode, aide?: string) => (
    <label className={`champ ${tente && erreurs[k] ? 'erreur' : ''}`}>
      <span className="etiquette">{libelle}</span>
      {input}
      {aide && <span className="aide">{aide}</span>}
    </label>
  )

  if (envoye)
    return (
      <CadreAcces>
        <div className="carte-acces">
          <span className="icone-acces succes">
            <Icone nom="check" taille={26} />
          </span>
          <h2>Demande envoyée</h2>
          <p className="aide-acces">Votre compte est créé mais reste inactif tant qu’un agent de la mairie ne l’a pas vérifié. Vous recevrez la décision par mail.</p>
          <ol className="frise">
            <li className="fait">
              <span>1</span>Inscription
            </li>
            <li className="courant">
              <span>2</span>Vérification par la mairie
            </li>
            <li>
              <span>3</span>Acceptation de la charte
            </li>
            <li>
              <span>4</span>Création d’affiches
            </li>
          </ol>
          <Link to="/backoffice/connexion" className="btn btn-primaire btn-bloc">
            Retour à la connexion
          </Link>
        </div>
      </CadreAcces>
    )

  return (
    <CadreAcces>
      <form className="carte-acces large" onSubmit={soumettre} noValidate>
        <h2>Créer un compte partenaire</h2>
        <p className="aide-acces">Musées, commerces, clubs, organisateurs : promouvez vos événements avec vos propres affiches en réalité augmentée.</p>
        <div className="grille-champs">
          {champ('nomStructure', 'Nom de la structure', <input value={f.nomStructure} onChange={maj('nomStructure')} maxLength={150} />)}
          {champ(
            'secteur',
            'Secteur d’activité',
            <select value={f.secteur} onChange={maj('secteur')}>
              <option value="">Choisir…</option>
              {SECTEURS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>,
          )}
          <div className="pleine">{champ('adresse', 'Adresse', <input value={f.adresse} onChange={maj('adresse')} maxLength={255} />)}</div>
          {champ('contactNom', 'Personne de contact', <input value={f.contactNom} onChange={maj('contactNom')} maxLength={100} autoComplete="name" />)}
          <label className="champ">
            <span className="etiquette">
              Téléphone <small>Facultatif</small>
            </span>
            <input value={f.contactTelephone} onChange={maj('contactTelephone')} maxLength={20} autoComplete="tel" />
          </label>
          {champ('email', 'E-mail de connexion', <input type="email" value={f.email} onChange={maj('email')} autoComplete="email" />)}
          {champ('mdp', 'Mot de passe', <input type="password" value={f.mdp} onChange={maj('mdp')} autoComplete="new-password" />, '12 caractères minimum')}
        </div>
        <div className="rgpd">
          <Icone nom="info" taille={16} />
          <p>
            Données collectées : structure et personne de contact, uniquement pour gérer votre compte et vous notifier les décisions. Conservation : durée du
            partenariat, puis suppression des comptes inactifs. Droits d’accès, de rectification et de suppression auprès de la Ville.
          </p>
        </div>
        <label className={`case ${tente && erreurs.rgpd ? 'erreur' : ''}`}>
          <input type="checkbox" checked={f.rgpd} onChange={(e) => setF({ ...f, rgpd: e.target.checked })} />
          J’ai pris connaissance de l’information sur le traitement de mes données.
        </label>
        <button
          type="button"
          className={`anti-robot-bo ${robot}`}
          onClick={() => {
            if (robot !== 'non') return
            setRobot('calcul')
            window.setTimeout(() => setRobot('ok'), 1100)
          }}
        >
          <span className="case-robot">{robot === 'calcul' ? <span className="spinner" /> : robot === 'ok' ? <Icone nom="check" taille={14} /> : null}</span>
          {robot === 'ok' ? 'Vérifié — vous n’êtes pas un robot' : 'Je ne suis pas un robot'}
          <small>ALTCHA · sans cookie</small>
        </button>
        {tente && !valide && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            Complétez les champs signalés{robot !== 'ok' ? ' et la vérification anti-robot' : ''}.
          </p>
        )}
        <button type="submit" className="btn btn-primaire btn-bloc">
          Envoyer ma demande
        </button>
        <p className="lien-acces">
          Déjà inscrit ? <Link to="/backoffice/connexion">Se connecter</Link>
        </p>
      </form>
    </CadreAcces>
  )
}
