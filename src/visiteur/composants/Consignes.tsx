import { useState, type ReactNode } from 'react'
import { useLangue, type CleTexte } from '../../commun/i18n'
import { Icone, type NomIcone } from '../../commun/Icone'
import { BoutonLangue } from './Feuilles'

const ETAPES: { titre: CleTexte; texte: CleTexte; note: CleTexte; sousNote: CleTexte; icone: NomIcone }[] = [
  { titre: 'consignes.c1.titre', texte: 'consignes.c1.texte', note: 'consignes.perm.camera', sousNote: 'consignes.perm.cameraNote', icone: 'appareil' },
  { titre: 'consignes.c2.titre', texte: 'consignes.c2.texte', note: 'consignes.perm.position', sousNote: 'consignes.perm.positionNote', icone: 'pin' },
  { titre: 'consignes.c3.titre', texte: 'consignes.c3.texte', note: 'consignes.perm.securite', sousNote: 'consignes.perm.securiteNote', icone: 'oeil' },
]

/**
 * Consignes de RA : 3 écrans, 40 mots maximum chacun (BF-03), conseil de sécurité (BNF-12).
 * Le dernier écran est un conseil, pas une alerte : il est souvent le premier vu après le scan d'un
 * QR code (consignes déjà lues) et ne doit pas faire croire à une erreur (tests utilisateurs).
 * `confirmation` : bandeau « QR code reconnu » qui confirme que le scan a fonctionné.
 * `apercu` remplace l'illustration du dernier écran (modèle 3D de l'animation) ; `etapeDepart`
 * permet de n'afficher que ce dernier écran quand les consignes ont déjà été lues.
 * `onTerminer` est appelé directement dans le clic : il peut ouvrir la caméra ou la RA native.
 */
export function Consignes({
  onTerminer,
  onRetour,
  apercu,
  etapeDepart = 0,
  confirmation,
}: {
  onTerminer: () => void
  onRetour: () => void
  apercu?: ReactNode
  etapeDepart?: number
  confirmation?: string
}) {
  const { t } = useLangue()
  const [etape, setEtape] = useState(etapeDepart)
  const e = ETAPES[etape]
  const derniere = etape === ETAPES.length - 1

  return (
    <div className="page ecran-consignes">
      <div className="entete-mobile">
        <button type="button" className="bouton-icone" onClick={etape === 0 ? onRetour : () => setEtape(etape - 1)} aria-label={t('commun.retour')}>
          <Icone nom="gauche" taille={20} />
        </button>
        <BoutonLangue />
      </div>
      {confirmation && (
        <p className="scan-reussi" role="status">
          <span>
            <Icone nom="check" taille={16} epaisseur={2.6} />
          </span>
          <span>
            <strong>{t('consignes.qrReconnu')}</strong>
            <small>{confirmation}</small>
          </span>
        </p>
      )}
      <div className={`progression ${confirmation ? 'apres-confirmation' : ''}`} aria-label={`${etape + 1} / 3`}>
        {ETAPES.map((_, i) => (
          <span key={i} className={i <= etape ? 'fait' : ''} />
        ))}
      </div>
      {derniere && apercu ? (
        <div className="visuel-consigne apercu-animation-consigne">{apercu}</div>
      ) : (
        <div className={`visuel-consigne etape-${etape}`} aria-hidden="true">
          <div className="illustration-telephone">
            <span className="camera-telephone" />
            {etape === 0 && (
              <>
                <span className="onde-scan" />
                <Icone nom="scan" taille={56} epaisseur={2} />
              </>
            )}
            {etape === 1 && (
              <div className="reperes-mini">
                <i />
                <i />
                <i />
                <i />
                <Icone nom="check" taille={30} epaisseur={2.4} />
              </div>
            )}
            {etape === 2 && (
              <>
                <span className="onde-scan douce" />
                <Icone nom="oeil" taille={52} epaisseur={2} />
              </>
            )}
          </div>
          <span className="compteur-etape">0{etape + 1} / 03</span>
        </div>
      )}
      <div className="texte-consigne" key={etape}>
        <span className="pill pill-cyan">{derniere ? t('consignes.pret') : t('consignes.avant')}</span>
        <h1>{t(e.titre)}</h1>
        <p>{t(e.texte)}</p>
        <div className={`note-permission ${derniere ? 'conseil' : ''}`}>
          <Icone nom={e.icone} taille={20} />
          <span>
            <strong>{t(e.note)}</strong>
            <small>{t(e.sousNote)}</small>
          </span>
        </div>
      </div>
      <div className="actions-consigne">
        <button type="button" className="btn btn-primaire btn-bloc" onClick={derniere ? onTerminer : () => setEtape(etape + 1)}>
          {derniere ? t('consignes.commencer') : t('consignes.continuer')}
          <Icone nom="droite" taille={16} />
        </button>
        {etape > 0 && (
          <button type="button" className="btn-texte btn-bloc" onClick={() => setEtape(etape - 1)}>
            {t('consignes.precedent')}
          </button>
        )}
      </div>
    </div>
  )
}
