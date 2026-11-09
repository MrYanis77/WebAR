import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { Centrage } from '../../commun/Carte'
import { distanceM, formaterDistance, projeter } from '../../commun/geo'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { useEtat } from '../../commun/store'
import { CarteLieux } from '../composants/CarteLieux'
import { CoucheModale } from '../composants/Couche'
import { BoutonLangue, FeuilleMenu } from '../composants/Feuilles'
import { FormulaireSignalement, type CibleSignalement } from '../composants/FormulaireSignalement'
import { MessageErreur } from '../composants/MessageErreur'
import { NavBas } from '../composants/NavBas'
import { usePosition } from '../contexte/position'
import { animationsDuLieu, lieuxVisibles } from '../utils'

export default function PageCarte() {
  const { t, tr, date } = useLangue()
  const etat = useEtat()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const position = usePosition()
  const lieux = useMemo(() => lieuxVisibles(etat), [etat])

  const lieuParam = params.get('lieu')
  const codeAffiche = params.get('affiche')
  const affichePromo = codeAffiche ? etat.affiches.find((a) => a.codeQr === codeAffiche) : undefined

  const [selection, setSelection] = useState<string | null>(() => lieuParam ?? lieux[0]?.id ?? null)
  const [centrage, setCentrage] = useState<Centrage | null>(null)
  const [menu, setMenu] = useState(false)
  const [erreurPosition, setErreurPosition] = useState(false)
  const [cible, setCible] = useState<CibleSignalement | null>(null)
  const [attenteCentrage, setAttenteCentrage] = useState(false)

  // Arrivée depuis une affiche : carte centrée sur le lieu promu (BF-32, BF-33).
  useEffect(() => {
    const l = lieux.find((x) => x.id === lieuParam)
    if (!l) return
    setSelection(l.id)
    const p = projeter(l)
    setCentrage({ x: p.x, y: p.y, cle: `lieu-${l.id}-${Date.now()}`, zoom: 0.8 })
  }, [lieuParam, lieux])

  // Recentre sur le visiteur dès que la position arrive après un appui sur « Ma position ».
  useEffect(() => {
    if (!attenteCentrage || !position.coords) return
    const p = projeter(position.coords)
    setCentrage({ x: p.x, y: p.y, cle: `moi-${Date.now()}` })
    setAttenteCentrage(false)
  }, [attenteCentrage, position.coords])

  useEffect(() => {
    if (attenteCentrage && (position.etat === 'refuse' || position.etat === 'indisponible')) {
      setAttenteCentrage(false)
      setErreurPosition(true)
    }
  }, [attenteCentrage, position.etat])

  const lieu = lieux.find((l) => l.id === selection) ?? lieux[0]
  const { active, prochaines } = lieu ? animationsDuLieu(etat, lieu.id) : { active: undefined, prochaines: [] }
  const distance = lieu && position.coords ? distanceM(position.coords, lieu) : null

  function horaire() {
    if (active) return `${t('lieu.enCours')} · ${active.titre}`
    const p = prochaines[0]
    if (!p) return t('carte.aucunSpectacle')
    const jour = new Date(p.debut).toDateString() === new Date().toDateString()
    return jour ? `${t('commun.ceSoir')}, ${date(p.debut, { hour: '2-digit', minute: '2-digit' })}` : date(p.debut, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function maPosition() {
    if (position.etat === 'refuse' || position.etat === 'indisponible') {
      setErreurPosition(true)
      return
    }
    setAttenteCentrage(true)
    position.demander()
  }

  return (
    <div className="page page-carte">
      <CarteLieux
        lieux={lieux}
        selection={lieu?.id ?? null}
        onSelection={(id) => {
          setSelection(id)
          const l = lieux.find((x) => x.id === id)
          if (l) {
            const p = projeter(l)
            setCentrage({ x: p.x, y: p.y, cle: `sel-${id}-${Date.now()}` })
          }
        }}
        position={position.coords}
        misEnAvant={affichePromo ? lieuParam : null}
        centrage={centrage}
      />

      <header className="carte-entete">
        <div>
          <p className="eyebrow">{t('carte.ville')}</p>
          <h1>{t('carte.titre')}</h1>
        </div>
        <div className="carte-entete-actions">
          <BoutonLangue />
          <button type="button" className="bouton-rond" onClick={() => setMenu(true)} aria-label={t('carte.menu')}>
            <Icone nom="info" taille={20} />
          </button>
        </div>
      </header>

      {affichePromo && (
        <div className="bandeau-promo" role="status">
          <Icone nom="affiche" taille={16} />
          <span>{t('carte.misEnAvant', { nom: affichePromo.nom })}</span>
          <button
            type="button"
            aria-label={t('commun.fermer')}
            onClick={() => {
              params.delete('affiche')
              setParams(params, { replace: true })
            }}
          >
            <Icone nom="fermer" taille={14} />
          </button>
        </div>
      )}

      <button type="button" className="bouton-position" onClick={maPosition}>
        {position.etat === 'demande' ? <span className="spinner" /> : <Icone nom="pin" taille={16} />}
        {position.etat === 'demande' ? t('carte.recherchePosition') : t('carte.maPosition')}
        {position.simulee && <span className="pill pill-cyan">démo</span>}
      </button>

      {lieu && (
        <section className="fiche-carte" aria-label={lieu.nom}>
          <div className="poignee" aria-hidden="true" />
          <div className="fiche-carte-image">
            {imageLieu(lieu.image) ? <img src={imageLieu(lieu.image)} alt="" /> : <div className="image-vide" />}
            {active && <span className="pill pill-cyan">{t('carte.experienceRA')}</span>}
          </div>
          <div className="fiche-carte-texte">
            <div className="fiche-carte-ligne">
              <p className="type-lieu">{tr(lieu.categorie)}</p>
              <button
                type="button"
                className="bouton-signaler-mini"
                aria-label={t('lieu.signaler')}
                disabled={!active}
                onClick={() => active && setCible({ animationId: active.id, nom: `${active.titre} — ${lieu.nomCourt}` })}
              >
                <Icone nom="drapeau" taille={14} />
              </button>
            </div>
            <h2>{lieu.nom}</h2>
            <div className="metadonnees">
              <span>
                <Icone nom="itineraire" taille={14} />
                {distance !== null ? formaterDistance(distance) : t('carte.activerPosition')}
              </span>
              <span>
                <Icone nom="calendrier" taille={14} />
                {horaire()}
              </span>
            </div>
          </div>
          <div className="fiche-carte-actions">
            <button type="button" className="btn btn-secondaire" onClick={() => navigate(`/lieux/${lieu.id}`)}>
              {t('carte.plusInfos')}
              <Icone nom="droite" taille={16} />
            </button>
            <button type="button" className="btn btn-cyan" onClick={() => navigate(`/lieux/${lieu.id}/ra`)} disabled={!active}>
              <Icone nom="scan" taille={18} />
              {t('carte.scanner')}
            </button>
          </div>
          {lieux.length > 1 && (
            <div className="pagination-lieux" role="tablist" aria-label="Lieux">
              {lieux.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={l.id === lieu.id}
                  aria-label={l.nom}
                  onClick={() => {
                    setSelection(l.id)
                    const p = projeter(l)
                    setCentrage({ x: p.x, y: p.y, cle: `pg-${l.id}-${Date.now()}` })
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <NavBas />
      <FeuilleMenu ouverte={menu} onFermer={() => setMenu(false)} />
      <FormulaireSignalement cible={cible} onFermer={() => setCible(null)} />
      <CoucheModale ouverte={erreurPosition} onFermer={() => setErreurPosition(false)} etiquette={t('erreur.position.titre')}>
        <MessageErreur
          cas="position"
          onAction={() => {
            setErreurPosition(false)
            position.demander()
            setAttenteCentrage(true)
          }}
          secondaire={{ libelle: t('commun.fermer'), onClick: () => setErreurPosition(false) }}
        />
      </CoucheModale>
    </div>
  )
}
