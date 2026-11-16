import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { DELAI_AFFICHE_NON_RECONNUE_S, DELAI_MONUMENT_NON_RECONNU_S, PLACEMENT_LIEU_DEFAUT } from '../../commun/constantes'
import { distanceM } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { compterLancement } from '../../commun/store'
import type { Affiche, Animation, CibleImage, Lieu, PlacementGps } from '../../commun/types'
import { usePosition } from '../contexte/position'
import { AfficheAvecQr, QR_DEFAUT } from '../../commun/AfficheQr'
import { useCamera, useLuminosite } from '../hooks/capteurs'
import { appareilMobile } from '../ra/moteur'
import { capturerPhoto, partagerPhoto } from '../services/photo'
import { useDonneesPubliques } from '../donneesPubliques'
import { arreterSon, couperSon, estMuet, jouerFichier } from '../services/son'
import { CoucheModale, EnteteFeuille } from './Couche'
import { FormulaireSignalement, type CibleSignalement } from './FormulaireSignalement'
import type { CommandesScene, EvenementScene } from './SceneRA'

type Phase = 'recherche' | 'detecte' | 'echec' | 'fin'

// Three.js et le moteur 8th Wall ne sont chargés qu'à l'ouverture de la caméra (section 9.2).
const SceneRA = lazy(() => import('./SceneRA'))
const ModeleSimule = lazy(() => import('./ModeleSimule'))

/** Aperçu simulé (ordinateur, caméra refusée) : l'animation démarre sans reconnaissance. */
const DELAI_SIMULATION_MS = 800
/** Affiche sans cible de reconnaissance : l'animation est posée devant le visiteur. */
const DELAI_SANS_CIBLE_MS = 1500
/** Lieu sans photo de façade : délai avant le placement GPS (quelques mesures de la boussole). */
const DELAI_PLACEMENT_GPS_MS = 2500

/**
 * Expérience de réalité augmentée (affiche ou monument). Sur smartphone, le moteur 8th Wall reconnaît
 * l'affiche ou un détail de la façade, y pose l'animation 3D, puis le SLAM la garde en place dans
 * l'environnement du visiteur. Sans reconnaissance : conseils, puis pose devant le visiteur (affiche)
 * ou à sa position GPS en 3D (lieu : position, hauteur, orientation et taille réglées dans le
 * back-office, sinon position du lieu). Sur ordinateur : aperçu simulé.
 */
export function VueRA({
  mode,
  lieu,
  animation,
  affiche,
  cibles = [],
  proprietaire,
  cameraAutorisee,
  onQuitter,
  onVoirLieu,
  onCameraRefusee,
}: {
  mode: 'monument' | 'affiche'
  lieu: Lieu
  animation: Animation
  affiche?: Affiche
  /** Cibles de reconnaissance 8th Wall : visuel de l'affiche, ou détails de la façade du lieu. */
  cibles?: CibleImage[]
  /** Structure propriétaire de l'affiche (partenaire ou Ville), renvoyée par l'API publique. */
  proprietaire?: string
  cameraAutorisee: boolean
  onQuitter: () => void
  onVoirLieu?: () => void
  onCameraRefusee: () => void
}) {
  const { t, tr } = useLangue()
  const etat = useDonneesPubliques()
  const position = usePosition()
  const lieuVivant = etat.lieux.find((l) => l.id === lieu.id) ?? lieu // score mis à jour en direct (BF-52)

  // Moteur de RA sur smartphone ; s'il échoue (navigateur incompatible), repli sur l'aperçu simulé.
  const [moteurEnPanne, setMoteurEnPanne] = useState(false)
  const moteur = cameraAutorisee && appareilMobile() && !moteurEnPanne
  const commandes = useRef<CommandesScene>(null)
  const [cameraPrete, setCameraPrete] = useState(false)
  const [suiviNormal, setSuiviNormal] = useState(true)
  const [sombreMoteur, setSombreMoteur] = useState(false)
  const [modeleIndisponible, setModeleIndisponible] = useState(false)
  /** Animation hors du champ de la caméra : côté vers lequel tourner le téléphone. */
  const [direction, setDirection] = useState<'gauche' | 'droite' | null>(null)
  const [sansBoussole, setSansBoussole] = useState(false)

  // Sans moteur : caméra de la page (webcam) et modèle superposé.
  const { etat: etatCam, flux } = useCamera(cameraAutorisee && !moteur)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const image = useRef<HTMLImageElement>(null)
  const [phase, setPhase] = useState<Phase>('recherche')
  const [manuel, setManuel] = useState(false)
  const [muet, setMuet] = useState(estMuet())
  const [sousTitres, setSousTitres] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const [cycle, setCycle] = useState(0)
  const [redirection, setRedirection] = useState(false)

  const simulee = !moteur && etatCam !== 'active'
  const sombreVideo = useLuminosite(video, !moteur && etatCam === 'active' && phase === 'recherche')
  const sombre = moteur ? sombreMoteur : sombreVideo
  // Habillage : tableau de score si le lieu en a un (BF-52), sinon décor lumineux.
  const theme = mode === 'affiche' ? 'affiche' : lieuVivant.equipeDomicile ? 'stade' : 'lieu'

  useEffect(() => {
    if (etatCam === 'refusee') onCameraRefusee()
  }, [etatCam, onCameraRefusee])

  useEffect(() => {
    if (video && flux) {
      video.srcObject = flux
      void video.play().catch(() => {})
    }
  }, [video, flux])

  const surEvenement = useCallback(
    (e: EvenementScene) => {
      switch (e.type) {
        case 'camera':
          setCameraPrete(true)
          break
        case 'camera-refusee':
          onCameraRefusee()
          break
        case 'incompatible':
        case 'erreur':
          if (e.type === 'erreur') console.warn('[RA] moteur 8th Wall :', e.message)
          setMoteurEnPanne(true)
          break
        case 'modele-indisponible':
          setModeleIndisponible(true)
          break
        case 'cible-trouvee':
          // Affiche ou façade reconnue : l'animation est posée (ou recalée si elle l'était déjà).
          setPhase((p) => (p === 'recherche' || p === 'echec' ? 'detecte' : p))
          setManuel(false)
          break
        case 'suivi':
          setSuiviNormal(e.normal)
          break
        case 'lumiere':
          setSombreMoteur(e.sombre)
          break
        case 'direction':
          setDirection(e.cote)
          break
      }
    },
    [onCameraRefusee],
  )

  // Position du modèle de l'animation de lieu : réglée dans le back-office, sinon celle du lieu.
  const placement: PlacementGps = animation.placement ?? { latitude: lieu.latitude, longitude: lieu.longitude, ...PLACEMENT_LIEU_DEFAUT }
  const distance = position.coords ? distanceM(position.coords, lieu) : null
  const dansZone = distance !== null && distance <= lieu.rayonM
  const gps = position.coords ? { coords: position.coords, precisionM: position.precisionM ?? 15 } : null

  /** Pose l'animation à sa position GPS en 3D ; renvoie false si la caméra ou la position ne sont pas prêtes. */
  const placerParGps = useCallback(() => {
    const r = commandes.current?.poserGps(placement)
    if (!r || r === 'pas-pret') return false
    setSansBoussole(r === 'sans-boussole')
    setManuel(true)
    setRedirection(false)
    setPhase('detecte')
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement.latitude, placement.longitude, placement.hauteurM, placement.orientationDeg, placement.tailleM])

  // Démarrage de la recherche.
  useEffect(() => {
    if (phase !== 'recherche') return
    // Aperçu simulé : l'animation apparaît dès que la vue est prête (le QR code ou le GPS a déclenché l'expérience).
    if (!moteur) {
      const id = window.setTimeout(() => setPhase('detecte'), DELAI_SIMULATION_MS)
      return () => window.clearTimeout(id)
    }
    if (!cameraPrete) return
    // Affiche sans cible (visuel trop petit) : l'animation est posée devant le visiteur.
    if (mode === 'affiche' && !cibles.length) {
      const id = window.setTimeout(() => commandes.current?.poserDevant() && setPhase('detecte'), DELAI_SANS_CIBLE_MS)
      return () => window.clearTimeout(id)
    }
    // Lieu sans photo de façade : dans le rayon, l'animation est posée à sa position GPS en 3D.
    if (mode === 'monument' && !cibles.length && dansZone) {
      const id = window.setTimeout(() => placerParGps() || setPhase('echec'), DELAI_PLACEMENT_GPS_MS)
      return () => window.clearTimeout(id)
    }
    // Sans reconnaissance dans le délai : conseils et solutions de repli (la recherche continue).
    const delai = !cibles.length ? 3 : mode === 'affiche' ? DELAI_AFFICHE_NON_RECONNUE_S : DELAI_MONUMENT_NON_RECONNU_S
    const id = window.setTimeout(() => setPhase('echec'), delai * 1000)
    return () => window.clearTimeout(id)
  }, [phase, cycle, moteur, cameraPrete, mode, cibles.length, dansZone, placerParGps])

  // Animation : son, statistique anonyme de lancement, puis fin.
  useEffect(() => {
    if (phase !== 'detecte') return
    compterLancement(animation.id, mode === 'affiche' ? 'AFFICHE' : manuel ? 'MANUEL' : 'MONUMENT')
    // Son importé avec l'animation (facultatif), joué en boucle pendant sa durée.
    if (animation.sonUrl) jouerFichier(animation.sonUrl, animation.lecture !== 'UNE_FOIS')
    const duree = Math.min(animation.dureeS, mode === 'affiche' ? 20 : 30) * 1000
    const id = window.setTimeout(() => setPhase('fin'), duree)
    return () => {
      window.clearTimeout(id)
      arreterSon()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, animation.id, animation.dureeS, animation.sonUrl, mode, cycle])

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

  const reessayer = useCallback(() => {
    setRedirection(false)
    setManuel(false)
    setCycle((c) => c + 1)
    setPhase('recherche')
  }, [])

  /** Affiche non reconnue : l'animation est posée devant le visiteur, dans son environnement. */
  function poserIci() {
    if (!moteur) return relancer()
    if (commandes.current?.poserDevant()) {
      setRedirection(false)
      setPhase('detecte')
    }
  }

  /** Monument non reconnu : animation posée à sa position GPS en 3D (GPS + boussole). */
  function lancerParPosition() {
    if (!moteur) {
      setManuel(true)
      return relancer()
    }
    placerParGps()
  }

  function basculerSon() {
    couperSon(!muet)
    setMuet(!muet)
  }

  async function prendrePhoto() {
    const titre = mode === 'affiche' ? (affiche?.nom ?? animation.titre) : animation.titre
    let source: HTMLImageElement | HTMLVideoElement | null = simulee ? image.current : video
    // RA : image de la caméra et scène 3D assemblées par le moteur, dans le téléphone.
    if (moteur) {
      const capture = await commandes.current?.photo()
      if (!capture) return
      source = new Image()
      source.src = capture
      await source.decode().catch(() => {})
    }
    setPhoto(
      capturerPhoto({
        source,
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

  const libellePhase =
    phase === 'recherche'
      ? moteur && !cameraPrete
        ? t('ra.demarrage')
        : mode === 'affiche'
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
      {moteur ? (
        <Suspense fallback={<div className="video-camera fond-simule" />}>
          <SceneRA
            animation={animation}
            cibles={cibles}
            mode={mode}
            recherche={phase === 'recherche' || phase === 'echec'}
            cycle={cycle}
            gps={gps}
            commandes={commandes}
            onEvenement={surEvenement}
          />
        </Suspense>
      ) : !simulee ? (
        <video ref={setVideo} playsInline muted autoPlay className="video-camera" />
      ) : mode === 'affiche' ? (
        <>
          {lieu.image ? <img ref={image} src={lieu.image} alt="" className="video-camera floue" /> : <div className="video-camera fond-simule" />}
          <AfficheMaquette affiche={affiche} anime={enAnimation} />
        </>
      ) : lieu.image ? (
        <img ref={image} src={lieu.image} alt="" className="video-camera" />
      ) : (
        <div className="video-camera fond-simule" />
      )}
      <div className="vignette-camera" />
      {!moteur && enAnimation && (
        <Suspense fallback={null}>
          <ModeleSimule animation={animation} cycle={cycle} />
        </Suspense>
      )}
      {modeleIndisponible && <span className="erreur-modele-ra">{t('ra.modeleIndisponible')}</span>}
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
      {moteur && enAnimation && direction && (
        <span>
          <Icone nom={direction === 'gauche' ? 'gauche' : 'droite'} taille={12} /> {direction === 'gauche' ? t('ra.directionGauche') : t('ra.directionDroite')}
        </span>
      )}
      {manuel && enAnimation && sansBoussole && (
        <span className="alerte">
          <Icone nom="boussole" taille={12} /> {t('ra.boussole')}
        </span>
      )}
      {moteur && enAnimation && !suiviNormal && (
        <span className="alerte">
          <Icone nom="scan" taille={12} /> {mode === 'affiche' ? t('ra.suiviPerduAffiche') : t('ra.suiviPerduFacade')}
        </span>
      )}
      {sombre && phase === 'recherche' && (
        <span className="alerte">
          <Icone nom="soleil" taille={12} /> {t('ra.lumiere')}
        </span>
      )}
      {phase === 'recherche' && mode === 'monument' && cibles.length > 0 && <span>{t('ra.conseilFacade')}</span>}
    </div>
  )

  const sousTitresBloc = sousTitres && enAnimation && (
    <p className="sous-titres" aria-live="polite">
      {tr(animation.transcription)}
    </p>
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
            <button type="button" onClick={() => void prendrePhoto()} aria-label={t('ra.photo')} disabled={!enAnimation}>
              <Icone nom="appareil" taille={19} />
            </button>
            <button type="button" onClick={relancer} aria-label={t('ra.relancer')} disabled={!enAnimation}>
              <Icone nom="relancer" taille={19} />
            </button>
            <button type="button" onClick={signaler} aria-label={t('ra.signaler')}>
              <Icone nom="drapeau" taille={19} />
            </button>
          </div>
        </div>
        <section className="panneau-affiche" aria-live="polite">
          {phase === 'recherche' && (
            <>
              <span className="pill pill-stone">{t('affiche.recherche')}</span>
              <h2>{t('affiche.cadrez')}</h2>
              <p>{t('affiche.conseil')}</p>
              <div className="actions-panneau">
                <button type="button" className="btn btn-secondaire" onClick={poserIci} disabled={moteur && !cameraPrete}>
                  <Icone nom={moteur ? 'cube' : 'scan'} taille={17} />
                  {moteur ? t('ra.poserIci') : t('affiche.simuler')}
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
                <button type="button" className="btn btn-secondaire" onClick={poserIci}>
                  <Icone nom="cube" taille={17} />
                  {t('ra.poserIci')}
                </button>
                <button type="button" className="btn btn-primaire" onClick={reessayer}>
                  <Icone nom="relancer" taille={17} />
                  {t('erreur.affiche.action')}
                </button>
              </div>
              <button type="button" className="btn-texte btn-bloc" onClick={onVoirLieu}>
                {t('ra.voirCarte')}
              </button>
            </>
          )}
          {enAnimation && (
            <>
              <span className="pill pill-cyan">{t('affiche.detectee')}</span>
              <h2>{t('affiche.prendVie')}</h2>
              <p>
                <strong>{affiche?.nom}</strong> — {affiche?.texte}
              </p>
              {affiche && affiche.proprietaireId !== 'ville' && proprietaire && <p className="proprietaire">{t('affiche.parPartenaire', { nom: proprietaire })}</p>}
              <div className="invitation-lieu">
                {lieu.image && <img src={lieu.image} alt="" />}
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
      {/* Décor lumineux de l'aperçu simulé (en RA, le modèle 3D est posé dans la scène réelle). */}
      {enAnimation && simulee && theme !== 'stade' && (
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
          <button type="button" className="btn btn-primaire btn-bloc" disabled={!dansZone} onClick={lancerParPosition}>
            <Icone nom="boussole" taille={17} />
            {t('ra.lancerManuel')}
          </button>
          {!dansZone && position.etat !== 'accorde' && (
            <button type="button" className="btn btn-secondaire btn-bloc" onClick={position.demander}>
              <Icone nom="pin" taille={16} />
              {t('carte.maPosition')}
            </button>
          )}
          {cibles.length > 0 && (
            <button type="button" className="btn-texte btn-bloc clair" onClick={reessayer}>
              {t('ra.reessayer')}
            </button>
          )}
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

      <div className="controles-ra">
        <button type="button" onClick={basculerSon} aria-pressed={muet}>
          <Icone nom={muet ? 'muet' : 'son'} taille={22} />
          <small>{muet ? t('ra.muet') : t('ra.son')}</small>
        </button>
        <button type="button" onClick={relancer} disabled={!enAnimation}>
          <Icone nom="relancer" taille={22} />
          <small>{t('ra.relancer')}</small>
        </button>
        <button type="button" className="capture" onClick={() => void prendrePhoto()} aria-label={t('ra.photo')} disabled={!enAnimation}>
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
  const image = affiche?.image?.url
  if (affiche && image) {
    const ratio = affiche.image ? affiche.image.largeur / affiche.image.hauteur : 297 / 420
    return (
      <div className={`affiche-maquette importee ${anime ? 'anime' : ''}`} aria-hidden="true" style={{ aspectRatio: String(ratio), height: 'auto', width: ratio > 1 ? 250 : 168, marginLeft: ratio > 1 ? -125 : -84 }}>
        <AfficheAvecQr image={image} ratio={ratio} code={affiche.codeQr} qr={affiche.qr ?? QR_DEFAUT} nom={affiche.nom} />
      </div>
    )
  }
  return (
    <div className={`affiche-maquette ${anime ? 'anime' : ''}`} aria-hidden="true">
      <small>{affiche?.accroche}</small>
      <strong>{affiche?.nom}</strong>
      <span>{anime ? '✦ ✦ ✦' : 'Une histoire prend vie'}</span>
      <div className="faux-qr">
        <Icone nom="qr" taille={34} />
      </div>
    </div>
  )
}
