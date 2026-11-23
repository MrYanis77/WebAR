// Sous-menu Monuments › Animations 3D : toutes les animations placées sur les monuments, avec leurs dates
// de diffusion. Une animation de monument se voit en réalité augmentée, sur place, dans le rayon du monument.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { animationActive, basculerAnimation, supprimerAnimation, useEtat } from '../../commun/store'
import type { Animation } from '../../commun/types'
import { BadgeStatut, DialogueSuppression, EnTetePage, formaterDate, Interrupteur, Onglets, useToast, Vide } from '../ui'

type Filtre = 'toutes' | 'diffusees' | 'programmees' | 'brouillons' | 'terminees'

function etatAnimation(a: Animation): { cle: Filtre; libelle: string; statut: string } {
  if (a.statut === 'SUSPENDUE' || a.statut === 'RETIREE') return { cle: 'terminees', libelle: a.statut === 'SUSPENDUE' ? 'Suspendue' : 'Retirée', statut: a.statut }
  if (a.statut === 'BROUILLON') return { cle: 'brouillons', libelle: 'Brouillon (non visible)', statut: 'BROUILLON' }
  if (a.fin && new Date(a.fin) < new Date()) return { cle: 'terminees', libelle: 'Terminée', statut: 'RETIREE' }
  if (animationActive(a)) return { cle: 'diffusees', libelle: 'Visible en ce moment', statut: 'PUBLIEE' }
  return { cle: 'programmees', libelle: 'Programmée', statut: 'EN_COURS' }
}

export default function PageAnimationsMonuments() {
  const etat = useEtat()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const lieuFiltre = params.get('lieu') ?? ''
  const [filtre, setFiltre] = useState<Filtre>('toutes')
  const [aSupprimer, setASupprimer] = useState<Animation | null>(null)
  const [lieuNouvelle, setLieuNouvelle] = useState(lieuFiltre || etat.lieux[0]?.id || '')

  const toutes = etat.animations.filter((a) => a.type === 'LIEU' && (!lieuFiltre || a.lieuId === lieuFiltre))
  const liste = toutes.filter((a) => filtre === 'toutes' || etatAnimation(a).cle === filtre).sort((a, b) => b.debut.localeCompare(a.debut))
  const compte = (f: Filtre) => toutes.filter((a) => etatAnimation(a).cle === f).length
  const ouvrir = (lieuId: string, animationId: string) => navigate(`/backoffice/lieux/${lieuId}`, { state: { etape: 3, animationId } })

  return (
    <>
      <EnTetePage
        titre="Animations 3D des monuments"
        description="Chaque animation est rattachée à un monument : le visiteur la voit en réalité augmentée quand il est sur place, entre la date de sortie et la date de fin."
        actions={
          etat.lieux.length > 0 && (
            <div className="ajout-animation">
              <label className="select-compact">
                <Icone nom="pin" taille={15} />
                <select value={lieuNouvelle} onChange={(e) => setLieuNouvelle(e.target.value)} aria-label="Monument de la nouvelle animation">
                  {etat.lieux.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primaire" onClick={() => lieuNouvelle && ouvrir(lieuNouvelle, '')}>
                <Icone nom="plus" taille={16} /> Ajouter une animation
              </button>
            </div>
          )
        }
      />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { id: 'toutes', libelle: 'Toutes', compte: toutes.length },
              { id: 'diffusees', libelle: 'Visibles', compte: compte('diffusees') },
              { id: 'programmees', libelle: 'Programmées', compte: compte('programmees') },
              { id: 'brouillons', libelle: 'Brouillons', compte: compte('brouillons') },
              { id: 'terminees', libelle: 'Terminées', compte: compte('terminees') },
            ]}
          />
          <label className="select-compact">
            <Icone nom="filtre" taille={15} />
            <select value={lieuFiltre} onChange={(e) => setParams(e.target.value ? { lieu: e.target.value } : {})} aria-label="Filtrer par monument">
              <option value="">Tous les monuments</option>
              {etat.lieux.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </label>
        </div>

        {liste.length === 0 ? (
          <Vide icone="cube" titre="Aucune animation" texte="Choisissez un monument puis « Ajouter une animation » pour placer un modèle 3D autour du bâtiment." />
        ) : (
          <div className="table-defilante">
            <table className="table table-animations">
              <thead>
                <tr>
                  <th>Animation</th>
                  <th>Monument</th>
                  <th>Diffusion</th>
                  <th>État</th>
                  <th>Activée</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {liste.map((a) => {
                  const lieu = etat.lieux.find((l) => l.id === a.lieuId)
                  const e = etatAnimation(a)
                  const verrou = a.statut === 'SUSPENDUE' || a.statut === 'RETIREE'
                  const modele = etat.fichiers.find((f) => f.id === a.modeleId)
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.titre}</strong>
                        <small className="cellule-detail">{modele ? `Modèle : ${modele.nomOriginal}` : 'Aucun modèle'}</small>
                      </td>
                      <td>{lieu?.nom ?? '—'}</td>
                      <td>
                        Du {formaterDate(a.debut, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        <small className="cellule-detail">{a.fin ? `au ${formaterDate(a.fin, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'sans date de fin'}</small>
                      </td>
                      <td>
                        <BadgeStatut statut={e.statut} libelle={e.libelle} />
                      </td>
                      <td>
                        <Interrupteur
                          actif={a.statut === 'PUBLIEE'}
                          desactive={verrou}
                          libelle={a.statut === 'PUBLIEE' ? `Désactiver ${a.titre}` : `Activer ${a.titre}`}
                          onChange={() => {
                            basculerAnimation(a.id)
                              .then(() => toast.afficher(a.statut === 'PUBLIEE' ? `« ${a.titre} » désactivée` : `« ${a.titre} » activée`))
                              .catch((err) => toast.afficher(messageErreur(err)))
                          }}
                        />
                      </td>
                      <td>
                        <div className="actions-ligne">
                          <button type="button" className="btn btn-secondaire petit" onClick={() => lieu && ouvrir(lieu.id, a.id)} disabled={!lieu}>
                            <Icone nom="crayon" taille={13} /> Modifier
                          </button>
                          <button type="button" className="bo-icone" onClick={() => setASupprimer(a)} aria-label={`Supprimer ${a.titre}`} title="Supprimer">
                            <Icone nom="poubelle" taille={14} />
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
      </div>
      <DialogueSuppression
        cible={aSupprimer?.titre ?? null}
        description="L’animation ne sera plus visible au monument. Une animation encore utilisée par une affiche ne peut pas être supprimée. La suppression reste inscrite au journal."
        onFermer={() => setASupprimer(null)}
        onConfirmer={async () => {
          const r = await supprimerAnimation(aSupprimer!.id)
          if (r.ok) toast.afficher(`Animation « ${aSupprimer!.titre} » supprimée`)
          return r
        }}
      />
      {toast.element}
    </>
  )
}
