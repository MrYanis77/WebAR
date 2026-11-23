// Zones d'affichage (emplacements où la Ville autorise les affiches) et attribution d'une zone aux
// affiches des partenaires. Rangées avec les affiches : une zone d'affichage sert uniquement aux affiches.
import { useState } from 'react'
import { CarteInteractive } from '../../commun/Carte'
import { projeter } from '../../commun/geo'
import { Icone } from '../../commun/Icone'
import { attribuerZone, enregistrerZone, nomProprietaire, type EtatDonnees } from '../../commun/store'
import type { Zone } from '../../commun/types'
import { ChoixPosition } from './ChoixPosition'
import { VILLE_ID } from '../session'
import { executer, Interrupteur, Panneau, Tiroir } from '../ui'

/** Formats du plus petit au plus grand (format maximal d'une zone d'affichage). */
const ORDRE_FORMATS = ['A4', 'A3', 'A2', 'A1', 'A0']

type Toast = { afficher: (m: string) => void }

export const nouvelleZone = (): Zone => ({ id: '', nom: '', adresse: '', latitude: 47.5095, longitude: 6.8, regles: '', format: 'A2', active: true })

/** Affiches de partenaires qui attendent une zone (ou dont la proposition est à examiner). */
export function affichesEnAttente(etat: Pick<EtatDonnees, 'affiches'>) {
  return etat.affiches.filter((a) => a.proprietaireId !== VILLE_ID && (!a.zoneId || a.zoneProposeeId) && a.statut !== 'RETIREE')
}

export function OngletZones({ etat, toast, onEditer }: { etat: EtatDonnees; toast: Toast; onEditer: (z: Zone) => void }) {
  return (
    <div className="grille-zones">
      <Panneau titre="Carte des zones" sousTitre="Emplacements où la Ville autorise l’affichage">
        <div className="carte-bo">
          <CarteInteractive
            vueInitiale={{ x: 60, y: 150, w: 300, h: 300 }}
            boutonsZoom
            surcouche={(versEcran) =>
              etat.zones.map((z) => {
                const p = projeter(z)
                return (
                  <button key={z.id} type="button" className={`marqueur-zone ${z.active ? '' : 'inactive'}`} style={versEcran(p.x, p.y)} onClick={() => onEditer(z)} title={z.nom}>
                    <Icone nom="affiche" taille={13} />
                  </button>
                )
              })
            }
          />
        </div>
      </Panneau>
      <Panneau titre="Zones">
        <ul className="liste-zones">
          {etat.zones.map((z) => {
            const attribuees = etat.affiches.filter((a) => a.zoneId === z.id && a.statut !== 'RETIREE')
            return (
              <li key={z.id}>
                <div>
                  <strong>{z.nom}</strong>
                  <small>
                    {z.adresse} · {z.format} maximum{z.regles ? ` · ${z.regles}` : ''}
                  </small>
                  <small>{attribuees.length ? `${attribuees.length} affiche${attribuees.length > 1 ? 's' : ''} : ${attribuees.map((a) => a.nom).join(', ')}` : 'Aucune affiche attribuée'}</small>
                </div>
                <Interrupteur actif={z.active} libelle={z.active ? 'Désactiver la zone' : 'Activer la zone'} onChange={() => executer(toast, () => enregistrerZone({ ...z, active: !z.active }))} />
                <button type="button" className="bo-icone" onClick={() => onEditer(z)} aria-label={`Modifier ${z.nom}`}>
                  <Icone nom="crayon" taille={15} />
                </button>
              </li>
            )
          })}
        </ul>
      </Panneau>
    </div>
  )
}

export function OngletAttributions({ etat, toast }: { etat: EtatDonnees; toast: Toast }) {
  const [choix, setChoix] = useState<Record<string, string>>({})
  const attente = affichesEnAttente(etat)
  return (
    <Panneau titre="Affiches en attente de zone" sousTitre="Aucune affiche de partenaire n’est exportée ni activée sans zone d’affichage attribuée par la mairie (BNF-16).">
      {attente.length === 0 ? (
        <p className="cellule-vide">Toutes les affiches ont une zone attribuée.</p>
      ) : (
        <div className="table-defilante">
          <table className="table">
            <thead>
              <tr>
                <th>Affiche</th>
                <th>Partenaire</th>
                <th>Zone actuelle</th>
                <th>Proposition</th>
                <th>Attribuer</th>
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
                    <td>{etat.zones.find((z) => z.id === a.zoneId)?.nom ?? '—'}</td>
                    <td>
                      {proposee ? (
                        <div className="actions-ligne">
                          <span>
                            {proposee.nom}
                            {depasse(proposee.format) && <small className="cellule-detail alerte-texte">Format trop grand ({proposee.format} max)</small>}
                          </span>
                          <button type="button" className="btn btn-primaire petit" onClick={() => executer(toast, () => attribuerZone(a.id, proposee.id), 'Proposition acceptée — partenaire notifié')}>
                            Accepter
                          </button>
                          <button type="button" className="btn btn-fantome petit" onClick={() => executer(toast, () => attribuerZone(a.id, undefined, true), 'Proposition refusée — partenaire notifié')}>
                            Refuser
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="actions-ligne">
                        <select value={choix[a.id] ?? ''} onChange={(e) => setChoix({ ...choix, [a.id]: e.target.value })} aria-label="Zone">
                          <option value="">Choisir…</option>
                          {etat.zones
                            .filter((z) => z.active)
                            .map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.nom} — {z.format} max{depasse(z.format) ? ' · trop petite' : ''}
                              </option>
                            ))}
                        </select>
                        <button type="button" className="btn btn-secondaire petit" disabled={!choix[a.id]} onClick={() => executer(toast, () => attribuerZone(a.id, choix[a.id]), 'Zone attribuée — partenaire notifié')}>
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

export function EditeurZone({ zone, onFermer, onEnregistrer }: { zone: Zone; onFermer: () => void; onEnregistrer: (z: Zone) => void }) {
  const [z, setZ] = useState(zone)
  const maj = (p: Partial<Zone>) => setZ({ ...z, ...p })
  return (
    <Tiroir
      ouvert
      titre={zone.nom ? zone.nom : 'Nouvelle zone d’affichage'}
      sousTitre="Emplacement où une affiche peut être collée, selon le règlement local de publicité. Une zone d’affichage sert aux affiches (pas aux animations de monument)."
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-primaire" disabled={!z.nom.trim() || !z.adresse.trim()} onClick={() => onEnregistrer(z)}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="formulaire-bo">
        <label className="champ">
          <span className="etiquette">Nom</span>
          <input value={z.nom} onChange={(e) => maj({ nom: e.target.value })} placeholder="Ex. Panneau place Saint-Martin" />
        </label>
        <div className="grille-champs">
          <label className="champ">
            <span className="etiquette">Adresse</span>
            <input value={z.adresse} onChange={(e) => maj({ adresse: e.target.value })} />
          </label>
          <label className="champ">
            <span className="etiquette">Format maximal</span>
            <select value={z.format} onChange={(e) => maj({ format: e.target.value })}>
              {ORDRE_FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
        <ChoixPosition latitude={z.latitude} longitude={z.longitude} onChange={(latitude, longitude) => maj({ latitude, longitude })} />
        <label className="champ">
          <span className="etiquette">Règles d’affichage</span>
          <textarea rows={3} value={z.regles} onChange={(e) => maj({ regles: e.target.value })} placeholder="Format, durée, secteur protégé…" />
        </label>
      </div>
    </Tiroir>
  )
}
