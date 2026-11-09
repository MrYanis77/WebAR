import { useEffect, useState, type FormEvent } from 'react'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { COMMENTAIRE_MAX, MOTIFS_SIGNALEMENT } from '../../commun/constantes'
import { signaler } from '../../commun/store'
import type { MotifSignalement } from '../../commun/types'
import { CoucheModale, EnteteFeuille } from './Couche'

export interface CibleSignalement {
  afficheId?: string
  animationId?: string
  nom: string
}

/** Formulaire anonyme (BF-45 à BF-47, BF-51) : motif, commentaire, preuve anti-robot invisible. */
export function FormulaireSignalement({ cible, onFermer }: { cible: CibleSignalement | null; onFermer: () => void }) {
  const { t } = useLangue()
  const [motif, setMotif] = useState<MotifSignalement | ''>('')
  const [commentaire, setCommentaire] = useState('')
  const [robot, setRobot] = useState<'calcul' | 'ok'>('calcul')
  const [etat, setEtat] = useState<'saisie' | 'envoye' | 'limite'>('saisie')
  const [tente, setTente] = useState(false)

  // Simulation de la preuve de travail ALTCHA : invisible, sans cookie.
  useEffect(() => {
    if (!cible) return
    setMotif('')
    setCommentaire('')
    setEtat('saisie')
    setTente(false)
    setRobot('calcul')
    const id = window.setTimeout(() => setRobot('ok'), 900)
    return () => window.clearTimeout(id)
  }, [cible])

  const commentaireRequis = motif === 'AUTRE'
  const erreurMotif = tente && !motif
  const erreurCommentaire = tente && commentaireRequis && !commentaire.trim()

  function envoyer(e: FormEvent) {
    e.preventDefault()
    setTente(true)
    if (!cible || !motif || (commentaireRequis && !commentaire.trim()) || robot !== 'ok') return
    const r = signaler({ afficheId: cible.afficheId, animationId: cible.animationId }, motif, commentaire.trim())
    setEtat(r.ok ? 'envoye' : 'limite')
  }

  return (
    <CoucheModale ouverte={!!cible} onFermer={onFermer} etiquette={t('sig.titre')}>
      {etat === 'envoye' ? (
        <div className="etat-succes" role="status">
          <span>
            <Icone nom="check" taille={30} />
          </span>
          <h3>{t('sig.envoye')}</h3>
          <p>{t('sig.envoyeTexte')}</p>
          <button type="button" className="btn btn-primaire btn-bloc" onClick={onFermer}>
            {t('sig.fermer')}
          </button>
        </div>
      ) : (
        <form className="formulaire-signalement" onSubmit={envoyer} noValidate>
          <EnteteFeuille
            surtitre={
              <span className="pill pill-wine">
                <Icone nom="bouclier" taille={12} />
                {t('sig.anonyme')}
              </span>
            }
            titre={t('sig.titre')}
            onFermer={onFermer}
            libelleFermer={t('commun.fermer')}
          />
          <p className="intro">{t('sig.intro')}</p>
          <div className="contenu-vise">
            <Icone nom="drapeau" taille={16} />
            <div>
              <small>{t('sig.contenu')}</small>
              <strong>{cible?.nom}</strong>
            </div>
          </div>

          <label className={`champ ${erreurMotif ? 'erreur' : ''}`}>
            <span className="etiquette">
              {t('sig.motif')} <small>{t('sig.obligatoire')}</small>
            </span>
            <select value={motif} onChange={(e) => setMotif(e.target.value as MotifSignalement)} required>
              <option value="" disabled>
                {t('sig.choisir')}
              </option>
              {MOTIFS_SIGNALEMENT.map((m) => (
                <option key={m} value={m}>
                  {t(`motif.${m}`)}
                </option>
              ))}
            </select>
            {erreurMotif && <span className="message-erreur">{t('sig.choisir')}</span>}
          </label>

          <label className={`champ ${erreurCommentaire ? 'erreur' : ''}`}>
            <span className="etiquette">
              {t('sig.commentaire')}
              <small>
                {commentaireRequis ? t('sig.obligatoire') : t('sig.facultatif')} · {commentaire.length}/{COMMENTAIRE_MAX}
              </small>
            </span>
            <textarea
              value={commentaire}
              maxLength={COMMENTAIRE_MAX}
              rows={3}
              placeholder={t('sig.placeholder')}
              onChange={(e) => setCommentaire(e.target.value.replace(/<[^>]*>/g, ''))}
            />
            <span className="aide avertissement">
              <Icone nom="alerte" taille={13} /> {t('sig.avertissement')}
            </span>
          </label>

          <div className={`anti-robot ${robot}`} aria-live="polite">
            {robot === 'calcul' ? <span className="spinner" /> : <Icone nom="check" taille={15} />}
            <span>{t('sig.robot')}</span>
            <strong>{robot === 'calcul' ? t('sig.robotEnCours') : t('sig.robotOk')}</strong>
          </div>

          {etat === 'limite' && (
            <p className="message-limite" role="alert">
              {t('sig.limite')}
            </p>
          )}

          <button type="submit" className="btn btn-primaire btn-bloc" disabled={robot !== 'ok'}>
            <Icone nom="drapeau" taille={16} />
            {t('sig.envoyer')}
          </button>
          <p className="mention-conservation">{t('sig.conservation')}</p>
        </form>
      )}
    </CoucheModale>
  )
}
