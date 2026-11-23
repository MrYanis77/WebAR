import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { distanceM, formaterDistance, minutesAPied, type Coordonnees } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { useAffichePublique, useDonneesPubliques } from '../donneesPubliques'
import type { Lieu } from '../../commun/types'
import type { CentrageCarte } from '../composants/CarteLieux'
import { CoucheModale } from '../composants/Couche'
import { BoutonLangue, FeuilleMenu } from '../composants/Feuilles'
import { FormulaireSignalement, type CibleSignalement } from '../composants/FormulaireSignalement'
import { MessageErreur } from '../composants/MessageErreur'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { calculerItineraire, distanceRestante, lienNavigation, type EtapeItineraire, type Itineraire, type ModeTrajet } from '../services/itineraire'
import type { NomIcone } from '../../commun/Icone'
import { animationsDuLieu, lieuxVisibles } from '../utils'

// MapLibre est chargé à part pour garder un code initial léger.
const CarteLieux = lazy(() => import('../composants/CarteLieux'))

const GARE: Coordonnees = { latitude: 47.51035, longitude: 6.80345 }
const DISTANCE_MAX_M = 60_000
const MODES: { mode: ModeTrajet; icone: NomIcone }[] = [
  { mode: 'pied', icone: 'pieton' },
  { mode: 'velo', icone: 'velo' },
  { mode: 'voiture', icone: 'voiture' },
]
const ICONE_MANOEUVRE: Record<EtapeItineraire['manoeuvre'], NomIcone> = {
  depart: 'pin',
  arrivee: 'drapeau',
  gauche: 'tournerGauche',
  droite: 'tournerDroite',
  'tout-droit': 'toutDroit',
  'demi-tour': 'demiTour',
  'rond-point': 'rondPoint',
}
/** Écart au tracé au-delà duquel l'itinéraire est recalculé (visiteur sorti du chemin). */
const ECART_RECALCUL_M = 60

type Resultats = Partial<Record<ModeTrajet, Itineraire>>
type EtatItineraire =
  | { statut: 'attente-position' | 'calcul'; lieuId: string }
  | { statut: 'loin'; lieuId: string; distance: number }
  | { statut: 'pret'; lieuId: string; resultats: Resultats; depart: Coordonnees; calculeLe: number }

/** Grand écran : la carte occupe toute la largeur, la fiche flotte à gauche. */
function useLarge() {
  const [large, setLarge] = useState(() => window.matchMedia('(min-width: 700px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)')
    const f = () => setLarge(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return large
}

export default function PageCarte() {
  const { t, tr, date, langue } = useLangue()
  const etat = useDonneesPubliques()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const position = usePosition()
  const lieux = useMemo(() => lieuxVisibles(etat), [etat])

  const lieuParam = params.get('lieu')
  const codeAffiche = params.get('affiche')
  // Arrivée depuis une affiche : son nom est relu dans le cache de la requête publique.
  const affichePromo = useAffichePublique(codeAffiche).donnees?.affiche

  const [selection, setSelection] = useState<string | null>(() => lieuParam ?? lieux[0]?.id ?? null)
  const [centrage, setCentrage] = useState<CentrageCarte | null>(null)
  const [menu, setMenu] = useState(false)
  const [erreurPosition, setErreurPosition] = useState(false)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const [attenteCentrage, setAttenteCentrage] = useState(false)
  const [repliee, setRepliee] = useState(false)
  const [itin, setItin] = useState<EtatItineraire | null>(null)
  const [mode, setMode] = useState<ModeTrajet>('pied')
  const requete = useRef<AbortController | null>(null)
  const large = useLarge()

  const centrerSur = useCallback((l: Lieu, zoom?: number) => {
    setCentrage({ longitude: l.longitude, latitude: l.latitude, cle: `${l.id}-${Date.now()}`, zoom })
  }, [])

  // Arrivée depuis une affiche : carte centrée sur le lieu promu (BF-32, BF-33).
  useEffect(() => {
    const l = lieux.find((x) => x.id === lieuParam)
    if (!l) return
    setSelection(l.id)
    centrerSur(l, 16)
  }, [lieuParam, lieux, centrerSur])

  // Recentre sur le visiteur dès que la position arrive après un appui sur « Ma position ».
  useEffect(() => {
    if (!attenteCentrage || !position.coords) return
    setCentrage({ ...position.coords, cle: `moi-${Date.now()}`, zoom: 16 })
    setAttenteCentrage(false)
  }, [attenteCentrage, position.coords])

  useEffect(() => {
    const refus = position.etat === 'refuse' || position.etat === 'indisponible'
    if (refus && (attenteCentrage || itin?.statut === 'attente-position')) {
      setAttenteCentrage(false)
      setItin(null)
      setErreurPosition(true)
    }
  }, [attenteCentrage, itin?.statut, position.etat])

  const lieu = lieux.find((l) => l.id === selection) ?? lieux[0]
  const { active, prochaines } = lieu ? animationsDuLieu(etat, lieu.id) : { active: undefined, prochaines: [] }
  const distance = lieu && position.coords ? distanceM(position.coords, lieu) : null
  const dansZone = !!lieu && distance !== null && distance <= lieu.rayonM

  // ---------------------------------------------------------------- itinéraire

  /** Calcule les trois modes en parallèle : le visiteur compare les temps de trajet d'un coup d'œil. */
  const lancerCalcul = useCallback(
    (l: Lieu, depart: Coordonnees) => {
      const d = distanceM(depart, l)
      if (d > DISTANCE_MAX_M) {
        setItin({ statut: 'loin', lieuId: l.id, distance: d })
        return
      }
      requete.current?.abort()
      const ctrl = new AbortController()
      requete.current = ctrl
      setItin((precedent) => (precedent?.statut === 'pret' && precedent.lieuId === l.id ? precedent : { statut: 'calcul', lieuId: l.id }))
      const resultats: Resultats = {}
      for (const { mode: m } of MODES) {
        calculerItineraire(depart, l, langue, ctrl.signal, m)
          .then((r) => {
            if (ctrl.signal.aborted) return
            resultats[m] = r
            setItin({ statut: 'pret', lieuId: l.id, resultats: { ...resultats }, depart, calculeLe: Date.now() })
          })
          .catch(() => {})
      }
    },
    [langue],
  )

  function demanderItineraire() {
    if (!lieu) return
    setRepliee(false)
    if (position.etat === 'refuse' || position.etat === 'indisponible') {
      setErreurPosition(true)
      return
    }
    if (position.coords) lancerCalcul(lieu, position.coords)
    else {
      setItin({ statut: 'attente-position', lieuId: lieu.id })
      position.demander()
    }
  }

  // La position arrive après la demande d'itinéraire.
  useEffect(() => {
    if (itin?.statut !== 'attente-position' || !position.coords) return
    const l = lieux.find((x) => x.id === itin.lieuId)
    if (l) lancerCalcul(l, position.coords)
  }, [itin, position.coords, lieux, lancerCalcul])

  useEffect(() => () => requete.current?.abort(), [])

  // Arrivée depuis la fiche d'un lieu (« Itinéraire ») : l'itinéraire est lancé directement.
  const itineraireDemande = params.get('itineraire') === '1'
  useEffect(() => {
    if (!itineraireDemande || !lieu || lieu.id !== lieuParam) return
    params.delete('itineraire')
    setParams(params, { replace: true })
    demanderItineraire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraireDemande, lieu?.id, lieuParam])

  function fermerItineraire() {
    requete.current?.abort()
    setItin(null)
    if (lieu) centrerSur(lieu)
  }

  const lieuItin = itin ? lieux.find((l) => l.id === itin.lieuId) : undefined
  const distanceItin = lieuItin && position.coords ? distanceM(position.coords, lieuItin) : null
  const arrive = !!lieuItin && distanceItin !== null && distanceItin <= lieuItin.rayonM
  const activeItin = lieuItin ? animationsDuLieu(etat, lieuItin.id).active : undefined
  const resultat = itin?.statut === 'pret' ? itin.resultats[mode] : undefined
  // Progression le long du tracé : distance restante et écart au chemin prévu.
  const progression = resultat && position.coords && !resultat.approximatif ? distanceRestante(resultat.trace, position.coords) : null

  // Visiteur sorti du chemin : nouveau calcul depuis sa position (au plus toutes les 15 s).
  useEffect(() => {
    if (itin?.statut !== 'pret' || !lieuItin || !position.coords || !progression) return
    if (progression.ecartM > ECART_RECALCUL_M && Date.now() - itin.calculeLe > 15_000) lancerCalcul(lieuItin, position.coords)
  }, [itin, lieuItin, position.coords, progression, lancerCalcul])

  /** Durée affichée : temps restant si le visiteur a avancé, sinon durée totale. */
  function resume(r: Itineraire) {
    const avance = progression && itin?.statut === 'pret' && position.coords && distanceM(itin.depart, position.coords) > 20
    const restanteM = avance ? Math.min(r.distanceM, progression.restanteM) : r.distanceM
    const dureeS = r.dureeS * (r.distanceM > 0 ? restanteM / r.distanceM : 1)
    return { restanteM, dureeS, avance: !!avance }
  }

  // ---------------------------------------------------------------- rendu

  function horaire() {
    if (active) return `${t('lieu.enCours')} · ${active.titre}`
    const p = prochaines[0]
    if (!p) return t('carte.aucunSpectacle')
    const jour = new Date(p.debut).toDateString() === new Date().toDateString()
    return jour ? `${t('commun.ceSoir')}, ${date(p.debut, { hour: '2-digit', minute: '2-digit' })}` : date(p.debut, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function maPosition() {
    if (position.simulee) {
      // Fin de la démonstration : retour à la position réelle du téléphone.
      setAttenteCentrage(true)
      position.demander()
      return
    }
    if (position.etat === 'refuse' || position.etat === 'indisponible') {
      setErreurPosition(true)
      return
    }
    if (position.coords) setCentrage({ ...position.coords, cle: `moi-${Date.now()}`, zoom: 16 })
    else {
      setAttenteCentrage(true)
      position.demander()
    }
  }

  function choisir(id: string) {
    setSelection(id)
    const l = lieux.find((x) => x.id === id)
    if (l && !itin) centrerSur(l)
  }

  const margeBas = large ? 30 : itin ? 380 : repliee ? 250 : 330

  return (
    <div className={`page page-carte ${itin ? 'avec-itineraire' : ''}`}>
      <Suspense fallback={<div className="carte-maplibre chargement" />}>
        <CarteLieux
          lieux={lieux}
          selection={lieu?.id ?? null}
          onSelection={choisir}
          position={position.coords}
          misEnAvant={affichePromo ? lieuParam : null}
          centrage={centrage}
          trace={resultat?.trace ?? null}
          marges={{ haut: 110, bas: margeBas, gauche: large ? 480 : 20 }}
        />
      </Suspense>

      <header className="carte-entete">
        <div>
          <p className="eyebrow">{t('carte.ville')}</p>
          <h1>{t('carte.titre')}</h1>
        </div>
        <div className="carte-entete-actions">
          <BoutonLangue />
          <button type="button" className="bouton-rond" onClick={() => setMenu(true)} aria-label={t('carte.menu')}>
            <Icone nom="info" taille={20} />
          </button>
        </div>
      </header>

      {affichePromo && !itin && (
        <div className="bandeau-promo" role="status">
          <Icone nom="affiche" taille={16} />
          <span>{t('carte.misEnAvant', { nom: affichePromo.nom })}</span>
          <button
            type="button"
            aria-label={t('commun.fermer')}
            onClick={() => {
              params.delete('affiche')
              setParams(params, { replace: true })
            }}
          >
            <Icone nom="fermer" taille={14} />
          </button>
        </div>
      )}

      <div className="panneau-bas">
        <button type="button" className="bouton-position" onClick={maPosition}>
          {position.etat === 'demande' ? <span className="spinner" /> : <Icone nom="pin" taille={16} />}
          {position.etat === 'demande' ? t('carte.recherchePosition') : t('carte.maPosition')}
          {position.simulee && <span className="pill pill-cyan">démo</span>}
        </button>

        {itin && lieuItin ? (
          <section className="fiche-carte fiche-itineraire" aria-label={t('itin.titre')} aria-live="polite">
            <div className="tete-itineraire">
              <span className="icone-itineraire">
                <Icone nom="itineraire" taille={20} />
              </span>
              <div>
                <p className="type-lieu">{t('itin.titre')}</p>
                <h2>{t('itin.vers', { lieu: lieuItin.nomCourt })}</h2>
              </div>
              <button type="button" className="bouton-fermer" onClick={fermerItineraire} aria-label={t('itin.fermer')}>
                <Icone nom="fermer" taille={16} />
              </button>
            </div>

            {(itin.statut === 'calcul' || itin.statut === 'attente-position') && (
              <p className="etat-itineraire">
                <span className="spinner" /> {itin.statut === 'calcul' ? t('itin.calcul') : t('carte.recherchePosition')}
              </p>
            )}

            {itin.statut === 'loin' && (
              <div className="etat-itineraire colonne">
                <p>{t('itin.loin', { d: formaterDistance(itin.distance) })}</p>
                <button
                  type="button"
                  className="btn btn-secondaire btn-bloc"
                  onClick={() => {
                    position.simuler(GARE)
                    lancerCalcul(lieuItin, GARE)
                  }}
                >
                  <Icone nom="pin" taille={16} />
                  {t('itin.demo')}
                </button>
              </div>
            )}

            {itin.statut === 'pret' && (
              <>
                <div className="modes-itineraire" role="radiogroup" aria-label={t('itin.modes')}>
                  {MODES.map(({ mode: m, icone }) => {
                    const r = itin.resultats[m]
                    return (
                      <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                        <Icone nom={icone} taille={18} />
                        <span>{t(`itin.mode.${m}`)}</span>
                        <strong>{r ? `${Math.max(1, Math.round(resume(r).dureeS / 60))} min` : '…'}</strong>
                      </button>
                    )
                  })}
                </div>
                {!resultat ? (
                  <p className="etat-itineraire">
                    <span className="spinner" /> {t('itin.calcul')}
                  </p>
                ) : (
                  (() => {
                    const r = resume(resultat)
                    const minutes = Math.max(1, Math.round(r.dureeS / 60))
                    const heureArrivee = date(new Date(Date.now() + r.dureeS * 1000).toISOString(), { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div className="resume-itineraire">
                        <strong>{r.avance ? t('itin.restant', { d: formaterDistance(r.restanteM), m: minutes }) : t('itin.resume', { d: formaterDistance(r.restanteM), m: minutes })}</strong>
                        <small className="heure-arrivee">
                          <Icone nom="horloge" taille={13} /> {t('itin.arriveeVers', { h: heureArrivee })}
                        </small>
                        {resultat.approximatif && <small>{t('itin.approx')}</small>}
                        {arrive && <small className="arrive">{t('itin.arrive')}</small>}
                      </div>
                    )
                  })()
                )}
                {position.simulee && (
                  <div className="bandeau-demo-position">
                    <span>
                      <Icone nom="pin" taille={14} /> {t('itin.positionDemo')}
                    </span>
                    <button type="button" className="btn-texte" onClick={() => position.demander()}>
                      {t('itin.positionReelle')}
                    </button>
                  </div>
                )}
                {resultat && resultat.etapes.length > 0 && (
                  <ol className="etapes-itineraire" aria-label={t('itin.etapes')}>
                    {resultat.etapes.map((e, i) => (
                      <li key={`${i}-${e.texte}`}>
                        <span className={`manoeuvre ${e.manoeuvre}`}>
                          <Icone nom={ICONE_MANOEUVRE[e.manoeuvre]} taille={14} />
                        </span>
                        <p>{e.texte}</p>
                        {e.distanceM >= 10 && <small>{formaterDistance(e.distanceM)}</small>}
                      </li>
                    ))}
                  </ol>
                )}
                <div className={`fiche-carte-actions ${arrive && activeItin ? 'trois' : ''}`}>
                  <button type="button" className="btn btn-secondaire" onClick={() => position.coords && lancerCalcul(lieuItin, position.coords)} disabled={!position.coords}>
                    <Icone nom="relancer" taille={16} />
                    {t('itin.recalculer')}
                  </button>
                  <a className="btn btn-fantome-carte" href={lienNavigation(lieuItin, mode)} target="_blank" rel="noopener noreferrer">
                    <Icone nom="lien" taille={16} />
                    {t('itin.ouvrirGps')}
                  </a>
                  {arrive && activeItin && (
                    <button type="button" className="btn btn-cyan" onClick={() => navigate(`/lieux/${lieuItin.id}/ra`)}>
                      <Icone nom="scan" taille={18} />
                      {t('carte.scanner')}
                    </button>
                  )}
                </div>
                <p className="note-itineraire">{t('itin.confidentialite')}</p>
              </>
            )}
          </section>
        ) : (
          lieu && (
            <section className={`fiche-carte ${repliee ? 'repliee' : ''}`} aria-label={lieu.nom}>
              <button type="button" className="poignee-bouton" onClick={() => setRepliee(!repliee)} aria-expanded={!repliee} aria-label={repliee ? t('carte.deplier') : t('carte.replier')}>
                <span className="poignee" aria-hidden="true" />
              </button>
              <div className="fiche-carte-image">
                {lieu.image ? <img src={lieu.image} alt="" /> : <div className="image-vide" />}
                {active && !repliee && <span className="pill pill-cyan">{t('carte.experienceRA')}</span>}
              </div>
              <div className="fiche-carte-texte">
                <div className="fiche-carte-ligne">
                  <p className="type-lieu">{tr(lieu.categorie)}</p>
                  <button
                    type="button"
                    className="bouton-signaler-mini"
                    aria-label={t('lieu.signaler')}
                    disabled={!active}
                    onClick={() => active && setCible({ animationId: active.id, nom: `${active.titre} — ${lieu.nomCourt}` })}
                  >
                    <Icone nom="drapeau" taille={14} />
                  </button>
                </div>
                <h2>{lieu.nom}</h2>
                <div className="metadonnees">
                  <span>
                    <Icone nom="itineraire" taille={14} />
                    {distance !== null ? `${formaterDistance(distance)} · ${minutesAPied(distance)} min` : t('carte.activerPosition')}
                  </span>
                  {!repliee && (
                    <span>
                      <Icone nom="calendrier" taille={14} />
                      {horaire()}
                    </span>
                  )}
                </div>
              </div>
              {/* Le bouton « Scanner » n'apparaît que dans le rayon du lieu, quand un spectacle est en cours ;
                  ailleurs, l'itinéraire mène jusqu'au lieu. */}
              <div className={`fiche-carte-actions ${dansZone && active ? 'trois' : ''}`}>
                <button type="button" className="btn btn-secondaire" onClick={() => navigate(`/lieux/${lieu.id}`)}>
                  {t('carte.plusInfos')}
                </button>
                <button type="button" className={`btn ${dansZone && active ? 'btn-fantome-carte' : 'btn-primaire'}`} onClick={demanderItineraire}>
                  <Icone nom="itineraire" taille={17} />
                  {t('itin.bouton')}
                </button>
                {dansZone && active && (
                  <button type="button" className="btn btn-cyan" onClick={() => navigate(`/lieux/${lieu.id}/ra`)}>
                    <Icone nom="scan" taille={18} />
                    {t('nav.scanner')}
                  </button>
                )}
              </div>
              {active && !dansZone && !repliee && (
                <p className="note-zone">
                  <Icone nom="zone" taille={13} /> {t('carte.horsZone', { r: lieu.rayonM })}
                </p>
              )}
              {lieux.length > 1 && !repliee && (
                <div className="pagination-lieux" role="tablist" aria-label="Lieux">
                  {lieux.map((l) => (
                    <button key={l.id} type="button" role="tab" aria-selected={l.id === lieu.id} aria-label={l.nom} onClick={() => choisir(l.id)} />
                  ))}
                </div>
              )}
            </section>
          )
        )}
      </div>

      <NavBas />
      <FeuilleMenu ouverte={menu} onFermer={() => setMenu(false)} />
      <FormulaireSignalement cible={cible} onFermer={() => setCible(null)} />
      <CoucheModale ouverte={erreurPosition} onFermer={() => setErreurPosition(false)} etiquette={t('erreur.position.titre')}>
        <MessageErreur
          cas="position"
          onAction={() => {
            setErreurPosition(false)
            position.demander()
            setAttenteCentrage(true)
          }}
          secondaire={{ libelle: t('commun.fermer'), onClick: () => setErreurPosition(false) }}
        />
        {lieu && (
          <button
            type="button"
            className="btn btn-secondaire btn-bloc demo-gare"
            onClick={() => {
              setErreurPosition(false)
              position.simuler(GARE)
              lancerCalcul(lieu, GARE)
            }}
          >
            <Icone nom="itineraire" taille={16} />
            {t('itin.demo')}
          </button>
        )}
      </CoucheModale>
    </div>
  )
}
