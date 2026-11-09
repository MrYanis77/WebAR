import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { afficheDiffusee, compterScan, useEtat } from '../../commun/store'
import { Consignes } from '../composants/Consignes'
import { MessageErreur } from '../composants/MessageErreur'
import { VueRA } from '../composants/VueRA'
import { useCompatibilite } from '../hooks/capteurs'
import { deverrouillerSon } from '../services/son'
import { consignesVues, marquerConsignesVues } from '../utils'

/**
 * Entrée par QR code (/a/:code) : description de l'affiche, consignes, animation d'affiche,
 * puis carte centrée sur l'animation de lieu promue (BF-02, BF-16, BF-30 à BF-33).
 */
export default function PageAffiche() {
  const { code = '' } = useParams()
  const { t } = useLangue()
  const navigate = useNavigate()
  const etat = useEtat()
  const compat = useCompatibilite()
  const resultat = afficheDiffusee(etat, code)
  const affiche = resultat.affiche
  const animAffiche = etat.animations.find((a) => a.id === affiche?.animationAfficheId)
  const animLieu = etat.animations.find((a) => a.id === affiche?.animationLieuId)
  const lieu = etat.lieux.find((l) => l.id === animLieu?.lieuId)
  const [etape, setEtape] = useState<'consignes' | 'ra' | 'refus'>(() => (consignesVues() ? 'ra' : 'consignes'))
  const [simulee, setSimulee] = useState(false)
  const compte = useRef(false)

  // Statistique anonyme « scan » (aucun identifiant, arrondie à l'heure côté serveur).
  useEffect(() => {
    if (!compte.current && affiche && !resultat.raison) {
      compte.current = true
      compterScan(affiche.id)
    }
  }, [affiche, resultat.raison])

  const voirLieu = useCallback(() => {
    navigate(lieu ? `/?lieu=${lieu.id}&affiche=${code}` : '/', { replace: true })
  }, [navigate, lieu, code])

  // Caméra refusée : message explicite (BF-09) dont l'action ouvre la carte sur le lieu promu (BF-33).
  const sansCamera = useCallback(() => setEtape('refus'), [])
  // Téléphone incompatible : la carte s'ouvre directement sur le lieu promu (BF-33).
  useEffect(() => {
    if (!resultat.raison && !compat.compatible) voirLieu()
  }, [resultat.raison, compat.compatible, voirLieu])

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

  if (!affiche || !animAffiche || !lieu || !animLieu) return null

  if (etape === 'consignes') {
    return (
      <Consignes
        onRetour={voirLieu}
        onTerminer={() => {
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
      cameraAutorisee={!simulee}
      onQuitter={voirLieu}
      onVoirLieu={voirLieu}
      onCameraRefusee={sansCamera}
    />
  )
}
