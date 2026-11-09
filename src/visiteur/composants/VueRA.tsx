import { useCallback, useEffect, useRef, useState } from 'react'
import { DELAI_AFFICHE_NON_RECONNUE_S, DELAI_MONUMENT_NON_RECONNU_S } from '../../commun/constantes'
import { distanceM } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { compterLancement, nomProprietaire, useEtat } from '../../commun/store'
import type { Affiche, Animation, Lieu } from '../../commun/types'
import { usePosition } from '../contexte/position'
import { useCamera, useLuminosite } from '../hooks/capteurs'
import { capturerPhoto, partagerPhoto } from '../services/photo'
import { arreterSon, couperSon, estMuet, jouerTheme } from '../services/son'
import { CoucheModale, EnteteFeuille } from './Couche'
import { FormulaireSignalement, type CibleSignalement } from './FormulaireSignalement'

type Phase = 'recherche' | 'detecte' | 'echec' | 'fin'

// Le moteur de reconnaissance (MindAR / LocAR) sera branché derrière cette vue. En démonstration,
// la détection est simulée : succès automatique, ou forçage d'un état avec le sélecteur « Démo ».
const DELAI_DETECTION_DEMO_MS = 3500

export function VueRA({
  mode,
  lieu,
  animation,
  affiche,
  cameraAutorisee,
  onQuitter,
  onVoirLieu,
  onCameraRefusee,
}: {
  mode: 'monument' | 'affiche'
  lieu: Lieu
  animation: Animation
  affiche?: Affiche
  cameraAutorisee: boolean
  onQuitter: () => void
  onVoirLieu?: () => void
  onCameraRefusee: () => void
}) {
  const { t, tr } = useLangue()
  const etat = useEtat()
  const position = usePosition()
  const lieuVivant = etat.lieux.find((l) => l.id === lieu.id) ?? lieu // score mis à jour en direct (BF-52)
  const { etat: etatCam, flux } = useCamera(cameraAutorisee)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const image = useRef<HTMLImageElement>(null)
  const [phase, setPhase] = useState<Phase>('recherche')
  const [forcage, setForcage] = useState<'auto' | 'recherche'>('auto')
  const [manuel, setManuel] = useState(false)
  const [muet, setMuet] = useState(estMuet())
  const [sousTitres, setSousTitres] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const [cycle, setCycle] = useState(0)
  const [redirection, setRedirection] = useState(false)

  const simulee = etatCam !== 'active'
  const sombre = useLuminosite(video, etatCam === 'active' && phase === 'recherche')
  const delaiEchec = (mode === 'affiche' ? DELAI_AFFICHE_NON_RECONNUE_S : DELAI_MONUMENT_NON_RECONNU_S) * 1000
  const theme = mode === 'affiche' ? 'affiche' : lieu.id === 'stade' ? 'stade' : lieu.id === 'chateau' ? 'chateau' : 'lieu'

  useEffect(() => {
    if (etatCam === 'refusee') onCameraRefusee()
  }, [etatCam, onCameraRefusee])

  useEffect(() => {
    if (video && flux) {
      video.srcObject = flux
      void video.play().catch(() => {})
    }
  }, [video, flux])

  // Recherche : succès simulé, ou échec après 15 s (affiche) / 20 s (monument) — BF-09.
  useEffect(() => {
    if (phase !== 'recherche') return
    const ids: number[] = []
    if (forcage === 'auto') ids.push(window.setTimeout(() => setPhase('detecte'), DELAI_DETECTION_DEMO_MS))
    ids.push(window.setTimeout(() => setPhase('echec'), delaiEchec))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [phase, forcage, delaiEchec, cycle])

  // Animation : son, statistique anonyme de lancement, puis fin.
  useEffect(() => {
    if (phase !== 'detecte') return
    compterLancement(animation.id)
    jouerTheme(theme === 'stade' ? 'stade' : theme === 'affiche' ? 'affiche' : 'cloches')
    const duree = Math.min(animation.dureeS, mode === 'affiche' ? 9 : 30) * 1000
    const id = window.setTimeout(() => setPhase('fin'), duree)
    return () => {
      window.clearTimeout(id)
      arreterSon()
    }
  }, [phase, animation.id, animation.dureeS, mode, theme, cycle])

  // Après l'animation d'affiche : la carte s'ouvre, centrée sur le lieu promu (BF-32).
  useEffect(() => {
    if (mode !== 'affiche' || phase !== 'fin' || !onVoirLieu) return
    setRedirection(true)
    const id = window.setTimeout(onVoirLieu, 6000)
    return () => window.clearTimeout(id)
  }, [mode, phase, onVoirLieu])

  useEffect(() => () => arreterSon(), [])

  const relancer = useCallback(() => {
    setRedirection(false)
    setCycle((c) => c + 1)
    setPhase('detecte')
  }, [])

  function basculerSon() {
    couperSon(!muet)
    setMuet(!muet)
  }

  function prendrePhoto() {
    const titre = mode === 'affiche' ? (affiche?.nom ?? animation.titre) : animation.titre
    setPhoto(
      capturerPhoto({
        source: simulee ? image.current : video,
        theme,
        titre,
        sousTitre: lieu.nom,
        score:
          theme === 'stade'
            ? { a: lieuVivant.equipeDomicile ?? '', b: lieuVivant.equipeExterieur ?? '', sa: lieuVivant.scoreDomicile ?? 0, sb: lieuVivant.scoreExterieur ?? 0 }
            : undefined,
      }),
    )
  }

  const distance = position.coords ? distanceM(position.coords, lieu) : null
  const dansZone = distance !== null && distance <= lieu.rayonM

  const libellePhase =
    phase === 'recherche'
      ? mode === 'affiche'
        ? t('affiche.recherche')
        : t('ra.recherche')
      : phase === 'echec'
        ? t('ra.nonReconnu')
        : phase === 'fin'
          ? t('ra.fin')
          : mode === 'affiche'
            ? t('affiche.detectee')
            : t('ra.detecte')

  const signaler = () =>
    setCible(
      mode === 'affiche' && affiche
        ? { afficheId: affiche.id, nom: `Affiche « ${affiche.nom} »` }
        : { animationId: animation.id, nom: `${animation.titre} — ${lieu.nomCourt}` },
    )

  const enAnimation = phase === 'detecte' || phase === 'fin'

  // ---------------------------------------------------------------- rendu

  const flux_ = (
    <div className="flux-camera">
      {!simulee ? (
        <video ref={setVideo} playsInline muted autoPlay className="video-camera" />
      ) : mode === 'affiche' ? (
        <>
          <img ref={image} src={imageLieu('chateau')} alt="" className="video-camera floue" />
          <AfficheMaquette affiche={affiche} anime={enAnimation} />
        </>
      ) : (
        <img ref={image} src={imageLieu(lieu.image) ?? imageLieu('chateau')} alt="" className="video-camera" />
      )}
      <div className="vignette-camera" />
    </div>
  )

  const barreHaut = (
    <div className="barre-ra">
      <button type="button" onClick={onQuitter} aria-label={t('ra.fermer')}>
        <Icone nom="fermer" taille={19} />
      </button>
      <span className={`statut-ra ${phase}`} role="status">
        {phase === 'recherche' && <span className="point-pulse" />}
        {libellePhase}
      </span>
      <div className="barre-ra-droite">
        <button type="button" onClick={() => setSousTitres(!sousTitres)} aria-pressed={sousTitres} aria-label={t('ra.sousTitres')} className={sousTitres ? 'actif' : ''}>
          <Icone nom="sousTitres" taille={18} />
        </button>
        <button type="button" onClick={basculerSon} aria-pressed={muet} aria-label={muet ? t('ra.muet') : t('ra.son')}>
          <Icone nom={muet ? 'muet' : 'son'} taille={18} />
        </button>
      </div>
    </div>
  )

  const reperes = phase === 'recherche' && (
    <>
      <div className={`reperes ${mode}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className={`ligne-scan ${mode}`} aria-hidden="true" />
    </>
  )

  const puces = (
    <div className="puces-ra">
      {simulee && <span>{t('ra.camSimulee')}</span>}
      {manuel && enAnimation && (
        <span>
          <Icone nom="boussole" taille={12} /> {t('ra.manuel')}
        </span>
      )}
      {sombre && phase === 'recherche' && (
        <span className="alerte">
          <Icone nom="soleil" taille={12} /> {t('ra.lumiere')}
        </span>
      )}
      {phase === 'recherche' && mode === 'monument' && <span>{t('ra.conseilFacade')}</span>}
    </div>
  )

  const sousTitresBloc = sousTitres && enAnimation && (
    <p className="sous-titres" aria-live="polite">
      {tr(animation.transcription)}
    </p>
  )

  const selecteurDemo = (
    <div className="selecteur-demo" role="group" aria-label="Démo">
      <span>Démo</span>
      <button
        type="button"
        className={phase === 'recherche' ? 'actif' : ''}
        onClick={() => {
          setForcage('recherche')
          setManuel(false)
          setCycle((c) => c + 1)
          setPhase('recherche')
        }}
      >
        {t('ra.recherche')}
      </button>
      <button type="button" className={enAnimation ? 'actif' : ''} onClick={relancer}>
        ✓
      </button>
      <button type="button" className={phase === 'echec' ? 'actif' : ''} onClick={() => setPhase('echec')}>
        ✕
      </button>
    </div>
  )

  const feuilles = (
    <>
      <FormulaireSignalement cible={cible} onFermer={() => setCible(null)} />
      <CoucheModale ouverte={!!photo} onFermer={() => setPhoto(null)} etiquette={t('photo.titre')}>
        <EnteteFeuille titre={t('photo.titre')} onFermer={() => setPhoto(null)} libelleFermer={t('commun.fermer')} />
        {photo && <img className="apercu-photo" src={photo} alt={t('photo.titre')} />}
        <div className="actions-photo">
          <a className="btn btn-secondaire" href={photo ?? undefined} download="montbeliard-ra.jpg">
            <Icone nom="telecharger" taille={17} />
            {t('photo.enregistrer')}
          </a>
          <button type="button" className="btn btn-primaire" onClick={() => photo && void partagerPhoto(photo, animation.titre)}>
            <Icone nom="partager" taille={17} />
            {t('photo.partager')}
          </button>
        </div>
        <p className="note-photo">{t('photo.note')}</p>
      </CoucheModale>
    </>
  )

  // ---------------------------------------------------------------- mode affiche

  if (mode === 'affiche') {
    return (
      <div className="page ecran-ra ecran-affiche">
        <div className="zone-camera-affiche">
          {flux_}
          {barreHaut}
          {reperes}
          {enAnimation && (
            <div className="etincelle-affiche" aria-hidden="true">
              ✦
            </div>
          )}
          {puces}
          {sousTitresBloc}
          <div className="outils-affiche">
            <button type="button" onClick={prendrePhoto} aria-label={t('ra.photo')} disabled={!enAnimation}>
              <Icone nom="appareil" taille={19} />
            </button>
            <button type="button" onClick={relancer} aria-label={t('ra.relancer')} disabled={!enAnimation}>
              <Icone nom="relancer" taille={19} />
            </button>
            <button type="button" onClick={signaler} aria-label={t('ra.signaler')}>
              <Icone nom="drapeau" taille={19} />
            </button>
          </div>
          {selecteurDemo}
        </div>
        <section className="panneau-affiche" aria-live="polite">
          {phase === 'recherche' && (
            <>
              <span className="pill pill-stone">{t('affiche.recherche')}</span>
              <h2>{t('affiche.cadrez')}</h2>
              <p>{t('affiche.conseil')}</p>
              <div className="actions-panneau">
                <button type="button" className="btn btn-secondaire" onClick={relancer}>
                  <Icone nom="scan" taille={17} />
                  {t('affiche.simuler')}
                </button>
              </div>
            </>
          )}
          {phase === 'echec' && (
            <>
              <span className="pill pill-wine">{t('ra.nonReconnu')}</span>
              <h2>{t('erreur.affiche.titre')}</h2>
              <p>{t('erreur.affiche.texte')}</p>
              <div className="actions-panneau">
                <button type="button" className="btn btn-secondaire" onClick={onVoirLieu}>
                  {t('ra.voirCarte')}
                </button>
                <button
                  type="button"
                  className="btn btn-primaire"
                  onClick={() => {
                    setForcage('auto')
                    setCycle((c) => c + 1)
                    setPhase('recherche')
                  }}
                >
                  <Icone nom="relancer" taille={17} />
                  {t('erreur.affiche.action')}
                </button>
              </div>
            </>
          )}
          {enAnimation && (
            <>
              <span className="pill pill-cyan">{t('affiche.detectee')}</span>
              <h2>{t('affiche.prendVie')}</h2>
              <p>
                <strong>{affiche?.nom}</strong> — {affiche?.texte}
              </p>
              {affiche && affiche.proprietaireId !== 'ville' && (
                <p className="proprietaire">{t('affiche.parPartenaire', { nom: nomProprietaire(etat, affiche.proprietaireId) })}</p>
              )}
              <div className="invitation-lieu">
                {imageLieu(lieu.image) && <img src={imageLieu(lieu.image)} alt="" />}
                <div>
                  <small>{t('affiche.invite')}</small>
                  <strong>{lieu.nom}</strong>
                </div>
              </div>
              <div className="actions-panneau">
                <button type="button" className="btn btn-secondaire" onClick={relancer}>
                  <Icone nom="relancer" taille={17} />
                  {t('ra.relancer')}
                </button>
                <button type="button" className="btn btn-primaire" onClick={onVoirLieu}>
                  {t('affiche.voirLieu')}
                  <Icone nom="droite" taille={17} />
                </button>
              </div>
              {redirection && (
                <div className="barre-redirection" aria-hidden="true">
                  <span />
                </div>
              )}
            </>
          )}
        </section>
        {feuilles}
      </div>
    )
  }

  // ---------------------------------------------------------------- mode monument

  return (
    <div className="page ecran-ra">
      {flux_}
      {barreHaut}
      {reperes}

      {enAnimation && theme === 'stade' && (
        <div className="score-ra" aria-label={`${lieuVivant.equipeDomicile} ${lieuVivant.scoreDomicile} – ${lieuVivant.scoreExterieur} ${lieuVivant.equipeExterieur}`}>
          <span>{lieuVivant.competition?.toUpperCase()}</span>
          <div>
            <b>{lieuVivant.equipeDomicile}</b>
            <strong>{lieuVivant.scoreDomicile}</strong>
            <i>–</i>
            <strong>{lieuVivant.scoreExterieur}</strong>
            <b>{lieuVivant.equipeExterieur}</b>
          </div>
          <small>{lieuVivant.minute?.toUpperCase()}</small>
        </div>
      )}
      {enAnimation && theme !== 'stade' && (
        <div className="scene-chateau" aria-hidden="true">
          <div className="arche-lumiere" />
          <span className="neige s1">❄</span>
          <span className="neige s2">❄</span>
          <span className="neige s3">❄</span>
        </div>
      )}
      {enAnimation && (
        <div className="titre-ra">
          <small>{lieu.nomCourt.toUpperCase()}</small>
          <strong>{animation.titre}</strong>
          <span>{tr(lieu.categorie)}</span>
        </div>
      )}

      {puces}
      {sousTitresBloc}

      {phase === 'echec' && (
        <div className="carte-echec" role="alert">
          <span className="icone-echec">
            <Icone nom="boussole" taille={28} />
          </span>
          <h2>{t('ra.monumentNonReconnu')}</h2>
          <p>{dansZone ? t('ra.monumentNonReconnuTexte') : t('ra.horsZone', { r: lieu.rayonM })}</p>
          <button
            type="button"
            className="btn btn-primaire btn-bloc"
            disabled={!dansZone}
            onClick={() => {
              setManuel(true)
              relancer()
            }}
          >
            <Icone nom="boussole" taille={17} />
            {t('ra.lancerManuel')}
          </button>
          {!dansZone && position.etat !== 'accorde' && (
            <button type="button" className="btn btn-secondaire btn-bloc" onClick={position.demander}>
              <Icone nom="pin" taille={16} />
              {t('carte.maPosition')}
            </button>
          )}
          <button
            type="button"
            className="btn-texte btn-bloc clair"
            onClick={() => {
              setForcage('auto')
              setCycle((c) => c + 1)
              setPhase('recherche')
            }}
          >
            {t('ra.reessayer')}
          </button>
        </div>
      )}

      {phase === 'fin' && (
        <div className="carte-echec carte-fin" role="status">
          <span className="icone-echec">
            <Icone nom="etoile" taille={28} />
          </span>
          <h2>{t('ra.fin')}</h2>
          <p>{t('ra.finTexte')}</p>
          <div className="actions-panneau">
            <button type="button" className="btn btn-secondaire" onClick={onQuitter}>
              {t('ra.voirCarte')}
            </button>
            <button type="button" className="btn btn-primaire" onClick={relancer}>
              <Icone nom="relancer" taille={17} />
              {t('ra.relancer')}
            </button>
          </div>
        </div>
      )}

      {selecteurDemo}

      <div className="controles-ra">
        <button type="button" onClick={basculerSon} aria-pressed={muet}>
          <Icone nom={muet ? 'muet' : 'son'} taille={22} />
          <small>{muet ? t('ra.muet') : t('ra.son')}</small>
        </button>
        <button type="button" onClick={relancer} disabled={phase === 'recherche'}>
          <Icone nom="relancer" taille={22} />
          <small>{t('ra.relancer')}</small>
        </button>
        <button type="button" className="capture" onClick={prendrePhoto} aria-label={t('ra.photo')} disabled={!enAnimation}>
          <Icone nom="appareil" taille={24} />
        </button>
        <button type="button" onClick={signaler}>
          <Icone nom="drapeau" taille={22} />
          <small>{t('ra.signaler')}</small>
        </button>
        <button type="button" onClick={() => setSousTitres(!sousTitres)} aria-pressed={sousTitres}>
          <Icone nom="sousTitres" taille={22} />
          <small>{t('ra.sousTitres')}</small>
        </button>
      </div>
      {feuilles}
    </div>
  )
}

/** Affiche imprimée vue par la caméra simulée (maquette « poster-mock »). */
function AfficheMaquette({ affiche, anime }: { affiche?: Affiche; anime: boolean }) {
  return (
    <div className={`affiche-maquette ${anime ? 'anime' : ''}`} aria-hidden="true">
      <small>{affiche?.accroche ?? 'Montbéliard présente'}</small>
      <strong>{affiche?.nom ?? 'Noël au château'}</strong>
      <span>{anime ? '✦ ✦ ✦' : 'Une histoire prend vie'}</span>
      <div className="faux-qr">
        <Icone nom="qr" taille={34} />
      </div>
    </div>
  )
}
