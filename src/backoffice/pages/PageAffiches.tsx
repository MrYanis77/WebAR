import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icone } from '../../commun/Icone'
import { nomProprietaire, publiable, reglePublication, supprimerAffiche, useEtat } from '../../commun/store'
import { AfficheAvecQr, QR_DEFAUT } from '../../commun/AfficheQr'
import type { Affiche } from '../../commun/types'
import { peutCreer, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, EnTetePage, formaterDate, Onglets, Recherche, useToast, Vide } from '../ui'

/** Miniature : le fichier importé (servi par l'API) et le QR code à sa place. */
function Miniature({ affiche }: { affiche: Affiche }) {
  const image = affiche.image?.url
  const ratio = affiche.image ? affiche.image.largeur / affiche.image.hauteur : 297 / 420
  return <AfficheAvecQr image={image} ratio={ratio} code={affiche.codeQr} qr={affiche.qr ?? QR_DEFAUT} nom={affiche.nom} className="miniature" />
}

export default function PageAffiches() {
  const etat = useEtat()
  const session = useSession()
  const navigate = useNavigate()
  const agent = session.role === 'AGENT'
  const [filtre, setFiltre] = useState<'toutes' | 'publiees' | 'bloquees' | 'archivees'>('toutes')
  const [texte, setTexte] = useState('')
  const [aSupprimer, setASupprimer] = useState<Affiche | null>(null)
  const toast = useToast()

  const visibles = etat.affiches.filter((a) => agent || a.proprietaireId === session.partenaireId)
  const categorie = (a: (typeof visibles)[number]) =>
    a.statut === 'SUSPENDUE' || a.statut === 'RETIREE' || new Date(a.fin) < new Date() ? 'archivees' : a.statut === 'PUBLIEE' && publiable(reglePublication(etat, a)) ? 'publiees' : 'bloquees'
  const liste = visibles.filter((a) => filtre === 'toutes' || categorie(a) === filtre).filter((a) => a.nom.toLowerCase().includes(texte.toLowerCase()))

  return (
    <>
      <EnTetePage
        titre="Affiches"
        description="Importez vos affiches : un QR code unique est généré pour chacune et placé sur le fichier à imprimer."
        actions={
          <button type="button" className="btn btn-primaire" onClick={() => navigate('/backoffice/affiches/nouvelle')} disabled={!peutCreer(etat, session)}>
            <Icone nom="plus" taille={16} />
            Nouvelle affiche
          </button>
        }
      />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { id: 'toutes', libelle: 'Toutes', compte: visibles.length },
              { id: 'publiees', libelle: 'Diffusées', compte: visibles.filter((a) => categorie(a) === 'publiees').length },
              { id: 'bloquees', libelle: 'À compléter', compte: visibles.filter((a) => categorie(a) === 'bloquees').length },
              { id: 'archivees', libelle: 'Archivées', compte: visibles.filter((a) => categorie(a) === 'archivees').length },
            ]}
          />
          <Recherche valeur={texte} onChange={setTexte} />
        </div>
        {liste.length === 0 ? (
          <Vide icone="affiche" titre="Aucune affiche" texte="Importez le fichier de votre première affiche." />
        ) : (
          <div className="grille-affiches">
            {liste.map((a) => {
              const c = reglePublication(etat, a)
              const n = Object.values(c).filter(Boolean).length
              return (
                <article key={a.id} className="carte-affiche">
                  <button type="button" className="miniature-affiche" onClick={() => navigate(`/backoffice/affiches/${a.id}`)} aria-label={`Ouvrir ${a.nom}`}>
                    <Miniature affiche={a} />
                  </button>
                  <div className="infos-affiche">
                    <div className="ligne-badges">
                      <BadgeStatut statut={a.statut} />
                      <span className={`pill ${publiable(c) ? 'pill-green' : 'pill-amber'}`} title="Conditions de publication">
                        {n}/4 conditions
                      </span>
                    </div>
                    <h3>{a.nom}</h3>
                    <p>{agent ? nomProprietaire(etat, a.proprietaireId) : a.accroche}</p>
                    <dl>
                      <div>
                        <dt>Zone</dt>
                        <dd>{etat.zones.find((z) => z.id === a.zoneId)?.nom ?? (a.zoneProposeeId ? 'Proposée, en attente' : 'Non attribuée')}</dd>
                      </div>
                      <div>
                        <dt>Période</dt>
                        <dd>
                          {formaterDate(a.debut, { day: '2-digit', month: 'short' })} → {formaterDate(a.fin, { day: '2-digit', month: 'short', year: 'numeric' })}
                        </dd>
                      </div>
                      <div>
                        <dt>Scans</dt>
                        <dd>{a.scans.toLocaleString('fr-FR')}</dd>
                      </div>
                    </dl>
                    <div className="actions-affiche">
                      <Link to={`/backoffice/affiches/${a.id}/voir`} className="lien-panneau" title="Affiche en plein écran, QR code à scanner avec un téléphone">
                        <Icone nom="qr" taille={14} /> Voir l’affiche
                      </Link>
                      <span className="actions-carte">
                        <button type="button" className="supprimer" onClick={() => setASupprimer(a)} aria-label={`Supprimer ${a.nom}`} title="Supprimer">
                          <Icone nom="poubelle" taille={14} />
                        </button>
                        <Link to={`/backoffice/affiches/${a.id}`} className="lien-panneau">
                          <Icone nom="crayon" taille={13} /> Modifier
                        </Link>
                      </span>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
      <DialogueSuppression
        cible={aSupprimer?.nom ?? null}
        description="Son QR code ne mènera plus à l’animation (le visiteur verra « QR code inconnu »). Pensez à retirer l’affiche imprimée. La suppression reste inscrite au journal."
        onFermer={() => setASupprimer(null)}
        onConfirmer={async () => {
          const r = await supprimerAffiche(aSupprimer!.id)
          if (r.ok) {
            toast.afficher(`Affiche « ${aSupprimer!.nom} » supprimée`)
          }
          return r
        }}
      />
      {toast.element}
    </>
  )
}
