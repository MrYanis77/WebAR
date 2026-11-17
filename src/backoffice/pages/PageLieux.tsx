import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { CarteInteractive } from '../../commun/Carte'
import { ChoixPosition } from '../composants/ChoixPosition'
import { RAYON_PAR_DEFAUT_M } from '../../commun/constantes'
import { projeter } from '../../commun/geo'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { attendreControle, attribuerZone, enregistrerAnimation, enregistrerLieu, enregistrerZone, importerFichier, nomProprietaire, supprimerLieu, useEtat } from '../../commun/store'
import type { Animation, Lieu, Texte3, Zone } from '../../commun/types'
import { EditeurAnimation } from './PageAnimations'
import { proprietaireDe, useSession, VILLE_ID } from '../session'
import { BadgeStatut, DialogueSuppression, EnTetePage, executer, Interrupteur, maintenantLocal, Onglets, Panneau, Tiroir, useToast } from '../ui'

type Onglet = 'lieux' | 'zones' | 'attributions'

export default function PageLieux() {
  const etat = useEtat()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const onglet = (params.get('onglet') as Onglet) || 'lieux'
  const [lieu, setLieu] = useState<Lieu | null>(null)
  const [aSupprimer, setASupprimer] = useState<Lieu | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const [choix, setChoix] = useState<Record<string, string>>({})
  const attente = etat.affiches.filter((a) => a.proprietaireId !== VILLE_ID && (!a.zoneId || a.zoneProposeeId) && a.statut !== 'RETIREE')

  function nouveauLieu() {
    const vide: Texte3 = { fr: '', en: '', de: '' }
    setLieu({ id: '', nom: '', nomCourt: '', categorie: { ...vide }, adresse: '', description: { ...vide }, latitude: 47.5085, longitude: 6.8005, rayonM: RAYON_PAR_DEFAUT_M, actif: false, accesLibre: true })
  }

  return (
    <>
      <EnTetePage
        titre="Monuments & zones"
        description="Créez les monuments et leur animation 3D (fiche, position GPS, placement autour du bâtiment), et les zones d’affichage des affiches."
        actions={
          onglet === 'lieux' ? (
            <button type="button" className="btn btn-primaire" onClick={nouveauLieu}>
              <Icone nom="plus" taille={16} /> Créer un monument
            </button>
          ) : onglet === 'zones' ? (
            <button
              type="button"
              className="btn btn-primaire"
              onClick={() => setZone({ id: '', nom: '', adresse: '', latitude: 47.5095, longitude: 6.8, regles: '', format: 'A2', active: true })}
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
              { id: 'lieux', libelle: 'Monuments', compte: etat.lieux.length },
              { id: 'zones', libelle: 'Zones d’affichage', compte: etat.zones.length },
              { id: 'attributions', libelle: 'Attributions', compte: attente.length },
            ]}
          />
        </div>

        {onglet === 'lieux' && (
          <div className="grille-lieux">
            {etat.lieux.map((l) => (
              <article key={l.id} className="carte-lieu">
                <div className="image-lieu">{l.image ? <img src={l.image} alt="" /> : <Icone nom="pin" taille={34} />}</div>
                <div className="corps-lieu">
                  <div className="titre-animation">
                    <div>
                      <h3>{l.nom}</h3>
                      <p>{l.categorie.fr}</p>
                    </div>
                    <Interrupteur
                      actif={l.actif}
                      libelle={l.actif ? 'Masquer le lieu' : 'Publier le lieu'}
                      onChange={() =>
                        executer(toast, () => enregistrerLieu({ ...l, actif: !l.actif }), l.actif ? `${l.nomCourt} masqué de la carte` : `${l.nomCourt} visible sur la carte des visiteurs`)
                      }
                    />
                  </div>
                  <ul className="faits-lieu">
                    <li>
                      <Icone nom="zone" taille={14} /> Rayon {l.rayonM} m
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
                    <span className="actions-carte">
                      <button type="button" className="supprimer" onClick={() => setASupprimer(l)} aria-label={`Supprimer ${l.nom}`} title="Supprimer">
                        <Icone nom="poubelle" taille={14} />
                      </button>
                      <button type="button" onClick={() => setLieu(l)}>
                        <Icone nom="crayon" taille={13} /> Ouvrir
                      </button>
                    </span>
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
                    <Interrupteur actif={z.active} libelle={z.active ? 'Désactiver la zone' : 'Activer la zone'} onChange={() => executer(toast, () => enregistrerZone({ ...z, active: !z.active }))} />
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
                                  onClick={() => executer(toast, () => attribuerZone(a.id, proposee.id), 'Proposition acceptée — partenaire notifié')}
                                >
                                  Accepter
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-fantome petit"
                                  onClick={() => executer(toast, () => attribuerZone(a.id, undefined, true), 'Proposition refusée — partenaire notifié')}
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
                                onClick={() => executer(toast, () => attribuerZone(a.id, choix[a.id]), 'Zone attribuée — partenaire notifié')}
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
          onSupprimer={lieu.id ? () => setASupprimer(lieu) : undefined}
          onEnregistrer={async (l) => {
            const enregistre = await enregistrerLieu(l)
            toast.afficher(`« ${l.nomCourt || l.nom} » enregistré`)
            return enregistre
          }}
        />
      )}
      {zone && (
        <EditeurZone
          zone={zone}
          onFermer={() => setZone(null)}
          onEnregistrer={async (z) => {
            if (await executer(toast, () => enregistrerZone(z), `Zone « ${z.nom} » enregistrée`)) setZone(null)
          }}
        />
      )}
      <DialogueSuppression
        cible={aSupprimer?.nom ?? null}
        description="Le lieu disparaîtra de la carte des visiteurs et des zones de proximité. Les animations qui y sont rattachées doivent d’abord être supprimées ou déplacées. La suppression reste inscrite au journal."
        onFermer={() => setASupprimer(null)}
        onConfirmer={async () => {
          const r = await supprimerLieu(aSupprimer!.id)
          if (r.ok) {
            setLieu(null)
            toast.afficher(`Lieu « ${aSupprimer!.nomCourt || aSupprimer!.nom} » supprimé`)
          }
          return r
        }}
      />
      {toast.element}
    </>
  )
}

type EtapeMonument = 'lieu' | 'position' | 'animation'

const ETAPES_MONUMENT: { id: EtapeMonument; titre: string; aide: string }[] = [
  { id: 'lieu', titre: 'Le monument', aide: 'Nom, adresse, fiche' },
  { id: 'position', titre: 'Position GPS', aide: 'Sur la carte, rayon' },
  { id: 'animation', titre: 'Animation 3D', aide: 'Modèle et placement' },
]

/**
 * Parcours de création d'un monument, en 3 étapes : 1. le monument (nom, adresse, fiche FR/EN/DE,
 * visuel), 2. sa position GPS précise sur la carte et le rayon de proximité, 3. son animation 3D,
 * placée à son point GPS autour du bâtiment. Le monument est enregistré à tout moment
 * (« Enregistrer ») ; l'étape 3 demande qu'il soit enregistré une première fois.
 */
function EditeurLieu({
  lieu,
  onFermer,
  onEnregistrer,
  onSupprimer,
}: {
  lieu: Lieu
  onFermer: () => void
  /** Enregistre le monument ; renvoie le monument enregistré. */
  onEnregistrer: (l: Lieu) => Promise<Lieu>
  onSupprimer?: () => void
}) {
  const etat = useEtat()
  const session = useSession()
  const [l, setL] = useState(lieu)
  const [etape, setEtape] = useState<EtapeMonument>('lieu')
  const [langue, setLangue] = useState<keyof Texte3>('fr')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [animation, setAnimation] = useState<Animation | null>(null)

  /** Visuel de la fiche : image importée puis contrôlée par l'API (sharp). */
  async function importerVisuel(fichier: File) {
    setErreur(null)
    setEnvoi('visuel')
    try {
      const cree = await importerFichier(fichier, 'LIEU')
      const f = await attendreControle(cree.id)
      if (f.statutControle === 'REFUSE') throw new Error(`Visuel refusé : ${f.raisonRefus ?? 'format non reconnu'}.`)
      setL((x) => ({ ...x, visuelId: f.id, image: f.url }))
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }
  const maj = (p: Partial<Lieu>) => setL((x) => ({ ...x, ...p }))
  const ficheComplete = !!(l.nom.trim() && l.nomCourt.trim() && l.adresse.trim() && l.description.fr.trim() && l.categorie.fr.trim())
  const animations = l.id ? etat.animations.filter((a) => a.lieuId === l.id) : []
  const fait: Record<EtapeMonument, boolean> = {
    lieu: ficheComplete,
    position: !!l.id || l.latitude !== lieu.latitude || l.longitude !== lieu.longitude,
    animation: animations.length > 0,
  }
  const indice = ETAPES_MONUMENT.findIndex((e) => e.id === etape)

  /** Enregistre le monument sans fermer le parcours ; renvoie false si la fiche est incomplète. */
  async function enregistrer() {
    setTente(true)
    setErreur(null)
    setMessage(null)
    if (!ficheComplete) {
      setEtape('lieu')
      setErreur('Complétez d’abord l’étape 1 : nom, nom court, adresse, catégorie et présentation en français.')
      return false
    }
    setEnvoi('enregistrement')
    try {
      const enregistre = await onEnregistrer(l)
      setL((x) => ({ ...x, id: enregistre.id }))
      setMessage(`« ${l.nomCourt || l.nom} » enregistré.`)
      return true
    } catch (e) {
      setErreur(messageErreur(e))
      return false
    } finally {
      setEnvoi(null)
    }
  }

  function nouvelleAnimation() {
    setAnimation({
      id: '',
      proprietaireId: proprietaireDe(session),
      titre: '',
      type: 'LIEU',
      lieuId: l.id,
      declencheur: 'MONUMENT',
      dureeS: 300,
      debut: maintenantLocal(),
      statut: 'BROUILLON',
      transcription: { fr: '', en: '', de: '' },
      lancements: 0,
      modifieLe: maintenantLocal(),
    })
  }

  return (
    <Tiroir
      ouvert
      large
      titre={lieu.id ? `Monument « ${lieu.nomCourt || lieu.nom} »` : 'Nouveau monument'}
      sousTitre="Créez le monument, placez-le sur la carte, puis placez son animation 3D à son point GPS."
      onFermer={onFermer}
      pied={
        <>
          {onSupprimer && (
            <button type="button" className="btn btn-texte-danger" onClick={onSupprimer}>
              <Icone nom="poubelle" taille={15} /> Supprimer
            </button>
          )}
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Fermer
          </button>
          {indice > 0 && (
            <button type="button" className="btn btn-secondaire" onClick={() => setEtape(ETAPES_MONUMENT[indice - 1].id)}>
              <Icone nom="gauche" taille={15} /> Précédent
            </button>
          )}
          <button type="button" className="btn btn-secondaire" disabled={!!envoi} onClick={() => void enregistrer()}>
            {envoi === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {indice < ETAPES_MONUMENT.length - 1 && (
            <button
              type="button"
              className="btn btn-primaire"
              disabled={!!envoi}
              onClick={async () => {
                const suivante = ETAPES_MONUMENT[indice + 1].id
                // L'animation est rattachée au monument : il doit être enregistré avant l'étape 3.
                if (suivante === 'animation' && !l.id && !(await enregistrer())) return
                if (etape === 'lieu' && !ficheComplete) {
                  setTente(true)
                  setErreur('Complétez les champs signalés avant de continuer.')
                  return
                }
                setErreur(null)
                setEtape(suivante)
              }}
            >
              Suivant <Icone nom="droite" taille={15} />
            </button>
          )}
        </>
      }
    >
      <ol className="etapes-monument">
        {ETAPES_MONUMENT.map((e, i) => (
          <li key={e.id} className={`${etape === e.id ? 'courante' : ''} ${fait[e.id] ? 'faite' : ''}`}>
            <button
              type="button"
              onClick={async () => {
                if (e.id === 'animation' && !l.id && !(await enregistrer())) return
                setEtape(e.id)
              }}
              aria-current={etape === e.id ? 'step' : undefined}
            >
              <span className="numero">{fait[e.id] && etape !== e.id ? <Icone nom="check" taille={14} /> : i + 1}</span>
              <span>
                <strong>{e.titre}</strong>
                <small>{e.aide}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="formulaire-bo">
        {(erreur || message) && (
          <p className={erreur ? 'erreur-acces' : 'note-ok'} role={erreur ? 'alert' : 'status'}>
            <Icone nom={erreur ? 'alerte' : 'check'} taille={15} />
            {erreur ?? message}
          </p>
        )}

        {etape === 'lieu' && (
          <>
            <div className="grille-champs">
              <label className={`champ ${tente && !l.nom.trim() ? 'erreur' : ''}`}>
                <span className="etiquette">Nom du monument</span>
                <input value={l.nom} onChange={(e) => maj({ nom: e.target.value })} maxLength={150} placeholder="Ex. Château des Ducs de Wurtemberg" />
              </label>
              <label className={`champ ${tente && !l.nomCourt.trim() ? 'erreur' : ''}`}>
                <span className="etiquette">
                  Nom court <small>Affiché sur la carte</small>
                </span>
                <input value={l.nomCourt} onChange={(e) => maj({ nomCourt: e.target.value })} maxLength={20} placeholder="Ex. Château" />
              </label>
              <label className={`champ pleine ${tente && !l.adresse.trim() ? 'erreur' : ''}`}>
                <span className="etiquette">Adresse</span>
                <input value={l.adresse} onChange={(e) => maj({ adresse: e.target.value })} placeholder="Ex. Rue du Château, 25200 Montbéliard" />
              </label>
            </div>
            <fieldset className={`transcriptions ${tente && (!l.description.fr.trim() || !l.categorie.fr.trim()) ? 'erreur' : ''}`}>
              <legend>Fiche du monument (FR obligatoire)</legend>
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
                <strong>Visuel de la fiche</strong>
                <p>Photo affichée sur la carte et la fiche du monument (PNG, JPEG ou WebP).</p>
              </div>
              <div className="vignettes">
                {l.image && <img src={l.image} alt="" />}
                <label className="ajout-photo" aria-label="Choisir le visuel">
                  {envoi === 'visuel' ? <span className="spinner" /> : <Icone nom={l.image ? 'crayon' : 'plus'} taille={18} />}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!!envoi}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void importerVisuel(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
          </>
        )}

        {etape === 'position' && (
          <>
            <p className="aide">Placez le repère au centre du monument (vue satellite), ou cherchez son adresse. Le rayon délimite la zone où le visiteur peut lancer l’animation.</p>
            <ChoixPosition latitude={l.latitude} longitude={l.longitude} rayonM={l.rayonM} rechercheInitiale={l.adresse} onChange={(latitude, longitude) => maj({ latitude, longitude })} />
            <div className="bloc-position">
              <div>
                <label className="champ">
                  <span className="etiquette">
                    Rayon de proximité <small>{l.rayonM} m</small>
                  </span>
                  <input type="range" min={20} max={200} step={5} value={l.rayonM} onChange={(e) => maj({ rayonM: Number(e.target.value) })} />
                  <span className="aide">Message « Vous êtes arrivé » et lancement de l’animation dans ce rayon (50 m par défaut).</span>
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
          </>
        )}

        {etape === 'animation' && (
          <div className="animations-monument">
            <p className="aide">
              L’animation 3D apparaît à son point GPS quand le visiteur arrive dans le rayon du monument. Choisissez son modèle, puis placez-la où vous voulez autour du bâtiment
              (position, hauteur, orientation, taille).
            </p>
            {animations.length === 0 ? (
              <div className="vide-animation">
                <Icone nom="cube" taille={28} />
                <strong>Ce monument n’a pas encore d’animation</strong>
                <button type="button" className="btn btn-primaire" onClick={nouvelleAnimation}>
                  <Icone nom="plus" taille={15} /> Créer l’animation de ce monument
                </button>
              </div>
            ) : (
              <>
                <ul className="liste-animations-monument">
                  {animations.map((a) => {
                    const modele = etat.fichiers.find((x) => x.id === a.modeleId)
                    return (
                      <li key={a.id}>
                        <div>
                          <strong>{a.titre}</strong>
                          <small>
                            {modele?.nomOriginal ?? 'Sans modèle'} ·{' '}
                            {a.placement ? `placée autour du bâtiment, ${a.placement.tailleM.toString().replace('.', ',')} m, à ${a.placement.hauteurM.toString().replace('.', ',')} m du sol` : 'position par défaut (au-dessus du point du monument)'}
                          </small>
                        </div>
                        <BadgeStatut statut={a.statut} libelle={a.statut === 'PUBLIEE' ? 'Active' : a.statut === 'BROUILLON' ? 'Brouillon' : undefined} />
                        <button type="button" className="btn btn-secondaire petit" onClick={() => setAnimation(a)}>
                          <Icone nom="crayon" taille={13} /> Modifier et placer
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button type="button" className="btn btn-texte" onClick={nouvelleAnimation}>
                  <Icone nom="plus" taille={14} /> Ajouter une autre animation
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {animation && (
        <EditeurAnimation
          animation={animation}
          lieuImpose
          onFermer={() => setAnimation(null)}
          onEnregistrer={async (a, publier) => {
            await enregistrerAnimation(a, publier)
            setAnimation(null)
            setMessage(`Animation « ${a.titre} » enregistrée${publier ? ' et activée' : ''}.`)
          }}
        />
      )}
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
