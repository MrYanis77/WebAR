import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { SECTEURS } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { Altcha } from '../../commun/Altcha'
import { messageErreur } from '../../commun/api'
import { connexion, inscrirePartenaire, renvoyerCode, validerCode } from '../../commun/store'

function CadreAcces({ children }: { children: ReactNode }) {
  return (
    <div className="acces">
      <aside className="acces-marque">
        <Link to="/backoffice" className="bo-logo">
          <span className="marque">M</span>
          <span>
            <strong>MINDI</strong>
            <small>VILLE DE MONTBÉLIARD</small>
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
            <Icone nom="bouclier" taille={16} /> Double authentification des agents par code envoyé par mail
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

/**
 * Connexion par l'API : mot de passe vérifié par Argon2id, blocage 15 min après 5 échecs (BNF-10),
 * puis, pour les agents, code à 6 chiffres envoyé par mail (double authentification).
 */
export function PageConnexion() {
  const navigate = useNavigate()
  const location = useLocation()
  const depuis = (location.state as { depuis?: string } | null)?.depuis ?? '/backoffice'
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [etape, setEtape] = useState<'identifiants' | 'code'>('identifiants')
  const [info, setInfo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!email.trim() || !mdp) return setErreur('Saisissez votre adresse e-mail et votre mot de passe.')
    setEnvoi(true)
    try {
      const suite = await connexion(email.trim().toLowerCase(), mdp)
      if (suite === 'CODE') setEtape('code')
      else navigate(depuis, { replace: true })
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!/^\d{6}$/.test(code)) return setErreur('Saisissez les 6 chiffres reçus par mail.')
    setEnvoi(true)
    try {
      await validerCode(code)
      navigate(depuis, { replace: true })
    } catch (err) {
      setErreur(messageErreur(err))
      setCode('')
      // Après 5 essais ou à l'expiration, le serveur annule le code : retour au mot de passe.
      if (/reprenez la connexion/.test(messageErreur(err))) setEtape('identifiants')
    } finally {
      setEnvoi(false)
    }
  }

  async function renvoyer() {
    setErreur(null)
    setInfo(null)
    try {
      await renvoyerCode()
      setInfo('Un nouveau code vient de vous être envoyé.')
    } catch (err) {
      setErreur(messageErreur(err))
    }
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
              Mot de passe
            </span>
            <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
          </label>
          {erreur && (
            <p className="erreur-acces" role="alert">
              <Icone nom="alerte" taille={15} />
              {erreur}
            </p>
          )}
          <button type="submit" className="btn btn-primaire btn-bloc" disabled={envoi}>
            {envoi ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="lien-acces">
            Vous êtes un partenaire ? <Link to="/backoffice/inscription">Créer un compte</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={valider} className="carte-acces" noValidate>
          <button type="button" className="btn-texte retour-acces" onClick={() => { setEtape('identifiants'); setErreur(null); setInfo(null) }}>
            <Icone nom="gauche" taille={15} /> Retour
          </button>
          <span className="icone-acces">
            <Icone nom="bouclier" taille={26} />
          </span>
          <h2>Vérifiez votre boîte mail</h2>
          <p className="aide-acces">
            Un code à 6 chiffres vient d’être envoyé à <strong>{email.trim().toLowerCase()}</strong>. Il est valable 10 minutes et ne sert qu’une fois.
          </p>
          <input
            className="code-connexion"
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
          {info && <p className="info-acces" role="status">{info}</p>}
          <button type="submit" className="btn btn-primaire btn-bloc" disabled={envoi}>
            {envoi ? 'Vérification…' : 'Valider'}
          </button>
          <button type="button" className="btn-texte btn-bloc" onClick={() => void renvoyer()}>
            Je n’ai pas reçu le code : le renvoyer
          </button>
        </form>
      )}
    </CadreAcces>
  )
}

/** Inscription d'un partenaire : compte inactif tant qu'un agent ne l'a pas vérifié (BF-34, BNF-20, BNF-23). */
export function PageInscription() {
  const [envoye, setEnvoye] = useState(false)
  const [altcha, setAltcha] = useState<string | null>(null)
  const [erreurServeur, setErreurServeur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
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
  const valide = !Object.values(erreurs).some(Boolean) && !!altcha

  /** Envoi à l'API : le compte est créé « en attente » et les agents sont prévenus par mail. */
  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setTente(true)
    setErreurServeur(null)
    if (!valide || !altcha) return
    setEnvoi(true)
    try {
      await inscrirePartenaire({
        nomStructure: f.nomStructure.trim(),
        secteur: f.secteur,
        adresse: f.adresse.trim(),
        contactNom: f.contactNom.trim(),
        contactTelephone: f.contactTelephone.trim() || undefined,
        email: f.email.trim().toLowerCase(),
        motDePasse: f.mdp,
        rgpd: true,
        altcha,
      })
      setEnvoye(true)
    } catch (err) {
      setErreurServeur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
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
        <Altcha onChange={setAltcha} />
        {tente && !valide && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            Complétez les champs signalés{!altcha ? ' et la vérification anti-robot' : ''}.
          </p>
        )}
        {erreurServeur && (
          <p className="erreur-acces" role="alert">
            <Icone nom="alerte" taille={15} />
            {erreurServeur}
          </p>
        )}
        <button type="submit" className="btn btn-primaire btn-bloc" disabled={envoi}>
          {envoi ? 'Envoi…' : 'Envoyer ma demande'}
        </button>
        <p className="lien-acces">
          Déjà inscrit ? <Link to="/backoffice/connexion">Se connecter</Link>
        </p>
      </form>
    </CadreAcces>
  )
}
