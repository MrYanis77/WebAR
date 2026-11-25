import { formaterDistance } from '../../commun/geo'
import { useLangue, type CleTexte } from '../../commun/i18n'
import { Icone, type NomIcone } from '../../commun/Icone'
import type { CoteDirection } from './SceneRA'

const CARDINAUX = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const
/** Au-delà de cette hauteur (m), le visiteur est invité à lever le téléphone. */
const HAUTEUR_A_SIGNALER_M = 4

/** Écart signé (−180° à 180°) entre deux caps. */
const ecartCap = (de: number, vers: number) => ((vers - de + 540) % 360) - 180

/**
 * Boussole « Où regarder ? » d'une animation de monument : une flèche tournée vers l'endroit où
 * l'animation apparaît (cap GPS du visiteur vers le point de l'animation, corrigé par la boussole du
 * téléphone), sa distance et sa hauteur. Sans boussole (ordinateur), la direction est donnée en points
 * cardinaux. Les tests ont montré qu'au monument, on ne savait pas où chercher l'animation.
 */
export function GuideBoussole({ cap, capCible, distanceM, hauteurM, compact }: { cap: number | null; capCible: number; distanceM: number; hauteurM: number; compact?: boolean }) {
  const { t } = useLangue()
  const ecart = cap === null ? null : ecartCap(cap, capCible)
  const cardinal = CARDINAUX[Math.round(capCible / 45) % 8]
  const consigne =
    ecart === null
      ? t('guide.vers', { dir: t(`guide.cardinal.${cardinal}` as CleTexte) })
      : Math.abs(ecart) <= 20
        ? t('guide.devant')
        : Math.abs(ecart) >= 150
          ? t('guide.derriere')
          : ecart > 0
            ? t('guide.droite')
            : t('guide.gauche')
  const enHauteur = hauteurM >= HAUTEUR_A_SIGNALER_M
  return (
    <div className={`guide-boussole ${compact ? 'compact' : ''} ${ecart !== null && Math.abs(ecart) <= 20 ? 'aligne' : ''}`} role="status">
      <div className="cadran" aria-hidden="true">
        {/* Sans boussole : le cadran est orienté nord en haut, la flèche montre le cap à suivre. */}
        <span className="nord" style={{ transform: `rotate(${cap === null ? 0 : -cap}deg)` }}>
          <b>N</b>
        </span>
        <span className="fleche" style={{ transform: `rotate(${ecart ?? capCible}deg)` }}>
          <Icone nom="haut" taille={compact ? 22 : 28} epaisseur={2.8} />
        </span>
      </div>
      <div className="texte-guide">
        {!compact && <small className="titre-guide">{t('guide.titre')}</small>}
        <strong>{consigne}</strong>
        <small>
          {t('guide.distance', { d: formaterDistance(distanceM) })}
          {enHauteur && ` · ${t('guide.hauteur', { h: Math.round(hauteurM) })}`}
        </small>
      </div>
    </div>
  )
}

const ICONES: Record<CoteDirection, NomIcone> = { gauche: 'gauche', droite: 'droite', haut: 'haut', bas: 'bas' }
const TEXTES: Record<CoteDirection, CleTexte> = { gauche: 'ra.directionGauche', droite: 'ra.directionDroite', haut: 'ra.directionHaut', bas: 'ra.directionBas' }

/** Animation posée mais hors du cadre : grande flèche sur le bord de l'écran, du côté où la chercher. */
export function FlecheBord({ cote }: { cote: CoteDirection }) {
  const { t } = useLangue()
  return (
    <div className={`fleche-bord ${cote}`} role="status">
      <Icone nom={ICONES[cote]} taille={26} epaisseur={2.6} />
      <span>{t(TEXTES[cote])}</span>
    </div>
  )
}
