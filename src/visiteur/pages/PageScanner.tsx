import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { distanceM, formaterDistance } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { positionAffiche, useAffichesDiffusees, useDonneesPubliques } from '../donneesPubliques'
import { Consignes } from '../composants/Consignes'
import { CoucheModale, EnteteFeuille } from '../composants/Couche'
import { BoutonLangue } from '../composants/Feuilles'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { useCamera } from '../hooks/capteurs'
import { codeAfficheDepuisQr, creerLecteurQr, type LecteurQr } from '../services/lectureQr'
import { animationsDuLieu, lieuxVisibles, marquerConsignesVues } from '../utils'

/** Intervalle entre deux lectures de l'image (ms) : réactif sans faire chauffer le téléphone. */
const INTERVALLE_LECTURE_MS = 250
/** Affiche ou monument signalé en bas de l'écran s'il est à moins de cette distance. */
const DISTANCE_INDICE_M = 1500
/** Délai entre « QR code reconnu » et l'ouverture de l'animation : le temps de lire la confirmation. */
const DELAI_OUVERTURE_MS = 700

/** Retour à la page précédente, ou à la carte si le scanner a été ouvert directement (lien, favori). */
function useRetour() {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => (key === 'default' ? navigate('/') : navigate(-1))
}

/**
 * Onglet « Scanner » : la caméra s'ouvre aussitôt, en plein écran, et lit le QR code des affiches. Les
 * indications restent discrètes, en bas de l'écran : une affiche ou un monument à proximité. Sans caméra
 * (refus, appareil sans caméra), la page propose les affiches et les monuments à ouvrir directement.
 */
export default function PageScanner() {
  const [params] = useSearchParams()
  const retour = useRetour()
  // « Revoir les consignes » (menu Plus) : elles s'affichent avant d'ouvrir la caméra.
  const [consignes, setConsignes] = useState(params.get('consignes') === '1')
  const [essai, setEssai] = useState(0)
  if (consignes)
    return (
      <Consignes
        onRetour={retour}
        onTerminer={() => {
          marquerConsignesVues()
          setConsignes(false)
        }}
      />
    )
  return <ScannerCamera key={essai} onReessayer={() => setEssai((n) => n + 1)} />
}

function ScannerCamera({ onReessayer }: { onReessayer: () => void }) {
  const { t } = useLangue()
  const navigate = useNavigate()
  const retour = useRetour()
  const { etat: etatCam, flux } = useCamera(true)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [lecteur, setLecteur] = useState<LecteurQr | null | undefined>(undefined)
  const [reconnu, setReconnu] = useState(false)
  const [etranger, setEtranger] = useState(false)
  const [lampe, setLampe] = useState<boolean | null>(null)
  const minuteurEtranger = useRef<number | null>(null)

  useEffect(() => {
    let actif = true
    void creerLecteurQr().then((l) => actif && setLecteur(l))
    return () => {
      actif = false
    }
  }, [])

  useEffect(() => {
    if (!video || !flux) return
    video.srcObject = flux
    void video.play().catch(() => {})
    // Lampe du téléphone, si la caméra en a une (utile le soir devant une affiche).
    const capacites = flux.getVideoTracks()[0]?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
    setLampe(capacites?.torch ? false : null)
  }, [video, flux])

  const ouvrir = useCallback(
    (code: string) => {
      setReconnu(true)
      navigator.vibrate?.(60)
      window.setTimeout(() => navigate(`/a/${encodeURIComponent(code)}`), DELAI_OUVERTURE_MS)
    },
    [navigate],
  )

  // Lecture de l'image toutes les 250 ms jusqu'à un QR code d'affiche.
  useEffect(() => {
    if (!video || !lecteur || etatCam !== 'active' || reconnu) return
    let arrete = false
    let minuteur = 0
    const lire = async () => {
      if (arrete) return
      if (video.readyState >= 2) {
        try {
          for (const c of await lecteur.detect(video)) {
            const code = codeAfficheDepuisQr(c.rawValue)
            if (code) return ouvrir(code)
            // QR code d'un autre site : signalé, jamais ouvert.
            setEtranger(true)
            if (minuteurEtranger.current) window.clearTimeout(minuteurEtranger.current)
            minuteurEtranger.current = window.setTimeout(() => setEtranger(false), 2500)
          }
        } catch {
          /* image illisible : on réessaie au tour suivant */
        }
      }
      minuteur = window.setTimeout(() => void lire(), INTERVALLE_LECTURE_MS)
    }
    void lire()
    return () => {
      arrete = true
      window.clearTimeout(minuteur)
    }
  }, [video, lecteur, etatCam, reconnu, ouvrir])

  useEffect(() => () => {
    if (minuteurEtranger.current) window.clearTimeout(minuteurEtranger.current)
  }, [])

  function basculerLampe() {
    const piste = flux?.getVideoTracks()[0]
    if (!piste || lampe === null) return
    void piste
      .applyConstraints({ advanced: [{ torch: !lampe } as MediaTrackConstraintSet] })
      .then(() => setLampe(!lampe))
      .catch(() => setLampe(null))
  }

  if (etatCam === 'refusee' || etatCam === 'absente') return <ScannerSansCamera refus={etatCam === 'refusee'} onReessayer={onReessayer} />

  return (
    <div className="page ecran-scanner">
      <video ref={setVideo} className="video-scan" playsInline muted autoPlay aria-hidden="true" />
      <div className="voile-scan" aria-hidden="true" />

      <div className="barre-scan">
        <button type="button" className="bouton-scan" onClick={retour} aria-label={t('scanner.quitter')}>
          <Icone nom="fermer" taille={20} />
        </button>
        <span className="titre-scan">{t('nav.scanner')}</span>
        {lampe !== null ? (
          <button type="button" className={`bouton-scan ${lampe ? 'actif' : ''}`} onClick={basculerLampe} aria-pressed={lampe} aria-label={t('scanner.lampe')}>
            <Icone nom="lampe" taille={20} />
          </button>
        ) : (
          <span className="bouton-scan vide" aria-hidden="true" />
        )}
      </div>

      <div className={`viseur-scan ${reconnu ? 'reconnu' : ''}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        {!reconnu && etatCam === 'active' && lecteur && <span className="balayage-scan" />}
        {reconnu && (
          <span className="coche-scan">
            <Icone nom="check" taille={44} epaisseur={2.6} />
          </span>
        )}
      </div>

      <p className="consigne-scan" role="status" aria-live="polite">
        {reconnu ? (
          <>
            <strong>{t('scanner.reconnu')}</strong>
            <small>{t('scanner.ouverture')}</small>
          </>
        ) : etatCam !== 'active' ? (
          <>
            <span className="spinner" /> {t('scanner.demarrage')}
          </>
        ) : etranger ? (
          <strong className="alerte">{t('scanner.etranger')}</strong>
        ) : lecteur === null ? (
          <>
            <strong>{t('scanner.sansLecteur')}</strong>
            <small>{t('scanner.sansLecteurNote')}</small>
          </>
        ) : (
          <>
            <strong>{t('scanner.viser')}</strong>
            <small>{t('scanner.viserNote')}</small>
          </>
        )}
      </p>

      {!reconnu && <IndicesScan />}
    </div>
  )
}

/**
 * Indications discrètes en bas de l'écran : l'affiche la plus proche, et le monument tout près (ou dans
 * son rayon, avec un accès direct à son animation). Jamais plus de deux, pour laisser voir la caméra.
 */
function IndicesScan() {
  const { t } = useLangue()
  const navigate = useNavigate()
  const etat = useDonneesPubliques()
  const { affiches } = useAffichesDiffusees()
  const { coords } = usePosition()

  const afficheProche = useMemo(() => {
    if (!coords) return null
    return affiches
      .map((a) => ({ a, p: positionAffiche(a) }))
      .filter((x) => x.p)
      .map((x) => ({ a: x.a, d: distanceM(coords, x.p!) }))
      .filter((x) => x.d <= DISTANCE_INDICE_M)
      .sort((x, y) => x.d - y.d)[0]
  }, [affiches, coords])

  const monument = useMemo(() => {
    if (!coords) return null
    return lieuxVisibles(etat)
      .filter((l) => animationsDuLieu(etat, l.id).active)
      .map((l) => ({ l, d: distanceM(coords, l) }))
      .filter((x) => x.d <= Math.max(x.l.rayonM, DISTANCE_INDICE_M))
      .sort((x, y) => x.d - y.d)[0]
  }, [etat, coords])

  return (
    <div className="indices-scan">
      {monument && (
        <button type="button" className={`indice-scan ${monument.d <= monument.l.rayonM ? 'fort' : ''}`} onClick={() => navigate(monument.d <= monument.l.rayonM ? `/lieux/${monument.l.id}/ra` : `/lieux/${monument.l.id}`)}>
          <Icone nom={monument.d <= monument.l.rayonM ? 'cube' : 'pin'} taille={17} />
          <span>
            {monument.d <= monument.l.rayonM ? t('scanner.monumentIci', { lieu: monument.l.nomCourt }) : t('scanner.monumentProche', { lieu: monument.l.nomCourt, d: formaterDistance(monument.d) })}
          </span>
          <Icone nom="droite" taille={15} />
        </button>
      )}
      {afficheProche && (
        <button type="button" className="indice-scan" onClick={() => navigate(`/?repere=${encodeURIComponent(afficheProche.a.codeQr)}`)}>
          <Icone nom="affiche" taille={17} />
          <span>{t('scanner.afficheProche', { nom: afficheProche.a.nom, d: formaterDistance(afficheProche.d) })}</span>
          <Icone nom="droite" taille={15} />
        </button>
      )}
      <BoutonPlusScan />
    </div>
  )
}

/** Caméra refusée ou absente : explication, nouvel essai, et ouverture directe d'une affiche ou d'un monument. */
function ScannerSansCamera({ refus, onReessayer }: { refus: boolean; onReessayer: () => void }) {
  const { t } = useLangue()

  return (
    <div className="page page-defilante page-scanner">
      <div className="entete-mobile">
        <span className="marque-mini" aria-hidden="true">
          M
        </span>
        <BoutonLangue />
      </div>
      <main>
        <div className="sans-camera">
          <span className="icone-erreur">
            <Icone nom="appareil" taille={28} />
          </span>
          <h1>{t('scanner.sansCamera')}</h1>
          <p>{refus ? t('scanner.sansCameraRefus') : t('scanner.sansCameraAbsente')}</p>
          <button type="button" className="btn btn-primaire btn-bloc" onClick={onReessayer}>
            <Icone nom="relancer" taille={17} /> {t('scanner.reessayer')}
          </button>
        </div>

        <ListeAffichesMonuments />
      </main>
      <NavBas />
    </div>
  )
}

/**
 * Toutes les affiches diffusées et tous les monuments, à ouvrir sans scanner : sous le bouton « + » de la
 * caméra, et sur l'écran sans caméra. Les plus proches d'abord quand la position est connue.
 */
function ListeAffichesMonuments({ onChoix }: { onChoix?: () => void }) {
  const { t, tr } = useLangue()
  const navigate = useNavigate()
  const etat = useDonneesPubliques()
  const { affiches } = useAffichesDiffusees()
  const { coords } = usePosition()
  const lieux = useMemo(() => {
    const liste = lieuxVisibles(etat)
    return coords ? [...liste].sort((a, b) => distanceM(coords, a) - distanceM(coords, b)) : liste
  }, [etat, coords])
  const ouvrir = (chemin: string) => {
    onChoix?.()
    navigate(chemin)
  }

  return (
    <>
      {affiches.length > 0 && (
        <>
          <h2 className="sous-titre-section">{t('scanner.sectionAffiches', { n: affiches.length })}</h2>
          {affiches.map((a) => {
            const p = positionAffiche(a)
            const distance = p && coords ? distanceM(coords, p) : null
            return (
              <button key={a.codeQr} type="button" className="choix-scan" onClick={() => ouvrir(`/a/${encodeURIComponent(a.codeQr)}`)}>
                {a.image ? <img src={a.image.url} alt="" /> : <span className="icone-choix"><Icone nom="affiche" taille={24} /></span>}
                <div>
                  <strong>{a.nom}</strong>
                  <small>
                    {a.emplacement ? `${a.emplacement.nom} · ${a.emplacement.adresse}` : t('affiches.emplacementInconnu')}
                    {distance !== null && ` · ${formaterDistance(distance)}`}
                  </small>
                </div>
                <Icone nom="droite" taille={18} />
              </button>
            )
          })}
        </>
      )}

      <h2 className="sous-titre-section">{t('scanner.sectionMonuments', { n: lieux.length })}</h2>
      {lieux.map((l) => {
        const { active } = animationsDuLieu(etat, l.id)
        const distance = coords ? distanceM(coords, l) : null
        // L'animation n'est lancée que dans le rayon du lieu ; ailleurs (ou sans spectacle), sa fiche s'ouvre.
        const dansZone = !!active && distance !== null && distance <= l.rayonM
        return (
          <button key={l.id} type="button" className="choix-scan" onClick={() => ouvrir(dansZone ? `/lieux/${l.id}/ra` : `/lieux/${l.id}`)}>
            {l.image ? <img src={l.image} alt="" /> : <span className="icone-choix"><Icone nom="pin" taille={24} /></span>}
            <div>
              <strong>{l.nom}</strong>
              <small>
                {active ? active.titre : t('carte.aucunSpectacle')} · {tr(l.categorie)}
                {distance !== null && ` · ${formaterDistance(distance)}`}
              </small>
              {active && <small className={dansZone ? 'dans-zone' : ''}>{dansZone ? t('carte.dansZone') : t('carte.horsZone', { r: l.rayonM })}</small>}
            </div>
            <Icone nom={dansZone ? 'scan' : 'droite'} taille={18} />
          </button>
        )
      })}
    </>
  )
}

/** Bouton « + » de la caméra : toutes les affiches et tous les monuments dans une feuille. */
function BoutonPlusScan() {
  const { t } = useLangue()
  const [ouvert, setOuvert] = useState(false)
  const fermer = useCallback(() => setOuvert(false), [])
  return (
    <>
      <button type="button" className="bouton-plus-scan" onClick={() => setOuvert(true)} aria-haspopup="dialog">
        <span aria-hidden="true">
          <Icone nom="plus" taille={22} epaisseur={2.6} />
        </span>
        {t('scanner.plus')}
      </button>
      <CoucheModale ouverte={ouvert} onFermer={fermer} etiquette={t('scanner.plus')}>
        <EnteteFeuille titre={t('scanner.plus')} onFermer={fermer} libelleFermer={t('commun.fermer')} />
        <p className="feuille-intro">{t('scanner.plusAide')}</p>
        <div className="liste-plus-scan">
          <ListeAffichesMonuments onChoix={fermer} />
        </div>
      </CoucheModale>
    </>
  )
}
