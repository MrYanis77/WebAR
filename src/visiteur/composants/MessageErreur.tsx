import { useLangue, type CleTexte } from '../../commun/i18n'
import { Icone, type NomIcone } from '../../commun/Icone'

// Messages d'erreur explicites avec une action proposée (BF-09).
export type CasErreur =
  | 'camera'
  | 'position'
  | 'incompatible'
  | 'reseau'
  | 'expiree'
  | 'retiree'
  | 'inconnue'
  | 'affiche'
  | 'monument'
  | 'lumiere'

export const ERREURS: Record<CasErreur, { icone: NomIcone; action?: boolean }> = {
  camera: { icone: 'appareil', action: true },
  position: { icone: 'pin', action: true },
  incompatible: { icone: 'telephone', action: true },
  reseau: { icone: 'wifiOff', action: true },
  expiree: { icone: 'calendrier', action: true },
  retiree: { icone: 'bouclier', action: true },
  inconnue: { icone: 'qr' },
  affiche: { icone: 'affiche', action: true },
  monument: { icone: 'boussole', action: true },
  lumiere: { icone: 'soleil', action: true },
}

export function MessageErreur({
  cas,
  onAction,
  libelleAction,
  secondaire,
}: {
  cas: CasErreur
  onAction?: () => void
  libelleAction?: string
  secondaire?: { libelle: string; onClick: () => void }
}) {
  const { t } = useLangue()
  const def = ERREURS[cas]
  return (
    <div className="message-erreur-bloc" role="alert">
      <span className="icone-erreur">
        <Icone nom={def.icone} taille={28} />
      </span>
      <h2>{t(`erreur.${cas}.titre` as CleTexte)}</h2>
      <p>{t(`erreur.${cas}.texte` as CleTexte)}</p>
      {onAction && (
        <button type="button" className="btn btn-primaire btn-bloc" onClick={onAction}>
          {libelleAction ?? (def.action ? t(`erreur.${cas}.action` as CleTexte) : t('erreur.retiree.action'))}
        </button>
      )}
      {secondaire && (
        <button type="button" className="btn btn-texte btn-bloc" onClick={secondaire.onClick}>
          {secondaire.libelle}
        </button>
      )}
    </div>
  )
}
