import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { CarteInteractive } from '../../commun/Carte'
import { RAYON_PAR_DEFAUT_M } from '../../commun/constantes'
import { VILLE_ID } from '../../commun/donnees'
import { deprojeter, METRES_PAR_UNITE, projeter } from '../../commun/geo'
import { Icone } from '../../commun/Icone'
import { imageLieu } from '../../commun/images'
import { attribuerZone, enregistrerLieu, enregistrerZone, nomProprietaire, uid, useEtat } from '../../commun/store'
import type { Lieu, Texte3, Zone } from '../../commun/types'
import { BadgeStatut, EnTetePage, Interrupteur, Onglets, Panneau, Tiroir, useToast } from '../ui'

type Onglet = 'lieux' | 'zones' | 'attributions'

export default function PageLieux() {
  const etat = useEtat()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const onglet = (params.get('onglet') as Onglet) || 'lieux'
  const [lieu, setLieu] = useState<Lieu | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const [choix, setChoix] = useState<Record<string, string>>({})
  const attente = etat.affiches.filter((a) => a.proprietaireId !== VILLE_ID && (!a.zoneId || a.zoneProposeeId) && a.statut !== 'RETIREE')

  function nouveauLieu() {
    const vide: Texte3 = { fr: '', en: '', de: '' }
    setLieu({ id: uid('lieu'), nom: '', nomCourt: '', categorie: { ...vide }, adresse: '', description: { ...vide }, latitude: 47.5085, longitude: 6.8005, rayonM: RAYON_PAR_DEFAUT_M, photosFacade: 0, actif: false, accesLibre: true })
  }

  return (
    <>
      <EnTetePage
        titre="Lieux & zones"
        description="Gérez les lieux culturels, leurs fiches FR/EN/DE et les zones d’affichage autorisées."
        actions={
          onglet === 'lieux' ? (
            <button type="button" className="btn btn-primaire" onClick={nouveauLieu}>
              <Icone nom="plus" taille={16} /> Ajouter un lieu
            </button>
          ) : onglet === 'zones' ? (
            <button
              type="button"
              className="btn btn-primaire"
              onClick={() => setZone({ id: uid('z'), nom: '', adresse: '', latitude: 47.5095, longitude: 6.8, regles: '', format: 'A2', active: true })}
            >
              <Icone nom="plus" taille={16} /> Ajouter une zone
            </button>
          ) : undefined
        }
      />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={onglet}
            onChange={(o) => setParams({ onglet: o })}
            options={[
              { id: 'lieux', libelle: 'Lieux', compte: etat.lieux.length },
              { id: 'zones', libelle: 'Zones d’affichage', compte: etat.zones.length },
              { id: 'attributions', libelle: 'Attributions', compte: attente.length },
            ]}
          />
        </div>

        {onglet === 'lieux' && (
          <div className="grille-lieux">
            {etat.lieux.map((l) => (
              <article key={l.id} className="carte-lieu">
                <div className="image-lieu">{imageLieu(l.image) ? <img src={imageLieu(l.image)} alt="" /> : <Icone nom="pin" taille={34} />}</div>
                <div className="corps-lieu">
                  <div className="titre-animation">
                    <div>
                      <h3>{l.nom}</h3>
                      <p>{l.categorie.fr}</p>
                    </div>
                    <Interrupteur
                      actif={l.actif}
                      libelle={l.actif ? 'Masquer le lieu' : 'Publier le lieu'}
                      onChange={() => {
                        enregistrerLieu({ ...l, actif: !l.actif })
                        toast.afficher(l.actif ? `${l.nomCourt} masqué de la carte` : `${l.nomCourt} visible sur la carte des visiteurs`)
                      }}
                    />
                  </div>
                  <ul className="faits-lieu">
                    <li>
                      <Icone nom="zone" taille={14} /> Rayon {l.rayonM} m
                    </li>
                    <li>
                      <Icone nom="appareil" taille={14} /> {l.photosFacade} photos de façade
                    </li>
                    <li>
                      <Icone nom="couches" taille={14} /> {etat.animations.filter((a) => a.lieuId === l.id).length} animation(s)
                    </li>
                    <li>
                      <Icone nom="globe" taille={14} /> {['fr', 'en', 'de'].filter((k) => l.description[k as keyof Texte3]).length}/3 langues
                    </li>
                  </ul>
                  <div className="pied-carte">
                    <BadgeStatut statut={l.actif ? 'PUBLIEE' : 'BROUILLON'} libelle={l.actif ? 'Sur la carte' : 'Masqué'} />
                    <button type="button" onClick={() => setLieu(l)}>
                      Modifier <Icone nom="droite" taille={13} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {onglet === 'zones' && (
          <div className="grille-zones">
            <Panneau titre="Carte des zones" sousTitre="Emplacements autorisés par la Ville">
              <div className="carte-bo">
                <CarteInteractive
                  vueInitiale={{ x: 60, y: 150, w: 300, h: 300 }}
                  boutonsZoom
                  surcouche={(versEcran) =>
                    etat.zones.map((z) => {
                      const p = projeter(z)
                      return (
                        <button key={z.id} type="button" className={`marqueur-zone ${z.active ? '' : 'inactive'}`} style={versEcran(p.x, p.y)} onClick={() => setZone(z)} title={z.nom}>
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
                {etat.zones.map((z) => (
                  <li key={z.id}>
                    <div>
                      <strong>{z.nom}</strong>
                      <small>
                        {z.format} · {z.regles}
                      </small>
                      <small>{etat.affiches.filter((a) => a.zoneId === z.id).length} affiche(s) attribuée(s)</small>
                    </div>
                    <Interrupteur actif={z.active} libelle={z.active ? 'Désactiver la zone' : 'Activer la zone'} onChange={() => enregistrerZone({ ...z, active: !z.active })} />
                    <button type="button" className="bo-icone" onClick={() => setZone(z)} aria-label={`Modifier ${z.nom}`}>
                      <Icone nom="crayon" taille={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </Panneau>
          </div>
        )}

        {onglet === 'attributions' && (
          <Panneau titre="Affiches en attente de zone" sousTitre="Aucune affiche de partenaire n’est exportée ni activée sans zone attribuée par la mairie (BNF-16).">
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
                      return (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.nom}</strong>
                          </td>
                          <td>{nomProprietaire(etat, a.proprietaireId)}</td>
                          <td>{etat.zones.find((z) => z.id === a.zoneId)?.nom ?? '—'}</td>
                          <td>
                            {proposee ? (
                              <div className="actions-ligne">
                                <span>{proposee.nom}</span>
                                <button
                                  type="button"
                                  className="btn btn-primaire petit"
                                  onClick={() => {
                                    attribuerZone(a.id, proposee.id)
                                    toast.afficher('Proposition acceptée — partenaire notifié')
                                  }}
                                >
                                  Accepter
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-fantome petit"
                                  onClick={() => {
                                    attribuerZone(a.id, undefined, true)
                                    toast.afficher('Proposition refusée — partenaire notifié')
                                  }}
                                >
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
                                      {z.nom}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-secondaire petit"
                                disabled={!choix[a.id]}
                                onClick={() => {
                                  attribuerZone(a.id, choix[a.id])
                                  toast.afficher('Zone attribuée — partenaire notifié')
                                }}
                              >
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
        )}
      </div>

      {lieu && (
        <EditeurLieu
          lieu={lieu}
          onFermer={() => setLieu(null)}
          onEnregistrer={(l) => {
            enregistrerLieu(l)
            setLieu(null)
            toast.afficher(`Lieu « ${l.nomCourt || l.nom} » enregistré`)
          }}
        />
      )}
      {zone && (
        <EditeurZone
          zone={zone}
          onFermer={() => setZone(null)}
          onEnregistrer={(z) => {
            enregistrerZone(z)
            setZone(null)
            toast.afficher(`Zone « ${z.nom} » enregistrée`)
          }}
        />
      )}
      {toast.element}
    </>
  )
}

function ChoixPosition({ latitude, longitude, rayonM, onChange }: { latitude: number; longitude: number; rayonM?: number; onChange: (lat: number, lng: number) => void }) {
  const p = projeter({ latitude, longitude })
  return (
    <div className="carte-bo petite">
      <CarteInteractive
        vueInitiale={{ x: p.x - 110, y: p.y - 110, w: 220, h: 220 }}
        boutonsZoom
        onClicCarte={(x, y) => {
          const c = deprojeter(x, y)
          onChange(Number(c.latitude.toFixed(6)), Number(c.longitude.toFixed(6)))
        }}
        calques={rayonM ? <circle cx={p.x} cy={p.y} r={rayonM / METRES_PAR_UNITE} fill="rgb(123 30 46 / 0.12)" stroke="#7b1e2e" strokeDasharray="3 3" /> : null}
        surcouche={(versEcran) => (
          <span className="epingle" style={versEcran(p.x, p.y)}>
            <Icone nom="pin" taille={22} />
          </span>
        )}
      />
      <small className="coordonnees">
        Cliquez sur la carte · {latitude.toFixed(5)}, {longitude.toFixed(5)}
      </small>
    </div>
  )
}

function EditeurLieu({ lieu, onFermer, onEnregistrer }: { lieu: Lieu; onFermer: () => void; onEnregistrer: (l: Lieu) => void }) {
  const [l, setL] = useState(lieu)
  const [langue, setLangue] = useState<keyof Texte3>('fr')
  const [photos, setPhotos] = useState<string[]>([])
  const [tente, setTente] = useState(false)
  const maj = (p: Partial<Lieu>) => setL({ ...l, ...p })
  const valide = l.nom.trim() && l.nomCourt.trim() && l.adresse.trim() && l.description.fr.trim() && l.categorie.fr.trim()

  return (
    <Tiroir
      ouvert
      large
      titre={lieu.nom ? `Modifier « ${lieu.nomCourt} »` : 'Nouveau lieu'}
      sousTitre="Un nouveau lieu et son animation s’ajoutent sans modifier le code (BNF-13)."
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primaire"
            onClick={() => {
              setTente(true)
              if (valide) onEnregistrer({ ...l, photosFacade: l.photosFacade + photos.length })
            }}
          >
            Enregistrer le lieu
          </button>
        </>
      }
    >
      <div className="formulaire-bo">
        <div className="grille-champs">
          <label className={`champ ${tente && !l.nom.trim() ? 'erreur' : ''}`}>
            <span className="etiquette">Nom</span>
            <input value={l.nom} onChange={(e) => maj({ nom: e.target.value })} maxLength={150} />
          </label>
          <label className={`champ ${tente && !l.nomCourt.trim() ? 'erreur' : ''}`}>
            <span className="etiquette">
              Nom court <small>Marqueur de la carte</small>
            </span>
            <input value={l.nomCourt} onChange={(e) => maj({ nomCourt: e.target.value })} maxLength={20} />
          </label>
          <label className={`champ pleine ${tente && !l.adresse.trim() ? 'erreur' : ''}`}>
            <span className="etiquette">Adresse</span>
            <input value={l.adresse} onChange={(e) => maj({ adresse: e.target.value })} />
          </label>
        </div>
        <div className="bloc-position">
          <ChoixPosition latitude={l.latitude} longitude={l.longitude} rayonM={l.rayonM} onChange={(latitude, longitude) => maj({ latitude, longitude })} />
          <div>
            <label className="champ">
              <span className="etiquette">
                Rayon de proximité <small>{l.rayonM} m</small>
              </span>
              <input type="range" min={20} max={200} step={5} value={l.rayonM} onChange={(e) => maj({ rayonM: Number(e.target.value) })} />
              <span className="aide">Message « Vous êtes arrivé » et lancement manuel dans ce rayon (50 m par défaut).</span>
            </label>
            <label className="case">
              <input type="checkbox" checked={l.accesLibre} onChange={(e) => maj({ accesLibre: e.target.checked })} />
              Accès libre
            </label>
            <label className="case">
              <input type="checkbox" checked={l.actif} onChange={(e) => maj({ actif: e.target.checked })} />
              Visible sur la carte des visiteurs
            </label>
          </div>
        </div>
        <fieldset className={`transcriptions ${tente && (!l.description.fr.trim() || !l.categorie.fr.trim()) ? 'erreur' : ''}`}>
          <legend>Fiche du lieu</legend>
          <Onglets
            valeur={langue}
            onChange={setLangue}
            options={[
              { id: 'fr', libelle: `Français${l.description.fr ? ' ✓' : ''}` },
              { id: 'en', libelle: `English${l.description.en ? ' ✓' : ''}` },
              { id: 'de', libelle: `Deutsch${l.description.de ? ' ✓' : ''}` },
            ]}
          />
          <label className="champ">
            <span className="etiquette">Catégorie</span>
            <input value={l.categorie[langue]} onChange={(e) => maj({ categorie: { ...l.categorie, [langue]: e.target.value } })} placeholder="Patrimoine & histoire" />
          </label>
          <label className="champ">
            <span className="etiquette">Présentation historique</span>
            <textarea rows={4} value={l.description[langue]} onChange={(e) => maj({ description: { ...l.description, [langue]: e.target.value } })} />
          </label>
        </fieldset>
        <div className="photos-facade">
          <div>
            <strong>Photos de façade pour la reconnaissance</strong>
            <p>Détails (entrée, tour, logo), de jour et de nuit. Compilées en un seul fichier de cible .mind. {l.photosFacade + photos.length} photo(s).</p>
          </div>
          <div className="vignettes">
            {photos.map((p) => (
              <img key={p} src={p} alt="" />
            ))}
            <label className="ajout-photo">
              <Icone nom="plus" taille={18} />
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? []).map((f) => URL.createObjectURL(f))])}
              />
            </label>
          </div>
        </div>
      </div>
    </Tiroir>
  )
}

function EditeurZone({ zone, onFermer, onEnregistrer }: { zone: Zone; onFermer: () => void; onEnregistrer: (z: Zone) => void }) {
  const [z, setZ] = useState(zone)
  const maj = (p: Partial<Zone>) => setZ({ ...z, ...p })
  return (
    <Tiroir
      ouvert
      titre={zone.nom ? zone.nom : 'Nouvelle zone d’affichage'}
      sousTitre="Emplacement autorisé selon le règlement local de publicité."
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
          <input value={z.nom} onChange={(e) => maj({ nom: e.target.value })} />
        </label>
        <div className="grille-champs">
          <label className="champ">
            <span className="etiquette">Adresse</span>
            <input value={z.adresse} onChange={(e) => maj({ adresse: e.target.value })} />
          </label>
          <label className="champ">
            <span className="etiquette">Format maximal</span>
            <select value={z.format} onChange={(e) => maj({ format: e.target.value })}>
              {['A3', 'A2', 'A1', 'A0'].map((f) => (
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
