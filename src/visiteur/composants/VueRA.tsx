import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { DELAI_AFFICHE_NON_RECONNUE_S, PLACEMENT_LIEU_DEFAUT } from '../../commun/constantes'
import { capVers, distanceM } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { compterLancement } from '../../commun/store'
import type { Affiche, Animation, CibleImage, Lieu, PlacementGps } from '../../commun/types'
import { usePosition } from '../contexte/position'
import { AfficheAvecQr, QR_DEFAUT } from '../../commun/AfficheQr'
import { geometrieAffiche } from '../../commun/impression'
import { useCamera, useLuminosite } from '../hooks/capteurs'
import { appareilMobile } from '../ra/moteur'
import { capturerPhoto, partagerPhoto } from '../services/photo'
import { useDonneesPubliques } from '../donneesPubliques'
import { arreterSon, couperSon, estMuet, jouerFichier } from '../services/son'
import { useCap } from '../hooks/cap'
import { CoucheModale, EnteteFeuille } from './Couche'
import { FormulaireSignalement, type CibleSignalement } from './FormulaireSignalement'
import { FlecheBord, GuideBoussole } from './GuideDirection'
import type { CommandesScene, CoteDirection, EvenementScene } from './SceneRA'

type Phase = 'recherche' | 'detecte' | 'echec' | 'fin'

// Three.js et le moteur 8th Wall ne sont chargés qu'à l'ouverture de la caméra (section 9.2).
const SceneRA = lazy(() => import('./SceneRA'))
const ModeleSimule = lazy(() => import('./ModeleSimule'))

/** Aperçu simulé (ordinateur, caméra refusée) : l'animation démarre sans reconnaissance. */
const DELAI_SIMULATION_MS = 800
/** Affiche sans cible de reconnaissance : l'animation est posée devant le visiteur. */
const DELAI_SANS_CIBLE_MS = 1500
/** Zoom maximal de l'affichage (agrandissement de l'image de la caméra). */
const ZOOM_MAX = 4
/** Monument : délai avant le placement GPS automatique (quelques mesures de la boussole). */
const DELAI_PLACEMENT_GPS_MS = 2500

/**
 * Expérience de réalité augmentée (affiche ou monument). Sur smartphone, le moteur 8th Wall reconnaît
 * l'affiche et y pose l'animation 3D, ou la pose au point GPS du monument ; le SLAM la garde en place dans
 * l'environnement du visiteur. Sans reconnaissance : conseils, puis pose devant le visiteur (affiche)
 * ou à sa position GPS en 3D (lieu : position, hauteur, orientation et taille réglées dans le
 * back-office, sinon position du lieu). Sur ordinateur : aperçu simulé.
 *
 * Suites des tests utilisateurs : la caméra occupe tout l'écran (zoom « plein écran » par défaut, panneau
 * réduit au-dessus de l'image), l'animation ne se ferme jamais d'elle-même (le visiteur choisit « Voir le
 * lieu ») et, au monument, une boussole puis des flèches indiquent où regarder.
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
  /** Cible de reconnaissance 8th Wall du visuel de l'affiche (aucune pour un monument : placement GPS). */
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
  /** Animation hors du champ de la caméra : côté vers lequel tourner (ou lever) le téléphone. */
  const [direction, setDirection] = useState<CoteDirection | null>(null)
  // Zoom : 1 = tout le champ de la caméra ; « couverture » = zoom qui remplit l'écran. Par défaut la
  // caméra remplit l'écran (« plein écran ») tant que le visiteur n'a pas zoomé lui-même.
  const [zoom, setZoom] = useState(1)
  const [couverture, setCouverture] = useState(1)
  const zoomManuel = useRef(false)
  const pincement = useRef<{ distance: number; zoom: number } | null>(null)
  const zoomMax = Math.max(ZOOM_MAX, couverture * 2)
  const borner = (z: number) => Math.min(zoomMax, Math.max(1, z))
  const zoomer = (z: number) => {
    zoomManuel.current = true
    setZoom(borner(z))
  }
  useEffect(() => {
    if (!zoomManuel.current) setZoom(Math.max(1, couverture))
  }, [couverture])
  /** Panneau de l'affiche déplié (texte, lieu promu) ; replié, il laisse voir toute la caméra. */
  const [infos, setInfos] = useState(false)
  const [sansBoussole, setSansBoussole] = useState(false)
  /** Affiche : aide « Ça ne marche pas ? » dépliée pendant la recherche. */
  const [aide, setAide] = useState(false)
  /** Affiche : message d'accueil quand l'animation apparaît (ce que l'on voit, comment interagir). */
  const [accueil, setAccueil] = useState(false)
  /** Commandes de zoom montrées à la demande (le pincement à deux doigts marche toujours). */
  const [zoomVisible, setZoomVisible] = useState(mode === 'monument')

  // Sans moteur : caméra de la page (webcam) et modèle superposé.
  const { etat: etatCam, flux } = useCamera(cameraAutorisee && !moteur)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const image = useRef<HTMLImageElement>(null)
  const [phase, setPhase] = useState<Phase>('recherche')
  const [manuel, setManuel] = useState(false)
  const [muet, setMuet] = useState(estMuet())
  const [sousTitres, setSousTitres] = useState(false)
  /** Une animation sans son n'a pas de transcription : pas de bouton « Sous-titres » vide. */
  const aTranscription = !!(animation.transcription.fr || animation.transcription.en || animation.transcription.de).trim()
  const [photo, setPhoto] = useState<string | null>(null)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const [cycle, setCycle] = useState(0)

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

  // Webcam (sans moteur) : même principe, tout le champ visible, zoom qui remplit l'écran calculé ici.
  useEffect(() => {
    if (!video) return
    const mesurer = () => {
      if (!video.videoWidth || !video.clientWidth) return
      const p = video.videoWidth / video.videoHeight
      const [bl, bh] = [video.clientWidth, video.clientHeight]
      const [l, h] = bl / bh > p ? [bh * p, bh] : [bl, bl / p]
      setCouverture(Math.max(bl / l, bh / h))
    }
    video.addEventListener('loadedmetadata', mesurer)
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(video)
    return () => {
      video.removeEventListener('loadedmetadata', mesurer)
      observateur.disconnect()
    }
  }, [video])

  /** Pincer à deux doigts pour zoomer (l'animation reste calée : caméra et 3D sont agrandies ensemble). */
  const gestesZoom = {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return
      const [a, b] = [e.touches[0], e.touches[1]]
      pincement.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom }
    },
    onTouchMove: (e: React.TouchEvent) => {
      const p = pincement.current
      if (!p || e.touches.length !== 2) return
      const [a, b] = [e.touches[0], e.touches[1]]
      zoomer(p.zoom * (Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, p.distance)))
    },
    onTouchEnd: () => {
      pincement.current = null
    },
  }

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
          // Affiche reconnue : l'animation est posée (ou recalée si elle l'était déjà).
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
        case 'cadrage':
          setCouverture(e.couverture)
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
  // « Où regarder ? » : cap et distance du visiteur vers le point où l'animation du monument apparaît.
  const cap = useCap(mode === 'monument')
  const guide = mode === 'monument' && position.coords ? { capCible: capVers(position.coords, placement), distanceM: distanceM(position.coords, placement), hauteurM: placement.hauteurM } : null

  /** Pose l'animation à sa position GPS en 3D ; renvoie false si la caméra ou la position ne sont pas prêtes. */
  const placerParGps = useCallback(() => {
    const r = commandes.current?.poserGps(placement)
    if (!r || r === 'pas-pret') return false
    setSansBoussole(r === 'sans-boussole')
    setManuel(true)
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
    // Monument : uniquement le point GPS. Dans le rayon, l'animation est posée automatiquement à sa
    // position (ou au geste du visiteur si elle se lance à la main) ; hors du rayon, la carte d'invite
    // indique la distance à parcourir.
    if (mode === 'monument') {
      const auto = dansZone && animation.declencheur !== 'MANUEL'
      const id = window.setTimeout(() => (auto ? placerParGps() || setPhase('echec') : setPhase('echec')), auto ? DELAI_PLACEMENT_GPS_MS : 600)
      return () => window.clearTimeout(id)
    }
    // Affiche non reconnue dans le délai : conseils et solutions de repli (la recherche continue).
    const id = window.setTimeout(() => setPhase('echec'), DELAI_AFFICHE_NON_RECONNUE_S * 1000)
    return () => window.clearTimeout(id)
  }, [phase, cycle, moteur, cameraPrete, mode, cibles.length, dansZone, placerParGps, animation.declencheur])

  // Monument en lancement automatique : le visiteur entre dans le rayon pendant qu'il attend, l'animation part.
  useEffect(() => {
    if (mode !== 'monument' || phase !== 'echec' || !moteur || !cameraPrete || !dansZone || animation.declencheur === 'MANUEL') return
    const id = window.setTimeout(() => placerParGps(), DELAI_PLACEMENT_GPS_MS)
    return () => window.clearTimeout(id)
  }, [mode, phase, moteur, cameraPrete, dansZone, animation.declencheur, placerParGps])

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

  // Après l'animation d'affiche, la carte centrée sur le lieu promu (BF-32) s'ouvre seulement quand le
  // visiteur le demande (« Voir le lieu ») : la fermeture automatique surprenait (tests utilisateurs).
  // Le modèle reste en place ; le panneau propose de le relancer ou d'aller au lieu.
  useEffect(() => {
    if (phase === 'fin') setInfos(true)
  }, [phase])

  // Affiche : à la première apparition, un court message explique ce qui se passe et comment interagir.
  const accueilVu = useRef(false)
  useEffect(() => {
    if (mode !== 'affiche' || phase !== 'detecte' || accueilVu.current) return
    accueilVu.current = true
    setAide(false)
    setAccueil(true)
  }, [mode, phase])
  useEffect(() => {
    if (!accueil) return
    const id = window.setTimeout(() => setAccueil(false), 7000)
    return () => window.clearTimeout(id)
  }, [accueil])

  useEffect(() => () => arreterSon(), [])

  const relancer = useCallback(() => {
    setCycle((c) => c + 1)
    setPhase('detecte')
  }, [])

  const reessayer = useCallback(() => {
    setManuel(false)
    setCycle((c) => c + 1)
    setPhase('recherche')
  }, [])

  /** Affiche non reconnue : l'animation est posée devant le visiteur, dans son environnement. */
  function poserIci() {
    if (!moteur) return relancer()
    if (commandes.current?.poserDevant()) setPhase('detecte')
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
          : t('ra.recherchePosition')
      : phase === 'echec'
        ? mode === 'monument'
          ? dansZone
            ? t('ra.dansZone')
            : t('ra.loinDuMonument')
          : t('ra.nonReconnu')
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
    <div className="flux-camera" {...gestesZoom}>
      {moteur ? (
        <Suspense fallback={<div className="video-camera fond-simule" />}>
          <SceneRA
            animation={animation}
            cibles={cibles}
            mode={mode}
            hauteurCibleM={affiche?.image ? geometrieAffiche(affiche.format, affiche.image.largeur, affiche.image.hauteur).hauteurCible : undefined}
            recherche={phase === 'recherche' || phase === 'echec'}
            cycle={cycle}
            zoom={zoom}
            gps={gps}
            commandes={commandes}
            onEvenement={surEvenement}
          />
        </Suspense>
      ) : !simulee ? (
        <video ref={setVideo} playsInline muted autoPlay className="video-camera champ-complet" style={{ transform: `scale(${zoom})` }} />
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
        {aTranscription && (
          <button type="button" onClick={() => setSousTitres(!sousTitres)} aria-pressed={sousTitres} aria-label={t('ra.sousTitres')} className={sousTitres ? 'actif' : ''}>
            <Icone nom="sousTitres" taille={18} />
          </button>
        )}
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
    </div>
  )

  const zoomPossible = moteur || !simulee
  const formaterZoom = (z: number) => `${z.toFixed(z < 10 ? 1 : 0).replace('.', ',')}×`
  const commandesZoom = zoomPossible && zoomVisible && (
    <div className="zoom-ra" role="group" aria-label={t('ra.zoom')}>
      <button type="button" onClick={() => zoomer(zoom * 1.25)} disabled={zoom >= zoomMax} aria-label={t('ra.zoomPlus')}>
        <Icone nom="plus" taille={18} />
      </button>
      <span aria-live="polite">{formaterZoom(zoom)}</span>
      <button type="button" onClick={() => zoomer(zoom / 1.25)} disabled={zoom <= 1} aria-label={t('ra.zoomMoins')}>
        <Icone nom="moins" taille={18} />
      </button>
      {couverture > 1.02 && (
        <button type="button" className="zoom-preset" onClick={() => zoomer(zoom > 1.01 ? 1 : couverture)}>
          {zoom > 1.01 ? t('ra.champComplet') : t('ra.pleinEcran')}
        </button>
      )}
    </div>
  )

  const sousTitresBloc = sousTitres && enAnimation && aTranscription && (
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

  // Animation posée hors du cadre : grande flèche sur le bord de l'écran (RA seulement).
  const flecheBord = moteur && enAnimation && direction && <FlecheBord cote={direction} />

  if (mode === 'affiche') {
    // Barre du haut épurée : quitter, et seulement les réglages utiles au moment présent.
    const barreAffiche = (
      <div className="barre-ra">
        <button type="button" onClick={onQuitter} aria-label={t('ra.fermer')}>
          <Icone nom="fermer" taille={19} />
        </button>
        <div className="barre-ra-droite">
          {zoomPossible && (
            <button type="button" onClick={() => setZoomVisible(!zoomVisible)} aria-pressed={zoomVisible} aria-label={t('ra.zoom')} className={zoomVisible ? 'actif' : ''}>
              <Icone nom="recherche" taille={18} />
            </button>
          )}
          {aTranscription && enAnimation && (
            <button type="button" onClick={() => setSousTitres(!sousTitres)} aria-pressed={sousTitres} aria-label={t('ra.sousTitres')} className={sousTitres ? 'actif' : ''}>
              <Icone nom="sousTitres" taille={18} />
            </button>
          )}
          <button type="button" onClick={basculerSon} aria-pressed={muet} aria-label={muet ? t('ra.muet') : t('ra.son')}>
            <Icone nom={muet ? 'muet' : 'son'} taille={18} />
          </button>
        </div>
      </div>
    )

    return (
      <div className="page ecran-ra ecran-affiche">
        {/* Caméra en plein écran ; les indications sont posées dessus, en bas, et prennent peu de place. */}
        <div className="zone-camera-affiche">
          {flux_}
          {barreAffiche}
          {reperes}
          {enAnimation && simulee && (
            <div className="etincelle-affiche" aria-hidden="true">
              ✦
            </div>
          )}
          {puces}
          {flecheBord}
          {sousTitresBloc}
          {commandesZoom}
          {accueil && (
            <div className="accueil-ra" role="status">
              <span className="icone-accueil">
                <Icone nom="etoile" taille={20} />
              </span>
              <div>
                <strong>{t('ra.accueilTitre')}</strong>
                <p>{t('ra.accueilTexte')}</p>
              </div>
              <button type="button" onClick={() => setAccueil(false)}>
                {t('ra.compris')}
              </button>
            </div>
          )}
        </div>

        {/* Recherche de l'affiche : une seule consigne, l'aide est repliée. */}
        {(phase === 'recherche' || phase === 'echec') && (
          <section className={`bulle-ra ${phase === 'echec' ? 'echec' : ''}`} aria-live="polite">
            <h2>
              {phase === 'echec' ? (
                t('erreur.affiche.titre')
              ) : moteur && !cameraPrete ? (
                <>
                  <span className="spinner" /> {t('ra.demarrage')}
                </>
              ) : (
                <>
                  <span className="point-pulse" /> {t('affiche.cadrez')}
                </>
              )}
            </h2>
            <p>{phase === 'echec' ? t('erreur.affiche.texte') : t('affiche.conseil')}</p>
            {(aide || phase === 'echec') && (
              <div className="actions-panneau">
                <button type="button" className="btn btn-secondaire" onClick={poserIci} disabled={moteur && !cameraPrete}>
                  <Icone nom={moteur ? 'cube' : 'scan'} taille={17} />
                  {moteur ? t('ra.poserIci') : t('affiche.simuler')}
                </button>
                {phase === 'echec' && (
                  <button type="button" className="btn btn-primaire" onClick={reessayer}>
                    <Icone nom="relancer" taille={17} />
                    {t('erreur.affiche.action')}
                  </button>
                )}
              </div>
            )}
            {phase === 'recherche' && !aide && (
              <button type="button" className="lien-aide-ra" onClick={() => setAide(true)}>
                <Icone nom="aide" taille={15} /> {t('ra.besoinAide')}
              </button>
            )}
            {phase === 'echec' && (
              <button type="button" className="lien-aide-ra" onClick={onVoirLieu}>
                <Icone nom="carte" taille={15} /> {t('ra.voirCarte')}
              </button>
            )}
          </section>
        )}

        {/* L'animation est là : le titre, les informations à la demande, des commandes libellées. */}
        {enAnimation && (
          <section className={`panneau-affiche ${infos ? 'deplie' : ''}`} aria-live="polite">
            <button type="button" className="tete-panneau" onClick={() => setInfos(!infos)} aria-expanded={infos}>
              <span>
                {phase === 'fin' ? <small>{t('ra.finAffiche')}</small> : affiche?.accroche && <small>{affiche.accroche}</small>}
                <strong>{affiche?.nom ?? t('affiche.prendVie')}</strong>
              </span>
              <span className="bascule-infos">
                {infos ? t('ra.moinsInfos') : t('ra.plusInfos')}
                <Icone nom={infos ? 'bas' : 'haut'} taille={15} />
              </span>
            </button>
            {infos && (
              <div className="infos-affiche">
                {affiche?.texte && <p>{affiche.texte}</p>}
                {affiche && affiche.proprietaireId !== 'ville' && proprietaire && <p className="proprietaire">{t('affiche.parPartenaire', { nom: proprietaire })}</p>}
                <div className="invitation-lieu">
                  {lieu.image && <img src={lieu.image} alt="" />}
                  <div>
                    <small>{t('affiche.invite')}</small>
                    <strong>{lieu.nom}</strong>
                  </div>
                </div>
              </div>
            )}
            <div className="commandes-affiche">
              <button type="button" onClick={relancer}>
                <Icone nom="relancer" taille={20} />
                <span>{t('ra.relancer')}</span>
              </button>
              <button type="button" onClick={() => void prendrePhoto()}>
                <Icone nom="appareil" taille={20} />
                <span>{t('ra.photo')}</span>
              </button>
              <button type="button" onClick={signaler}>
                <Icone nom="drapeau" taille={20} />
                <span>{t('ra.signaler')}</span>
              </button>
            </div>
            <button type="button" className="btn btn-primaire btn-bloc" onClick={onVoirLieu}>
              <Icone nom="pin" taille={17} />
              {t('affiche.voirLieuNom', { lieu: lieu.nomCourt || lieu.nom })}
              <Icone nom="droite" taille={17} />
            </button>
          </section>
        )}
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
      {flecheBord}
      {sousTitresBloc}
      {commandesZoom}

      {/* Placement en cours : la boussole montre déjà où l'animation va apparaître. */}
      {phase === 'recherche' && dansZone && guide && (
        <div className="guide-flottant">
          <GuideBoussole cap={cap} {...guide} compact />
        </div>
      )}

      {phase === 'echec' && (
        <div className={`carte-echec ${dansZone ? 'avec-guide' : ''}`} role="alert">
          {!(dansZone && guide) && (
            <span className="icone-echec">
              <Icone nom={dansZone ? 'boussole' : 'pin'} taille={28} />
            </span>
          )}
          <h2>{dansZone ? t('ra.monumentNonReconnu') : t('ra.loinDuMonument')}</h2>
          <p>{dansZone ? t('ra.monumentNonReconnuTexte') : t('ra.horsZone', { r: lieu.rayonM })}</p>
          {dansZone && guide && <GuideBoussole cap={cap} {...guide} />}
          <button type="button" className="btn btn-primaire btn-bloc" disabled={!dansZone} onClick={lancerParPosition}>
            <Icone nom="boussole" taille={17} />
            {t('ra.lancerManuel')}
          </button>
          {/* Hors du lieu (essai, préparation) : aperçu de l'animation posée devant le visiteur. */}
          {!dansZone && moteur && (
            <button type="button" className="btn btn-secondaire btn-bloc" onClick={poserIci}>
              <Icone nom="cube" taille={16} />
              {t('ra.apercuIci')}
            </button>
          )}
          {!dansZone && position.etat !== 'accorde' && (
            <button type="button" className="btn btn-secondaire btn-bloc" onClick={position.demander}>
              <Icone nom="pin" taille={16} />
              {t('carte.maPosition')}
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
        {aTranscription && (
          <button type="button" onClick={() => setSousTitres(!sousTitres)} aria-pressed={sousTitres}>
            <Icone nom="sousTitres" taille={22} />
            <small>{t('ra.sousTitres')}</small>
          </button>
        )}
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
