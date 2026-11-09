import { useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import {
  attribuerZone,
  enregistrerAffiche,
  genererCodeQr,
  nomProprietaire,
  proposerZone,
  publiable,
  publierAffiche,
  reglePublication,
  uid,
  useEtat,
} from '../../commun/store'
import type { Affiche } from '../../commun/types'
import { ApercuAffiche, donneesAffiche, urlQr } from '../composants/ApercuAffiche'
import { peutCreer, proprietaireDe, useSession } from '../session'
import { BadgeStatut, useToast } from '../ui'

const ETAPES = ['Mise en page', 'Contenu', 'Expérience', 'Validation']

/** Création d'une affiche en 4 étapes, avec aperçu en temps réel (BF-37, BF-38, BF-40, BF-42). */
export default function PageEditeurAffiche() {
  const { id } = useParams()
  const etat = useEtat()
  const session = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const agent = session.role === 'AGENT'
  const existante = etat.affiches.find((a) => a.id === id)
  const [etape, setEtape] = useState(existante ? 4 : 1)
  const [visuel, setVisuel] = useState<string | undefined>()
  const [logo, setLogo] = useState<string | undefined>()
  const [tente, setTente] = useState(false)
  const [brouillon, setBrouillon] = useState<Affiche>(
    () =>
      existante ?? {
        id: uid('af'),
        proprietaireId: proprietaireDe(session),
        modeleId: etat.modeles.find((m) => m.actif)?.id ?? 'm1',
        animationAfficheId: etat.animations.find((a) => a.type === 'AFFICHE' && (agent || a.proprietaireId === session.partenaireId))?.id ?? '',
        animationLieuId: etat.animations.find((a) => a.type === 'LIEU' && a.statut === 'PUBLIEE')?.id ?? '',
        nom: '',
        accroche: '',
        texte: '',
        codeQr: genererCodeQr(),
        debut: new Date().toISOString().slice(0, 10) + 'T00:00:00',
        fin: new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10) + 'T23:00:00',
        statut: 'BROUILLON',
        fichiersConformes: false,
        scans: 0,
        modifieLe: new Date().toISOString().slice(0, 19),
      },
  )
  // L'affiche enregistrée (zone, statut) fait foi ; le brouillon porte les champs en cours d'édition.
  const a: Affiche = { ...brouillon, zoneId: existante?.zoneId ?? brouillon.zoneId, zoneProposeeId: existante?.zoneProposeeId ?? brouillon.zoneProposeeId, statut: existante?.statut ?? brouillon.statut }
  const maj = (p: Partial<Affiche>) => setBrouillon({ ...brouillon, ...p })

  if (id && !existante) {
    return (
      <div className="bo-defilement">
        <p>Affiche introuvable.</p>
        <Link to="/backoffice/affiches">Retour aux affiches</Link>
      </div>
    )
  }
  if (existante && !agent && existante.proprietaireId !== session.partenaireId) {
    return (
      <div className="bo-defilement">
        <p>Cette affiche appartient à un autre partenaire.</p>
      </div>
    )
  }

  const animsAffiche = etat.animations.filter((x) => x.type === 'AFFICHE' && x.statut !== 'RETIREE' && (agent || x.proprietaireId === session.partenaireId))
  const animsLieu = etat.animations.filter((x) => x.type === 'LIEU' && x.statut === 'PUBLIEE')
  const animA = etat.animations.find((x) => x.id === a.animationAfficheId)
  const animL = etat.animations.find((x) => x.id === a.animationLieuId)
  const lieuPromu = etat.lieux.find((l) => l.id === animL?.lieuId)
  const conditions = reglePublication(etat, a)
  const pret = publiable(conditions)
  const donnees = { ...donneesAffiche(etat, a, visuel, logo), variante: etat.modeles.find((m) => m.id === a.modeleId)?.variante ?? 0 }
  const erreursContenu = { nom: !a.nom.trim(), accroche: !a.accroche.trim(), texte: !a.texte.trim(), dates: a.fin <= a.debut }
  const contenuValide = !Object.values(erreursContenu).some(Boolean)
  const lectureSeule = a.statut === 'SUSPENDUE' || a.statut === 'RETIREE' || !peutCreer(etat, session)

  function suivant() {
    setTente(true)
    if (etape === 2 && !contenuValide) return
    if (etape === 3 && (!a.animationAfficheId || !a.animationLieuId)) return
    setTente(false)
    if (etape === 3 || etape === 2) enregistrerAffiche({ ...a, modifieLe: new Date().toISOString().slice(0, 19) })
    setEtape(Math.min(4, etape + 1))
  }

  function sauver() {
    enregistrerAffiche({ ...a, statut: a.statut === 'PUBLIEE' ? 'PUBLIEE' : 'BROUILLON', modifieLe: new Date().toISOString().slice(0, 19) })
    toast.afficher(a.statut === 'PUBLIEE' ? 'Modifications enregistrées — contrôle automatique relancé' : 'Brouillon enregistré')
  }

  const chargerImage = (setter: (u: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && /^image\/(png|jpeg)$/.test(f.type) && f.size <= 10_000_000) setter(URL.createObjectURL(f))
  }

  const ligneCondition = (ok: boolean, libelle: string, detail: string, action?: ReactNode) => (
    <li className={ok ? 'ok' : 'ko'}>
      <span>
        <Icone nom={ok ? 'check' : 'fermer'} taille={14} />
      </span>
      <div>
        <strong>{libelle}</strong>
        <small>{detail}</small>
      </div>
      {!ok && action}
    </li>
  )

  return (
    <>
      <header className="bo-entete">
        <div>
          <Link to="/backoffice/affiches" className="fil-ariane">
            <Icone nom="gauche" taille={14} /> Affiches
          </Link>
          <h1>{existante ? existante.nom : 'Créer une affiche'}</h1>
          <p>Composez un support prêt à être imprimé à partir des modèles de la Ville.</p>
        </div>
        <div className="bo-entete-actions">
          {existante && <BadgeStatut statut={a.statut} />}
          <button type="button" className="btn btn-fantome" onClick={sauver} disabled={lectureSeule}>
            Enregistrer
          </button>
        </div>
      </header>
      <div className="editeur-affiche">
        <div className="editeur-formulaire">
          <ol className="etapes-editeur">
            {ETAPES.map((e, i) => (
              <li key={e} className={etape === i + 1 ? 'actif' : etape > i + 1 ? 'fait' : ''}>
                <button type="button" onClick={() => (existante || i + 1 < etape ? setEtape(i + 1) : undefined)}>
                  <span>{etape > i + 1 ? <Icone nom="check" taille={13} /> : i + 1}</span>
                  <small>{e}</small>
                </button>
              </li>
            ))}
          </ol>

          <section className="section-editeur">
            <span className="eyebrow">Étape {etape} sur 4</span>
            {etape === 1 && (
              <>
                <h2>Choisissez une mise en page</h2>
                <div className="grille-gabarits">
                  {etat.modeles
                    .filter((m) => m.actif)
                    .map((m) => (
                      <button key={m.id} type="button" className={a.modeleId === m.id ? 'selectionne' : ''} onClick={() => maj({ modeleId: m.id })} disabled={lectureSeule}>
                        <div className={`mini-affiche v${m.variante}`}>
                          <i />
                          <b />
                          <span />
                        </div>
                        <strong>{m.nom}</strong>
                        <small>
                          {m.description} · {m.format}
                        </small>
                      </button>
                    ))}
                </div>
              </>
            )}

            {etape === 2 && (
              <>
                <h2>Ajoutez votre contenu</h2>
                <div className="grille-champs">
                  <label className={`champ ${tente && erreursContenu.nom ? 'erreur' : ''}`}>
                    <span className="etiquette">Titre de l’affiche</span>
                    <input value={a.nom} onChange={(e) => maj({ nom: e.target.value })} maxLength={60} placeholder="Noël au château" disabled={lectureSeule} />
                  </label>
                  <label className={`champ ${tente && erreursContenu.accroche ? 'erreur' : ''}`}>
                    <span className="etiquette">Accroche</span>
                    <input value={a.accroche} onChange={(e) => maj({ accroche: e.target.value })} maxLength={40} placeholder="Montbéliard présente" disabled={lectureSeule} />
                  </label>
                  <label className={`champ pleine ${tente && erreursContenu.texte ? 'erreur' : ''}`}>
                    <span className="etiquette">
                      Texte court <small>{a.texte.length}/300 · texte brut, aucun lien</small>
                    </span>
                    <textarea value={a.texte} onChange={(e) => maj({ texte: e.target.value.replace(/https?:\/\/\S+/g, '') })} maxLength={300} rows={3} disabled={lectureSeule} />
                  </label>
                  <label className="depot-petit">
                    <Icone nom="image" taille={20} />
                    <span>
                      <strong>{visuel ? 'Visuel importé' : 'Visuel principal'}</strong>
                      <small>JPG ou PNG · 10 Mo max. · sert aussi de cible de reconnaissance</small>
                    </span>
                    <input type="file" accept="image/png,image/jpeg" onChange={chargerImage(setVisuel)} disabled={lectureSeule} />
                  </label>
                  <label className="depot-petit">
                    <Icone nom="import" taille={20} />
                    <span>
                      <strong>{logo ? 'Logo importé' : 'Logo partenaire'}</strong>
                      <small>PNG transparent recommandé</small>
                    </span>
                    <input type="file" accept="image/png,image/jpeg" onChange={chargerImage(setLogo)} disabled={lectureSeule} />
                  </label>
                  <label className="champ">
                    <span className="etiquette">Date de sortie</span>
                    <input type="date" value={a.debut.slice(0, 10)} onChange={(e) => maj({ debut: `${e.target.value}T00:00:00` })} disabled={lectureSeule} />
                  </label>
                  <label className={`champ ${tente && erreursContenu.dates ? 'erreur' : ''}`}>
                    <span className="etiquette">Date de fin</span>
                    <input type="date" value={a.fin.slice(0, 10)} onChange={(e) => maj({ fin: `${e.target.value}T23:00:00` })} disabled={lectureSeule} />
                  </label>
                </div>
              </>
            )}

            {etape === 3 && (
              <>
                <h2>Associez une expérience</h2>
                <div className="grille-champs">
                  <label className={`champ ${tente && !a.animationAfficheId ? 'erreur' : ''}`}>
                    <span className="etiquette">Animation de l’affiche</span>
                    <select value={a.animationAfficheId} onChange={(e) => maj({ animationAfficheId: e.target.value })} disabled={lectureSeule}>
                      <option value="">Choisir…</option>
                      {animsAffiche.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.titre}
                        </option>
                      ))}
                    </select>
                    {animsAffiche.length === 0 && (
                      <span className="aide">
                        Aucune animation d’affiche : <Link to="/backoffice/animations">créez-en une</Link>.
                      </span>
                    )}
                  </label>
                  <label className={`champ ${tente && !a.animationLieuId ? 'erreur' : ''}`}>
                    <span className="etiquette">Monument promu (animation de lieu)</span>
                    <select value={a.animationLieuId} onChange={(e) => maj({ animationLieuId: e.target.value })} disabled={lectureSeule}>
                      {animsLieu.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.titre} — {etat.lieux.find((l) => l.id === x.lieuId)?.nomCourt}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {animA && (
                  <div className="experience-choisie">
                    <span className="vignette-exp">
                      <Icone nom="affiche" taille={22} />
                    </span>
                    <div>
                      <span className="pill pill-cyan">Animation d’affiche</span>
                      <h3>{animA.titre}</h3>
                      <p>
                        {animA.dureeS} s · {etat.fichiers.find((f) => f.id === animA.modeleId)?.nomOriginal ?? 'modèle à importer'}
                      </p>
                    </div>
                  </div>
                )}
                {animL && lieuPromu && (
                  <div className="experience-choisie">
                    {imageLieu(lieuPromu.image) ? <img src={imageLieu(lieuPromu.image)} alt="" /> : <span className="vignette-exp"><Icone nom="pin" taille={22} /></span>}
                    <div>
                      <span className="pill pill-green">Compatible</span>
                      <h3>{animL.titre}</h3>
                      <p>Après l’animation, la carte s’ouvrira centrée sur {lieuPromu.nom}.</p>
                    </div>
                    <Icone nom="check" taille={20} />
                  </div>
                )}
              </>
            )}

            {etape === 4 && (
              <>
                <h2>{pret ? 'Prête à publier' : 'Conditions de publication'}</h2>
                <ul className="conditions">
                  {ligneCondition(conditions.compteVerifie, 'Compte vérifié par la mairie', nomProprietaire(etat, a.proprietaireId))}
                  {ligneCondition(
                    conditions.fichiersConformes,
                    'Fichiers conformes au contrôle automatique',
                    animA ? `${animA.titre}` : 'Aucune animation d’affiche',
                    <Link to="/backoffice/fichiers" className="lien-panneau">Voir les fichiers</Link>,
                  )}
                  {ligneCondition(conditions.charteAcceptee, 'Charte d’utilisation acceptée', 'Version 1.0', <Link to="/backoffice/charte" className="lien-panneau">Accepter</Link>)}
                  {ligneCondition(
                    conditions.zoneAttribuee,
                    'Zone d’affichage attribuée par la mairie',
                    etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? `Proposée : ${etat.zones.find((z) => z.id === a.zoneProposeeId)?.nom} — en attente` : 'Aucune zone'),
                  )}
                </ul>

                <div className="bloc-zone">
                  <label className="champ">
                    <span className="etiquette">
                      {agent ? 'Attribuer la zone d’affichage' : 'Proposer une zone'}
                      <small>{agent ? 'Selon les règles d’affichage de la Ville' : 'La mairie attribue la zone ; vous pouvez en proposer une'}</small>
                    </span>
                    <select
                      value={agent ? (a.zoneId ?? '') : (a.zoneProposeeId ?? '')}
                      disabled={lectureSeule}
                      onChange={(e) => {
                        if (!existante) enregistrerAffiche(a)
                        if (agent) attribuerZone(a.id, e.target.value || undefined)
                        else if (e.target.value) proposerZone(a.id, e.target.value)
                        toast.afficher(agent ? 'Zone attribuée — partenaire notifié' : 'Proposition envoyée à la mairie')
                      }}
                    >
                      <option value="">{agent ? 'Aucune zone' : 'Choisir une zone…'}</option>
                      {etat.zones
                        .filter((z) => z.active)
                        .map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.nom} ({z.format})
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <ul className="verifications">
                  <li>
                    <Icone nom="check" taille={14} /> QR code unique généré : <code>{urlQr(a.codeQr)}</code>
                  </li>
                  <li>
                    <Icone nom={animA ? 'check' : 'fermer'} taille={14} /> Une animation est associée
                  </li>
                  <li>
                    <Icone nom="check" taille={14} /> Les mentions « Ville de Montbéliard » et « sans application » sont présentes
                  </li>
                  <li>
                    <Icone nom="check" taille={14} /> Le visuel respecte le format d’impression ({etat.modeles.find((m) => m.id === a.modeleId)?.format})
                  </li>
                </ul>
                <div className={`boite-pret ${pret ? '' : 'bloque'}`}>
                  <strong>{pret ? 'Votre affiche est prête' : 'Export et activation bloqués'}</strong>
                  <p>
                    {pret
                      ? 'Publiée sans validation humaine préalable : vous restez responsable du contenu, qui peut être signalé et retiré.'
                      : 'Les 4 conditions doivent être réunies pour exporter le PDF et activer l’animation (règle vérifiée aussi par l’API).'}
                  </p>
                </div>
              </>
            )}
          </section>

          <div className="pied-editeur">
            <button type="button" className="btn btn-fantome" onClick={() => (etape === 1 ? navigate('/backoffice/affiches') : setEtape(etape - 1))}>
              {etape === 1 ? 'Annuler' : 'Retour'}
            </button>
            {etape < 4 ? (
              <button type="button" className="btn btn-primaire" onClick={suivant}>
                Continuer <Icone nom="droite" taille={15} />
              </button>
            ) : (
              <div className="actions-finales">
                {a.statut !== 'PUBLIEE' && (
                  <button
                    type="button"
                    className="btn btn-secondaire"
                    disabled={!pret || lectureSeule}
                    onClick={() => {
                      if (!existante) enregistrerAffiche(a)
                      publierAffiche(a.id)
                      toast.afficher('Affiche publiée : son animation est active aux dates prévues')
                    }}
                  >
                    Publier
                  </button>
                )}
                <button type="button" className="btn btn-primaire" disabled={!pret} onClick={() => window.print()}>
                  <Icone nom="imprimer" taille={16} />
                  Exporter le PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="editeur-apercu">
          <div className="libelle-apercu">
            <span>Aperçu en temps réel</span>
            <span className="pill pill-stone">{etat.modeles.find((m) => m.id === a.modeleId)?.format}</span>
          </div>
          <ApercuAffiche d={donnees} />
          <p className="note-apercu">
            <Icone nom="info" taille={14} /> Le QR code renvoie uniquement vers l’application ; aucun lien externe n’est possible.
          </p>
        </aside>
      </div>
      {createPortal(
        <div className="zone-impression" aria-hidden="true">
          <ApercuAffiche d={donnees} echelle={2.4} />
        </div>,
        document.body,
      )}
      {toast.element}
    </>
  )
}
