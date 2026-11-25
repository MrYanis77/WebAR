import { FORMATS_MM } from '../../commun/AfficheQr'
import type { PlacementQr } from '../../commun/types'

/** Formats du plus petit au plus grand. */
const ORDRE_FORMATS = ['A4', 'A3', 'A2', 'A1', 'A0']

/**
 * Comparaison à l'échelle : l'affiche au format choisi à côté d'une silhouette de 1,70 m,
 * pour voir concrètement la différence entre A4 et A0 et la taille réelle du QR code.
 * Avec `onFormat`, c'est le seul endroit où l'on choisit le format (étape 1) ; sans, l'échelle est
 * seulement montrée (étape du QR code) : les testeurs ne comprenaient pas qu'on leur propose deux fois
 * de changer de format.
 */
export function EchelleFormat({
  format,
  paysage,
  image,
  qr,
  qrCm,
  onFormat,
  desactive,
  sansQr,
  formatMax,
}: {
  format: string
  paysage: boolean
  image?: string
  qr: PlacementQr
  /** Côté du QR code imprimé (cm), calculé comme le PDF ; à défaut, estimé sur la largeur de la page. */
  qrCm?: number
  onFormat?: (f: string) => void
  desactive?: boolean
  /** QR code pas encore placé : il n'apparaît qu'à son étape (création d'affiche). */
  sansQr?: boolean
  /** Plus grand format accepté par l'emplacement choisi : les formats au-dessus sont grisés. */
  formatMax?: string
}) {
  const tropGrand = (f: string) => !!formatMax && ORDRE_FORMATS.includes(formatMax) && ORDRE_FORMATS.indexOf(f) > ORDRE_FORMATS.indexOf(formatMax)
  const [lMm, hMm] = FORMATS_MM[format] ?? FORMATS_MM.A3
  const larg = (paysage ? hMm : lMm) / 1000
  const haut = (paysage ? lMm : hMm) / 1000
  // 1 m = 60 px ; sol à y = 150 ; bas de l'affiche à 0,9 m du sol.
  const m = 60
  const sol = 150
  const xAffiche = 92
  const yBas = sol - 0.9 * m
  const cote = qrCm ?? qr.taille * larg * 100
  const cm = (v: number) => v.toFixed(1).replace('.', ',')

  return (
    <div className={`echelle-format ${onFormat ? 'avec-choix' : ''}`}>
      {onFormat ? (
        <div className="formats" role="radiogroup" aria-label="Format d’impression">
          {Object.entries(FORMATS_MM).map(([f, [l, h]]) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={f === format}
              className={f === format ? 'actif' : ''}
              onClick={() => onFormat(f)}
              disabled={desactive || tropGrand(f)}
              title={tropGrand(f) ? `Trop grand pour l’emplacement choisi (jusqu’au ${formatMax})` : undefined}
            >
              <strong>{f}</strong>
              <small>
                {l / 10} × {h / 10} cm
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="format-retenu">
          Format <strong>{format}</strong>, celui de l’emplacement d’affichage
        </p>
      )}
      <svg viewBox="0 0 260 160" role="img" aria-label={`Affiche ${format} de ${cm(larg * 100)} × ${cm(haut * 100)} cm à côté d’une personne de 1,70 m`}>
        <defs>
          <clipPath id="clip-echelle">
            <rect x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} />
          </clipPath>
        </defs>
        <line x1={0} x2={260} y1={sol} y2={sol} className="sol" />
        {/* personne de 1,70 m, pour l'échelle */}
        <g className="silhouette" transform={`translate(40 ${sol - 1.7 * m})`}>
          <circle cx={10} cy={7} r={7} />
          <rect x={1} y={16} width={18} height={44} rx={8} />
          <rect x={3} y={54} width={6} height={48} rx={3} />
          <rect x={11} y={54} width={6} height={48} rx={3} />
        </g>
        <text x={50} y={sol + 9} className="cote" textAnchor="middle">
          personne 1,70 m
        </text>
        {/* affiche à l'échelle */}
        {image ? (
          <image href={image} x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} preserveAspectRatio="xMidYMid slice" clipPath="url(#clip-echelle)" />
        ) : (
          <rect x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} className="affiche-vide" />
        )}
        <rect x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} className="cadre" />
        {!sansQr && (
          <rect
            x={xAffiche + qr.x * larg * m}
            y={yBas - haut * m + qr.y * haut * m}
            width={Math.max(1.5, qr.taille * larg * m)}
            height={Math.max(1.5, qr.taille * larg * m)}
            className="qr-echelle"
          />
        )}
        <text x={xAffiche + (larg * m) / 2} y={yBas - haut * m - 5} className="cote" textAnchor="middle">
          {cm(larg * 100)} × {cm(haut * 100)} cm
        </text>
      </svg>
      {sansQr ? (
        <p>
          Affiche imprimée : <strong>{cm(larg * 100)} × {cm(haut * 100)} cm</strong>. Le QR code s’ajoutera à l’étape 4.
        </p>
      ) : (
        <p>
          QR code imprimé : <strong>{cm(cote)} cm</strong> · lisible jusqu’à environ {cm(Math.max(0.3, cote / 10))} m
        </p>
      )}
    </div>
  )
}
