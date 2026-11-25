import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { compterScan } from '../../commun/store'
import { Consignes } from '../composants/Consignes'
import { MessageErreur } from '../composants/MessageErreur'
import { VueRA } from '../composants/VueRA'
import { useAffichePublique } from '../donneesPubliques'
import { useCompatibilite } from '../hooks/capteurs'
import { demanderCapteursMouvement, prechargerRA } from '../ra/moteur'
import { deverrouillerSon } from '../services/son'
import { consignesVues, marquerConsignesVues } from '../utils'

/**
 * Entrée par QR code (/a/:code) : consignes (le dernier écran seulement si elles ont déjà été lues),
 * puis « Autoriser et commencer » ouvre la caméra : 8th Wall reconnaît l'affiche, l'animation 3D en
 * surgit et le SLAM la garde en place dans l'environnement du visiteur. Le moteur, le modèle et le son
 * sont téléchargés pendant les consignes. L'animation reste affichée jusqu'à ce que le visiteur choisisse
 * « Voir le lieu » : la carte s'ouvre alors sur le lieu promu (BF-02, BF-16, BF-30 à BF-33).
 */
export default function PageAffiche() {
  const { code = '' } = useParams()
  const { t } = useLangue()
  const navigate = useNavigate()
  const compat = useCompatibilite()
  // L'API vérifie la diffusion (publiée, dans sa période, 4 conditions) : 404 inconnue, 410 retirée ou expirée.
  const resultat = useAffichePublique(code)
  const affiche = resultat.donnees?.affiche
  const animAffiche = resultat.donnees?.animationAffiche
  const lieu = resultat.donnees?.lieu
  // Les consignes sont toujours proposées : sur iPhone, le bouton du dernier écran est le geste qui
  // autorise les capteurs de mouvement (SLAM) et le son.
  const [etape, setEtape] = useState<'consignes' | 'ra' | 'refus'>('consignes')
  const [simulee, setSimulee] = useState(false)
  const compte = useRef(false)

  // Statistique anonyme « scan » (aucun identifiant, arrondie à l'heure côté serveur).
  useEffect(() => {
    if (!compte.current && affiche && !resultat.raison) {
      compte.current = true
      compterScan(affiche.id)
    }
  }, [affiche, resultat.raison])

  // Téléchargement en arrière-plan pendant les consignes : moteur de RA, modèle 3D, son, cible (section 4.1).
  const cible = resultat.donnees?.cible
  const [modeleUrl, sonUrl, cibleUrl] = [animAffiche?.modeleUrl, animAffiche?.sonUrl, cible?.imagePath]
  useEffect(() => {
    if (modeleUrl && compat.compatible) prechargerRA([modeleUrl, sonUrl, cibleUrl])
  }, [modeleUrl, sonUrl, cibleUrl, compat.compatible])

  const voirLieu = useCallback(() => {
    navigate(lieu ? `/?lieu=${lieu.id}&affiche=${code}` : '/', { replace: true })
  }, [navigate, lieu, code])

  // Caméra refusée : message explicite (BF-09) dont l'action ouvre la carte sur le lieu promu (BF-33).
  const sansCamera = useCallback(() => setEtape('refus'), [])
  // Téléphone incompatible : la carte s'ouvre directement sur le lieu promu (BF-33).
  useEffect(() => {
    if (!resultat.raison && !compat.compatible) voirLieu()
  }, [resultat.raison, compat.compatible, voirLieu])

  if (resultat.chargement)
    return (
      <div className="page page-centree">
        <span className="spinner" />
      </div>
    )

  if (resultat.erreurReseau)
    return (
      <div className="page page-centree">
        <MessageErreur cas="reseau" onAction={() => window.location.reload()} />
      </div>
    )

  if (resultat.raison) {
    const cas = resultat.raison === 'EXPIREE' ? 'expiree' : resultat.raison === 'RETIREE' ? 'retiree' : 'inconnue'
    return (
      <div className="page page-centree">
        <MessageErreur
          cas={cas}
          onAction={() => navigate(cas === 'expiree' ? '/agenda' : '/')}
          libelleAction={cas === 'inconnue' ? t('ra.voirCarte') : undefined}
        />
      </div>
    )
  }

  if (!affiche || !animAffiche || !lieu) return null

  if (etape === 'consignes') {
    return (
      <Consignes
        onRetour={voirLieu}
        // Le scan a fonctionné : on le confirme tout de suite, avant les conseils (tests utilisateurs).
        confirmation={affiche.nom}
        etapeDepart={consignesVues() ? 2 : 0}
        onTerminer={() => {
          // Dans le clic : autorisations demandées pendant le geste du visiteur (iPhone).
          void demanderCapteursMouvement()
          deverrouillerSon()
          marquerConsignesVues()
          setEtape('ra')
        }}
      />
    )
  }

  if (etape === 'refus') {
    return (
      <div className="page page-centree colonne">
        <MessageErreur cas="camera" onAction={voirLieu} libelleAction={t('affiche.voirLieu')} />
        <button type="button" className="btn btn-texte btn-bloc" onClick={() => { setSimulee(true); setEtape('ra') }}>
          {t('ra.camSimulee')}
        </button>
      </div>
    )
  }

  return (
    <VueRA
      mode="affiche"
      lieu={lieu}
      animation={animAffiche}
      affiche={affiche}
      cibles={cible ? [cible] : []}
      proprietaire={resultat.donnees?.proprietaire}
      cameraAutorisee={!simulee}
      onQuitter={voirLieu}
      onVoirLieu={voirLieu}
      onCameraRefusee={sansCamera}
    />
  )
}
