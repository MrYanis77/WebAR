import { useState } from 'react'
import { useNavigate } from 'react-router'
import { LANGUES, useLangue, type CleTexte } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { useEtat } from '../../commun/store'
import { usePosition } from '../contexte/position'
import { marquerConsignesVues } from '../utils'
import { CoucheModale, EnteteFeuille } from './Couche'
import { ERREURS, MessageErreur, type CasErreur } from './MessageErreur'

/** Sélecteur FR / EN / DE (BF-13). */
export function FeuilleLangue({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { t, langue, changerLangue } = useLangue()
  return (
    <CoucheModale ouverte={ouverte} onFermer={onFermer} etiquette={t('langue.titre')}>
      <EnteteFeuille titre={t('langue.titre')} onFermer={onFermer} libelleFermer={t('commun.fermer')} />
      <ul className="liste-langues">
        {LANGUES.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              aria-pressed={langue === l.code}
              onClick={() => {
                changerLangue(l.code)
                onFermer()
              }}
            >
              <span>{l.code.toUpperCase()}</span>
              {l.nom}
              {langue === l.code && <Icone nom="check" taille={18} />}
            </button>
          </li>
        ))}
      </ul>
    </CoucheModale>
  )
}

/** Bouton « FR 🌐 » de l'en-tête. */
export function BoutonLangue({ clair = false }: { clair?: boolean }) {
  const { langue, t } = useLangue()
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <button type="button" className={`bouton-langue ${clair ? 'clair' : ''}`} onClick={() => setOuvert(true)} aria-label={t('langue.titre')}>
        {langue.toUpperCase()}
        <Icone nom="globe" taille={16} />
      </button>
      <FeuilleLangue ouverte={ouvert} onFermer={() => setOuvert(false)} />
    </>
  )
}

const CAS_DEMO: CasErreur[] = ['camera', 'position', 'incompatible', 'reseau', 'expiree', 'affiche', 'monument', 'lumiere']

/** « États de démonstration » de la maquette, complétés de tous les cas de BF-09. */
export function FeuilleEtats({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { t } = useLangue()
  const navigate = useNavigate()
  const { simuler, simulee } = usePosition()
  const etat = useEtat()
  const [cas, setCas] = useState<CasErreur | null>(null)
  const afficheVille = etat.affiches.find((a) => a.id === 'af1')
  const fermer = () => {
    setCas(null)
    onFermer()
  }
  return (
    <CoucheModale ouverte={ouverte} onFermer={fermer} etiquette={t('etats.titre')}>
      {cas ? (
        <div className="detail-etat">
          <MessageErreur cas={cas} onAction={() => setCas(null)} libelleAction={t('etats.autre')} />
        </div>
      ) : (
        <>
          <EnteteFeuille surtitre={<span className="eyebrow">{t('etats.demo')}</span>} titre={t('etats.titre')} onFermer={fermer} libelleFermer={t('commun.fermer')} />
          <p className="feuille-intro">{t('etats.texte')}</p>
          <ul className="liste-etats">
            <li>
              <button
                type="button"
                onClick={() => {
                  simuler(simulee ? null : { latitude: 47.50985, longitude: 6.79845 })
                  fermer()
                  navigate('/?lieu=chateau')
                }}
              >
                <span className="cyan">
                  <Icone nom="pin" taille={18} />
                </span>
                <div>
                  <strong>{simulee ? 'Désactiver la position simulée' : t('etats.simulerArrivee')}</strong>
                  <small>{t('etats.simulerArriveeNote')}</small>
                </div>
                <Icone nom="droite" taille={16} />
              </button>
            </li>
            {afficheVille && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    fermer()
                    navigate(`/a/${afficheVille.codeQr}`)
                  }}
                >
                  <span className="cyan">
                    <Icone nom="qr" taille={18} />
                  </span>
                  <div>
                    <strong>{t('etats.ouvrirAffiche')}</strong>
                    <small>{t('etats.ouvrirAfficheNote')}</small>
                  </div>
                  <Icone nom="droite" taille={16} />
                </button>
              </li>
            )}
            {CAS_DEMO.map((c) => (
              <li key={c}>
                <button type="button" onClick={() => setCas(c)}>
                  <span>
                    <Icone nom={ERREURS[c].icone} taille={18} />
                  </span>
                  <div>
                    <strong>{t(`erreur.${c}.titre` as CleTexte)}</strong>
                    <small>{t(`erreur.${c}.texte` as CleTexte)}</small>
                  </div>
                  <Icone nom="droite" taille={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </CoucheModale>
  )
}

/** Menu ouvert par le bouton (i) de la carte. */
export function FeuilleMenu({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { t, langue } = useLangue()
  const navigate = useNavigate()
  const [langueOuverte, setLangueOuverte] = useState(false)
  const [etatsOuverts, setEtatsOuverts] = useState(false)
  return (
    <>
      <CoucheModale ouverte={ouverte} onFermer={onFermer} etiquette={t('menu.titre')}>
        <EnteteFeuille
          surtitre={
            <span className="marque-mini" aria-hidden="true">
              M
            </span>
          }
          titre={t('menu.titre')}
          onFermer={onFermer}
          libelleFermer={t('commun.fermer')}
        />
        <p className="feuille-intro">{t('menu.sousTitre')}</p>
        <ul className="liste-etats">
          <li>
            <button type="button" onClick={() => setLangueOuverte(true)}>
              <span>
                <Icone nom="globe" taille={18} />
              </span>
              <div>
                <strong>{t('menu.langue')}</strong>
                <small>{LANGUES.find((l) => l.code === langue)?.nom}</small>
              </div>
              <Icone nom="droite" taille={16} />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                marquerConsignesVues(false)
                onFermer()
                navigate('/lieux/chateau/ra')
              }}
            >
              <span>
                <Icone nom="aide" taille={18} />
              </span>
              <div>
                <strong>{t('menu.consignes')}</strong>
                <small>{t('consignes.c1.titre')} · {t('consignes.c3.titre')}</small>
              </div>
              <Icone nom="droite" taille={16} />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onFermer()
                navigate('/mentions')
              }}
            >
              <span>
                <Icone nom="bouclier" taille={18} />
              </span>
              <div>
                <strong>{t('menu.mentions')}</strong>
                <small>RGPD · DSA · {t('sig.anonyme').toLowerCase()}</small>
              </div>
              <Icone nom="droite" taille={16} />
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setEtatsOuverts(true)}>
              <span className="cyan">
                <Icone nom="grille" taille={18} />
              </span>
              <div>
                <strong>{t('menu.etats')}</strong>
                <small>{t('etats.texte')}</small>
              </div>
              <Icone nom="droite" taille={16} />
            </button>
          </li>
        </ul>
        <p className="pied-menu">Ville de Montbéliard · v1.0 · HTTPS</p>
      </CoucheModale>
      <FeuilleLangue ouverte={langueOuverte} onFermer={() => setLangueOuverte(false)} />
      <FeuilleEtats ouverte={etatsOuverts} onFermer={() => setEtatsOuverts(false)} />
    </>
  )
}
