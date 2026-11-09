import QRCode from 'qrcode'
import { useEffect, useState, type CSSProperties } from 'react'
import { DOMAINE_APPLICATION } from '../../commun/constantes'
import { imageLieu } from '../../commun/images'
import { nomProprietaire, type EtatDemo } from '../../commun/store'
import type { Affiche } from '../../commun/types'

/** Prépare les données d'affichage d'une affiche enregistrée. */
export function donneesAffiche(e: EtatDemo, a: Affiche, visuel?: string, logo?: string): DonneesAffiche {
  const animLieu = e.animations.find((x) => x.id === a.animationLieuId)
  const lieu = e.lieux.find((l) => l.id === animLieu?.lieuId)
  const f = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso))
  return {
    variante: e.modeles.find((m) => m.id === a.modeleId)?.variante ?? 0,
    nom: a.nom,
    accroche: a.accroche,
    texte: a.texte,
    code: a.codeQr,
    visuel: visuel ?? imageLieu(lieu?.image),
    logo,
    structure: nomProprietaire(e, a.proprietaireId),
    lieu: lieu?.nomCourt ?? 'Montbéliard',
    dates: `${f(a.debut)} → ${f(a.fin)}`,
  }
}

/** URL du QR code : toujours le domaine de l'application, jamais un lien saisi (BNF-18). */
export function urlQr(code: string) {
  return `${DOMAINE_APPLICATION}/a/${code}`
}

export function QrCode({ code, taille = 120 }: { code: string; taille?: number }) {
  const [src, setSrc] = useState<string>('')
  useEffect(() => {
    let actif = true
    QRCode.toDataURL(urlQr(code), { margin: 1, width: taille * 2, errorCorrectionLevel: 'M', color: { dark: '#1e2024', light: '#ffffff' } })
      .then((u) => actif && setSrc(u))
      .catch(() => {})
    return () => {
      actif = false
    }
  }, [code, taille])
  return src ? <img src={src} width={taille} height={taille} alt={`QR code vers ${urlQr(code)}`} className="qr" /> : <span className="qr" style={{ width: taille, height: taille }} />
}

export interface DonneesAffiche {
  variante: 0 | 1 | 2
  nom: string
  accroche: string
  texte: string
  code: string
  visuel?: string
  logo?: string
  structure: string
  lieu: string
  dates: string
}

/** Rendu de l'affiche à partir d'un modèle de la Ville (BF-15, BF-37). */
export function ApercuAffiche({ d, echelle = 1 }: { d: DonneesAffiche; echelle?: number }) {
  return (
    <div className={`affiche-rendu variante-${d.variante}`} style={{ '--echelle': echelle } as CSSProperties}>
      {d.visuel ? <img className="affiche-visuel" src={d.visuel} alt="" /> : <div className="affiche-visuel vide" />}
      <div className="affiche-calque">
        <div className="affiche-haut">
          <span>VILLE DE MONTBÉLIARD</span>
          {d.logo ? <img src={d.logo} alt="" className="affiche-logo" /> : <span className="affiche-structure">{d.structure}</span>}
        </div>
        <small className="affiche-accroche">{d.accroche || 'Accroche'}</small>
        <h2>{d.nom || 'Titre de l’affiche'}</h2>
        <p className="affiche-texte">{d.texte || 'Texte court de présentation.'}</p>
        {d.variante === 2 && (
          <ul className="affiche-programme">
            <li>
              <b>{d.dates}</b>
            </li>
            <li>Spectacle RA · {d.lieu}</li>
            <li>Gratuit · sans application</li>
          </ul>
        )}
        <div className="affiche-bas">
          <div className="affiche-qr">
            <QrCode code={d.code} taille={72} />
          </div>
          <div>
            <strong>
              SCANNEZ.
              <br />
              REGARDEZ.
              <br />
              VIVEZ.
            </strong>
            <small>Expérience sans application · {d.lieu}</small>
          </div>
        </div>
      </div>
    </div>
  )
}
