// Zones d'affichage (emplacements où la Ville autorise les affiches) et attribution d'une zone aux
// affiches des partenaires. Rangées avec les affiches : une zone d'affichage sert uniquement aux affiches.
// Refonte UX : chaque zone montre ses affiches, les monuments vers lesquels elles mènent et un contrôle
// « tout est en ordre ? » ; l'éditeur suit trois étapes numérotées avec une aide pour chacune.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icone, type NomIcone } from '../../commun/Icone'
import { attribuerZone, enregistrerZone, nomProprietaire, type EtatDonnees } from '../../commun/store'
import type { Affiche, Zone } from '../../commun/types'
import CarteZones, { zonePositionnee } from './CarteZones'
import { ChoixPosition } from './ChoixPosition'
import { VILLE_ID } from '../session'
import { BadgeStatut, executer, Interrupteur, Panneau, Tiroir } from '../ui'

/** Formats du plus petit au plus grand (format maximal d'une zone d'affichage). */
const ORDRE_FORMATS = ['A4', 'A3', 'A2', 'A1', 'A0']
const DIMENSIONS_FORMATS: Record<string, string> = { A4: '21 × 29,7 cm', A3: '29,7 × 42 cm', A2: '42 × 59,4 cm', A1: '59,4 × 84,1 cm', A0: '84,1 × 118,9 cm' }

type Toast = { afficher: (m: string) => void }

export const nouvelleZone = (): Zone => ({ id: '', nom: '', adresse: '', latitude: 47.5095, longitude: 6.8, regles: '', format: 'A2', active: true })

/** Affiches de partenaires qui attendent une zone (ou dont la proposition est à examiner). */
export function affichesEnAttente(etat: Pick<EtatDonnees, 'affiches'>) {
  return etat.affiches.filter((a) => a.proprietaireId !== VILLE_ID && (!a.zoneId || a.zoneProposeeId) && a.statut !== 'RETIREE')
}

/** Affiche visible des visiteurs aujourd'hui : publiée et dans sa période d'affichage. */
const diffusee = (a: Affiche, maintenant = new Date()) => a.statut === 'PUBLIEE' && new Date(a.debut) <= maintenant && new Date(a.fin) >= maintenant

const positionnee = zonePositionnee

/** Contrôle d'une zone : ce qui est en ordre et ce qui reste à faire, en clair. */
export function controleZone(z: Zone, affiches: Affiche[]) {
  const publiees = affiches.filter((a) => diffusee(a))
  return [
    { ok: positionnee(z), texte: positionnee(z) ? 'Placée sur la carte' : 'Pas encore placée sur la carte : modifiez la zone' },
    { ok: z.active, texte: z.active ? 'Ouverte aux affiches' : 'Désactivée : aucune nouvelle affiche ne peut la choisir' },
    {
      ok: publiees.length > 0,
      alerte: true,
      texte: publiees.length ? `Visible dans l’application : ${publiees.length} affiche${publiees.length > 1 ? 's' : ''} en ce moment` : 'Aucune affiche diffusée ici pour l’instant',
    },
  ]
}

/** Mode d'emploi en 4 étapes, visible en haut de la page. */
export function CommentCaMarche({ ouvert, onBasculer }: { ouvert: boolean; onBasculer: () => void }) {
  const etapes: { icone: NomIcone; titre: string; texte: ReactNode }[] = [
    { icone: 'plus', titre: 'Créez la zone', texte: 'Donnez-lui un nom, une adresse, placez-la sur la carte et indiquez la plus grande affiche acceptée.' },
    {
      icone: 'affiche',
      titre: 'Associez les affiches',
      texte: (
        <>
          Le partenaire choisit la zone en créant son affiche. Vous acceptez sa demande dans <Link to="/backoffice/affiches/attributions">Zones à attribuer</Link>.
        </>
      ),
    },
    { icone: 'pin', titre: 'Reliez au monument', texte: 'Chaque affiche invite le visiteur vers un monument, choisi dans l’affiche (étape « Textes »).' },
    { icone: 'check', titre: 'Vérifiez', texte: 'Chaque zone ci-dessous indique si tout est en ordre et si elle est visible dans l’application.' },
  ]
  return (
    <section className={`comment-ca-marche ${ouvert ? 'ouvert' : ''}`} aria-label="Comment ça marche">
      <button type="button" className="tete-comment" onClick={onBasculer} aria-expanded={ouvert}>
        <Icone nom="aide" taille={18} />
        <strong>Comment ça marche ?</strong>
        <span>{ouvert ? 'Masquer' : 'Afficher le mode d’emploi'}</span>
        <Icone nom={ouvert ? 'haut' : 'bas'} taille={16} />
      </button>
      {ouvert && (
        <ol>
          {etapes.map((e, i) => (
            <li key={e.titre}>
              <span className="numero-comment">{i + 1}</span>
              <div>
                <strong>
                  <Icone nom={e.icone} taille={15} /> {e.titre}
                </strong>
                <p>{e.texte}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function OngletZones({ etat, toast, onEditer }: { etat: EtatDonnees; toast: Toast; onEditer: (z: Zone) => void }) {
  const [survol, setSurvol] = useState<string | null>(null)
  if (etat.zones.length === 0)
    return (
      <Panneau>
        <div className="vide">
          <span>
            <Icone nom="zone" taille={24} />
          </span>
          <strong>Aucune zone d’affichage pour l’instant</strong>
          <p>Commencez par créer le premier emplacement où les affiches pourront être collées.</p>
          <button type="button" className="btn btn-primaire" onClick={() => onEditer(nouvelleZone())}>
            <Icone nom="plus" taille={16} /> Créer la première zone
          </button>
        </div>
      </Panneau>
    )
  return (
    <div className="grille-zones">
      <Panneau titre="Carte des zones" sousTitre="Cliquez sur un repère pour modifier la zone.">
        {/* Vraie carte, cadrée sur toutes les zones (l'ancienne carte stylisée n'en montrait qu'une partie). */}
        <CarteZones zones={etat.zones} survol={survol} onChoix={onEditer} libelleRepere={(z) => `${z.nom} — cliquer pour modifier`} className="carte-bo carte-zones" />
        <div className="legende-zones" aria-hidden="true">
          <span>
            <i className="active" /> Zone ouverte
          </span>
          <span>
            <i /> Zone désactivée
          </span>
        </div>
      </Panneau>
      <Panneau titre={`Les zones (${etat.zones.length})`} sousTitre="Ce qui est affiché à chaque endroit, et ce qu’il reste à faire.">
        <ul className="cartes-zones">
          {etat.zones.map((z) => {
            const ici = etat.affiches.filter((a) => a.zoneId === z.id && a.statut !== 'RETIREE')
            const demandes = etat.affiches.filter((a) => a.zoneProposeeId === z.id && a.zoneId !== z.id && a.statut !== 'RETIREE')
            const lieux = [...new Set(ici.map((a) => a.lieuId))].map((id) => etat.lieux.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => !!l)
            const controle = controleZone(z, ici)
            return (
              <li key={z.id} className={`carte-zone ${z.active ? '' : 'inactive'}`} onMouseEnter={() => setSurvol(z.id)} onMouseLeave={() => setSurvol(null)}>
                <div className="tete-carte-zone">
                  <div>
                    <strong>{z.nom}</strong>
                    <small>
                      <Icone nom="pin" taille={13} /> {z.adresse || 'Adresse à compléter'}
                    </small>
                  </div>
                  <span className="pill pill-stone" title={DIMENSIONS_FORMATS[z.format]}>
                    Jusqu’au {z.format}
                  </span>
                  <Interrupteur actif={z.active} libelle={z.active ? `Désactiver la zone ${z.nom}` : `Activer la zone ${z.nom}`} onChange={() => executer(toast, () => enregistrerZoneDepuis(z), z.active ? 'Zone désactivée' : 'Zone activée')} />
                  <button type="button" className="btn btn-secondaire petit" onClick={() => onEditer(z)}>
                    <Icone nom="crayon" taille={14} /> Modifier
                  </button>
                </div>
                <div className="liens-zone">
                  <div>
                    <small>Affiches ici</small>
                    {ici.length ? (
                      <ul className="puces-zone">
                        {ici.map((a) => (
                          <li key={a.id}>
                            <Link to={`/backoffice/affiches/${a.id}`}>{a.nom}</Link> <BadgeStatut statut={a.statut} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Aucune pour l’instant.</p>
                    )}
                    {demandes.length > 0 && (
                      <Link className="lien-panneau" to="/backoffice/affiches/attributions">
                        <Icone nom="drapeau" taille={13} /> {demandes.length} demande{demandes.length > 1 ? 's' : ''} à examiner
                      </Link>
                    )}
                  </div>
                  <div>
                    <small>Monuments mis en avant</small>
                    {lieux.length ? (
                      <ul className="puces-zone">
                        {lieux.map((l) => (
                          <li key={l.id}>
                            <Icone nom="pin" taille={13} /> {l.nomCourt || l.nom}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Aucun : ils sont choisis dans chaque affiche.</p>
                    )}
                  </div>
                </div>
                <ul className="controle-zone" aria-label={`Vérification de la zone ${z.nom}`}>
                  {controle.map((c) => (
                    <li key={c.texte} className={c.ok ? 'ok' : c.alerte ? 'alerte' : 'ko'}>
                      <Icone nom={c.ok ? 'check' : 'alerte'} taille={14} /> {c.texte}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </Panneau>
    </div>
  )
}

/** L'interrupteur enregistre la zone telle quelle, avec son état inversé. */
const enregistrerZoneDepuis = (z: Zone) => enregistrerZone({ ...z, active: !z.active })

export function OngletAttributions({ etat, toast }: { etat: EtatDonnees; toast: Toast }) {
  const [choix, setChoix] = useState<Record<string, string>>({})
  const attente = affichesEnAttente(etat)
  return (
    <Panneau titre="Affiches en attente d’une zone" sousTitre="Une affiche de partenaire ne peut être ni publiée ni imprimée sans zone d’affichage attribuée par la mairie.">
      {attente.length === 0 ? (
        <div className="vide">
          <span>
            <Icone nom="check" taille={24} />
          </span>
          <strong>Rien à traiter</strong>
          <p>Toutes les affiches des partenaires ont une zone attribuée.</p>
        </div>
      ) : (
        <div className="table-defilante">
          <table className="table">
            <thead>
              <tr>
                <th>Affiche</th>
                <th>Partenaire</th>
                <th>Zone actuelle</th>
                <th>Demande du partenaire</th>
                <th>Ou choisir une autre zone</th>
              </tr>
            </thead>
            <tbody>
              {attente.map((a) => {
                const proposee = etat.zones.find((z) => z.id === a.zoneProposeeId)
                const depasse = (format: string) => ORDRE_FORMATS.indexOf(a.format ?? 'A3') > ORDRE_FORMATS.indexOf(format)
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.nom}</strong>
                      <small className="cellule-detail">Format {a.format ?? 'A3'}</small>
                    </td>
                    <td>{nomProprietaire(etat, a.proprietaireId)}</td>
                    <td>{etat.zones.find((z) => z.id === a.zoneId)?.nom ?? 'Aucune'}</td>
                    <td>
                      {proposee ? (
                        <div className="actions-ligne">
                          <span>
                            {proposee.nom}
                            {depasse(proposee.format) && <small className="cellule-detail alerte-texte">Affiche trop grande pour cette zone ({proposee.format} maximum)</small>}
                          </span>
                          <button type="button" className="btn btn-primaire petit" onClick={() => executer(toast, () => attribuerZone(a.id, proposee.id), 'Demande acceptée : le partenaire est prévenu par mail')}>
                            Accepter
                          </button>
                          <button type="button" className="btn btn-fantome petit" onClick={() => executer(toast, () => attribuerZone(a.id, undefined, true), 'Demande refusée : le partenaire est prévenu par mail')}>
                            Refuser
                          </button>
                        </div>
                      ) : (
                        <span className="cellule-detail">Pas de demande</span>
                      )}
                    </td>
                    <td>
                      <div className="actions-ligne">
                        <select value={choix[a.id] ?? ''} onChange={(e) => setChoix({ ...choix, [a.id]: e.target.value })} aria-label={`Zone pour l’affiche ${a.nom}`}>
                          <option value="">Choisir une zone…</option>
                          {etat.zones
                            .filter((z) => z.active)
                            .map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.nom} — jusqu’au {z.format}
                                {depasse(z.format) ? ' (trop petite)' : ''}
                              </option>
                            ))}
                        </select>
                        <button type="button" className="btn btn-secondaire petit" disabled={!choix[a.id]} onClick={() => executer(toast, () => attribuerZone(a.id, choix[a.id]), 'Zone attribuée : le partenaire est prévenu par mail')}>
                          Attribuer
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panneau>
  )
}

/** Création ou modification d'une zone, en trois étapes numérotées. */
export function EditeurZone({ zone, onFermer, onEnregistrer }: { zone: Zone; onFermer: () => void; onEnregistrer: (z: Zone) => void }) {
  // Zone jamais placée (0, 0 : au milieu de l'océan) : la carte s'ouvre sur Montbéliard.
  const [z, setZ] = useState(() => (positionnee(zone) ? zone : { ...zone, latitude: nouvelleZone().latitude, longitude: nouvelleZone().longitude }))
  const [tente, setTente] = useState(false)
  const maj = (p: Partial<Zone>) => setZ({ ...z, ...p })
  const manque = { nom: !z.nom.trim(), adresse: !z.adresse.trim() }
  const valider = () => {
    setTente(true)
    if (!manque.nom && !manque.adresse) onEnregistrer(z)
  }
  return (
    <Tiroir
      ouvert
      large
      titre={zone.id ? `Modifier « ${zone.nom} »` : 'Nouvelle zone d’affichage'}
      sousTitre="Un emplacement de la ville où les affiches peuvent être collées (panneau, vitrine, mur d’expression libre…), selon le règlement local de publicité."
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-primaire" onClick={valider}>
            <Icone nom="check" taille={15} /> {zone.id ? 'Enregistrer les modifications' : 'Créer la zone'}
          </button>
        </>
      }
    >
      <div className="formulaire-bo formulaire-zone">
        <section className="etape-formulaire">
          <h3>
            <span>1</span> Où se trouve-t-elle ?
          </h3>
          <div className="grille-champs">
            <label className={`champ ${tente && manque.nom ? 'erreur' : ''}`}>
              <span className="etiquette">
                Nom de la zone <small>Obligatoire</small>
              </span>
              <input value={z.nom} onChange={(e) => maj({ nom: e.target.value })} maxLength={150} placeholder="Ex. : Panneau de la place Saint-Martin" />
              <span className="aide">Un nom que les partenaires reconnaîtront facilement.</span>
              {tente && manque.nom && <span className="message-erreur">Donnez un nom à la zone.</span>}
            </label>
            <label className={`champ ${tente && manque.adresse ? 'erreur' : ''}`}>
              <span className="etiquette">
                Adresse <small>Obligatoire</small>
              </span>
              <input value={z.adresse} onChange={(e) => maj({ adresse: e.target.value })} maxLength={255} placeholder="Ex. : Place Saint-Martin, 25200 Montbéliard" />
              <span className="aide">Elle s’affiche aussi pour les visiteurs, pour trouver l’affiche.</span>
              {tente && manque.adresse && <span className="message-erreur">Indiquez l’adresse de la zone.</span>}
            </label>
          </div>
          <p className="aide-bloc">Placez ensuite le repère à l’endroit exact du panneau : cherchez l’adresse ou cliquez sur la carte.</p>
          <ChoixPosition latitude={z.latitude} longitude={z.longitude} rechercheInitiale={z.adresse} onChange={(latitude, longitude) => maj({ latitude, longitude })} />
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>2</span> Quelles affiches accepte-t-elle ?
          </h3>
          <div className="formats-zone" role="radiogroup" aria-label="Plus grande affiche acceptée">
            {ORDRE_FORMATS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={z.format === f} className={z.format === f ? 'actif' : ''} onClick={() => maj({ format: f })}>
                <span className={`feuille-mini f-${f}`} aria-hidden="true" />
                <strong>{f}</strong>
                <small>{DIMENSIONS_FORMATS[f]}</small>
              </button>
            ))}
          </div>
          <span className="aide-champ">La plus grande affiche que l’emplacement peut recevoir. Les formats plus petits sont aussi acceptés.</span>
          <label className="champ">
            <span className="etiquette">
              Règles à respecter <small>Facultatif · montrées aux partenaires</small>
            </span>
            <textarea rows={3} value={z.regles} onChange={(e) => maj({ regles: e.target.value })} placeholder="Ex. : affichage de 15 jours maximum, secteur protégé, pas de colle sur la pierre…" />
          </label>
        </section>

        <section className="etape-formulaire">
          <h3>
            <span>3</span> Est-elle ouverte ?
          </h3>
          <label className="case case-mise-en-avant">
            <input type="checkbox" checked={z.active} onChange={(e) => maj({ active: e.target.checked })} />
            <span>
              <strong>Zone ouverte aux affiches</strong>
              <small>Décochée, la zone reste enregistrée mais les partenaires ne peuvent plus la choisir.</small>
            </span>
          </label>
        </section>
      </div>
    </Tiroir>
  )
}
