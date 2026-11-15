import { FORMATS_MM } from '../../commun/AfficheQr'
import type { PlacementQr } from '../../commun/types'

/**
 * Comparaison à l'échelle : l'affiche au format choisi à côté d'une silhouette de 1,70 m,
 * pour voir concrètement la différence entre A4 et A0 et la taille réelle du QR code.
 */
export function EchelleFormat({
  format,
  paysage,
  image,
  qr,
  onFormat,
  desactive,
}: {
  format: string
  paysage: boolean
  image?: string
  qr: PlacementQr
  onFormat: (f: string) => void
  desactive?: boolean
}) {
  const [lMm, hMm] = FORMATS_MM[format] ?? FORMATS_MM.A3
  const larg = (paysage ? hMm : lMm) / 1000
  const haut = (paysage ? lMm : hMm) / 1000
  // 1 m = 60 px ; sol à y = 150 ; bas de l'affiche à 0,9 m du sol.
  const m = 60
  const sol = 150
  const xAffiche = 92
  const yBas = sol - 0.9 * m
  const qrCm = qr.taille * larg * 100

  return (
    <div className="echelle-format">
      <div className="formats" role="radiogroup" aria-label="Format d’impression">
        {Object.keys(FORMATS_MM).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={f === format} className={f === format ? 'actif' : ''} onClick={() => onFormat(f)} disabled={desactive}>
            {f}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 260 160" role="img" aria-label={`Affiche ${format} de ${(larg * 100).toFixed(1)} × ${(haut * 100).toFixed(1)} cm à côté d’une personne de 1,70 m`}>
        <defs>
          <clipPath id="clip-echelle">
            <rect x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} />
          </clipPath>
        </defs>
        <line x1={0} x2={260} y1={sol} y2={sol} className="sol" />
        {/* silhouette de 1,70 m */}
        <g className="silhouette" transform={`translate(40 ${sol - 1.7 * m})`}>
          <circle cx={10} cy={7} r={7} />
          <rect x={1} y={16} width={18} height={44} rx={8} />
          <rect x={3} y={54} width={6} height={48} rx={3} />
          <rect x={11} y={54} width={6} height={48} rx={3} />
        </g>
        <text x={50} y={sol + 9} className="cote" textAnchor="middle">1,70 m</text>
        {/* affiche à l'échelle */}
        {image ? (
          <image href={image} x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} preserveAspectRatio="xMidYMid slice" clipPath="url(#clip-echelle)" />
        ) : (
          <rect x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} className="affiche-vide" />
        )}
        <rect x={xAffiche} y={yBas - haut * m} width={larg * m} height={haut * m} className="cadre" />
        <rect
          x={xAffiche + qr.x * larg * m}
          y={yBas - haut * m + qr.y * haut * m}
          width={Math.max(1.5, qr.taille * larg * m)}
          height={Math.max(1.5, qr.taille * larg * m)}
          className="qr-echelle"
        />
        <text x={xAffiche + (larg * m) / 2} y={yBas - haut * m - 5} className="cote" textAnchor="middle">
          {(larg * 100).toFixed(1).replace('.', ',')} × {(haut * 100).toFixed(1).replace('.', ',')} cm
        </text>
      </svg>
      <p>
        QR code imprimé : <strong>{qrCm.toFixed(1).replace('.', ',')} cm</strong> · lisible jusqu’à environ {Math.max(0.3, (qrCm * 10) / 100).toFixed(1).replace('.', ',')} m
      </p>
    </div>
  )
}
