import { useState } from 'react'
import { useLangue, type CleTexte } from '../../commun/i18n'
import { Icone, type NomIcone } from '../../commun/Icone'
import { BoutonLangue } from './Feuilles'

const ETAPES: { titre: CleTexte; texte: CleTexte; note: CleTexte; sousNote: CleTexte; icone: NomIcone }[] = [
  { titre: 'consignes.c1.titre', texte: 'consignes.c1.texte', note: 'consignes.perm.camera', sousNote: 'consignes.perm.cameraNote', icone: 'appareil' },
  { titre: 'consignes.c2.titre', texte: 'consignes.c2.texte', note: 'consignes.perm.position', sousNote: 'consignes.perm.positionNote', icone: 'pin' },
  { titre: 'consignes.c3.titre', texte: 'consignes.c3.texte', note: 'consignes.perm.securite', sousNote: 'consignes.perm.securiteNote', icone: 'alerte' },
]

/** Consignes de RA : 3 écrans, 40 mots maximum chacun (BF-03), avertissement de sécurité (BNF-12). */
export function Consignes({ onTerminer, onRetour }: { onTerminer: () => void; onRetour: () => void }) {
  const { t } = useLangue()
  const [etape, setEtape] = useState(0)
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
      <div className="progression" aria-label={`${etape + 1} / 3`}>
        {ETAPES.map((_, i) => (
          <span key={i} className={i <= etape ? 'fait' : ''} />
        ))}
      </div>
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
          {etape === 2 && <Icone nom="alerte" taille={56} epaisseur={2} />}
        </div>
        <span className="compteur-etape">0{etape + 1} / 03</span>
      </div>
      <div className="texte-consigne" key={etape}>
        <span className="pill pill-cyan">{t('consignes.avant')}</span>
        <h1>{t(e.titre)}</h1>
        <p>{t(e.texte)}</p>
        <div className={`note-permission ${derniere ? 'securite' : ''}`}>
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
