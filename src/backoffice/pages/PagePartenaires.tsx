import { useState } from 'react'
import { Icone } from '../../commun/Icone'
import { deciderCompte, useEtat } from '../../commun/store'
import type { Partenaire, StatutCompte } from '../../commun/types'
import { BadgeStatut, DialogueMotif, EnTetePage, formaterDate, Onglets, Panneau, Recherche, Tiroir, useToast } from '../ui'

type Filtre = 'tous' | StatutCompte

/** Vérification, refus, suspension et réactivation des comptes partenaires (BF-34, BF-44). */
export default function PagePartenaires() {
  const etat = useEtat()
  const toast = useToast()
  const [filtre, setFiltre] = useState<Filtre>('EN_ATTENTE')
  const [texte, setTexte] = useState('')
  const [detail, setDetail] = useState<Partenaire | null>(null)
  const [dialogue, setDialogue] = useState<{ p: Partenaire; statut: 'REFUSE' | 'SUSPENDU' } | null>(null)
  const liste = etat.partenaires
    .filter((p) => filtre === 'tous' || p.statut === filtre)
    .filter((p) => `${p.nomStructure} ${p.secteur} ${p.contactNom}`.toLowerCase().includes(texte.toLowerCase()))
  const n = (s: StatutCompte) => etat.partenaires.filter((p) => p.statut === s).length
  const courant = detail ? etat.partenaires.find((p) => p.id === detail.id) : undefined

  function accepter(p: Partenaire) {
    deciderCompte(p.id, 'VERIFIE')
    toast.afficher(`${p.nomStructure} : compte ${p.statut === 'SUSPENDU' ? 'réactivé' : 'vérifié'} — mail envoyé`)
  }

  const actions = (p: Partenaire) => (
    <div className="actions-ligne">
      {(p.statut === 'EN_ATTENTE' || p.statut === 'REFUSE') && (
        <button type="button" className="btn btn-primaire petit" onClick={() => accepter(p)}>
          Vérifier
        </button>
      )}
      {p.statut === 'EN_ATTENTE' && (
        <button type="button" className="btn btn-fantome petit" onClick={() => setDialogue({ p, statut: 'REFUSE' })}>
          Refuser
        </button>
      )}
      {p.statut === 'VERIFIE' && (
        <button type="button" className="btn btn-fantome petit" onClick={() => setDialogue({ p, statut: 'SUSPENDU' })}>
          Suspendre
        </button>
      )}
      {p.statut === 'SUSPENDU' && (
        <button type="button" className="btn btn-secondaire petit" onClick={() => accepter(p)}>
          Réactiver
        </button>
      )}
    </div>
  )

  return (
    <>
      <EnTetePage titre="Partenaires" description="Vérifiez les comptes et leurs droits d’accès. Un compte reste inactif tant qu’il n’est pas vérifié." />
      <div className="bo-defilement">
        <div className="barre-outils">
          <Onglets
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { id: 'EN_ATTENTE', libelle: 'À vérifier', compte: n('EN_ATTENTE') },
              { id: 'VERIFIE', libelle: 'Vérifiés', compte: n('VERIFIE') },
              { id: 'SUSPENDU', libelle: 'Suspendus', compte: n('SUSPENDU') },
              { id: 'REFUSE', libelle: 'Refusés', compte: n('REFUSE') },
              { id: 'tous', libelle: 'Tous', compte: etat.partenaires.length },
            ]}
          />
          <Recherche valeur={texte} onChange={setTexte} />
        </div>
        <Panneau>
          <div className="table-defilante">
            <table className="table">
              <thead>
                <tr>
                  <th>Structure</th>
                  <th>Secteur</th>
                  <th>Contact</th>
                  <th>Inscription</th>
                  <th>Charte</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="lien-cellule" onClick={() => setDetail(p)}>
                        <span className="avatar">{p.nomStructure.slice(0, 2).toUpperCase()}</span>
                        <span>
                          <strong>{p.nomStructure}</strong>
                          <small>{p.adresse}</small>
                        </span>
                      </button>
                    </td>
                    <td>{p.secteur}</td>
                    <td>
                      {p.contactNom}
                      <small>{p.email}</small>
                    </td>
                    <td>{formaterDate(p.creeLe, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>{p.charteAccepteeLe ? <span className="pill pill-green">v1.0</span> : <span className="pill pill-stone">—</span>}</td>
                    <td>
                      <BadgeStatut statut={p.statut} />
                    </td>
                    <td>{actions(p)}</td>
                  </tr>
                ))}
                {liste.length === 0 && (
                  <tr>
                    <td colSpan={7} className="cellule-vide">
                      Aucun compte dans cette catégorie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panneau>
      </div>
      <Tiroir ouvert={!!courant} titre={courant?.nomStructure ?? ''} sousTitre={courant ? `${courant.secteur} · inscrit le ${formaterDate(courant.creeLe)}` : ''} onFermer={() => setDetail(null)} pied={courant && actions(courant)}>
        {courant && (
          <div className="fiche-partenaire">
            <BadgeStatut statut={courant.statut} />
            {courant.motifStatut && (
              <p className="motif">
                <Icone nom="info" taille={14} /> Motif : {courant.motifStatut}
              </p>
            )}
            <dl>
              <dt>Adresse</dt>
              <dd>{courant.adresse}</dd>
              <dt>Contact</dt>
              <dd>{courant.contactNom}</dd>
              <dt>E-mail</dt>
              <dd>{courant.email}</dd>
              <dt>Téléphone</dt>
              <dd>{courant.contactTelephone ?? '—'}</dd>
              <dt>Charte</dt>
              <dd>{courant.charteAccepteeLe ? `Version 1.0 acceptée le ${formaterDate(courant.charteAccepteeLe)}` : 'Non acceptée'}</dd>
              <dt>Contenus</dt>
              <dd>
                {etat.affiches.filter((a) => a.proprietaireId === courant.id).length} affiche(s), {etat.animations.filter((a) => a.proprietaireId === courant.id).length} animation(s),{' '}
                {etat.fichiers.filter((f) => f.proprietaireId === courant.id).length} fichier(s)
              </dd>
            </dl>
            <p className="note-anonyme">
              <Icone nom="bouclier" taille={14} /> Données limitées au nécessaire (BNF-20). Les décisions sont notifiées par mail et tracées dans le journal.
            </p>
          </div>
        )}
      </Tiroir>
      <DialogueMotif
        ouvert={!!dialogue}
        titre={dialogue?.statut === 'REFUSE' ? `Refuser ${dialogue?.p.nomStructure}` : `Suspendre ${dialogue?.p.nomStructure}`}
        description={dialogue?.statut === 'SUSPENDU' ? 'Tous les contenus du partenaire cessent d’être diffusés en moins de 5 minutes. Il pourra demander un réexamen.' : 'Le partenaire reçoit le motif par mail.'}
        libelleConfirmer={dialogue?.statut === 'REFUSE' ? 'Refuser le compte' : 'Suspendre le compte'}
        danger
        suggestions={dialogue?.statut === 'REFUSE' ? ['Structure introuvable au registre du commerce.', 'Informations de contact incomplètes.'] : ['Manquements répétés à la charte.', 'Contenu illicite signalé et avéré.']}
        onFermer={() => setDialogue(null)}
        onConfirmer={(motif) => {
          if (dialogue) {
            deciderCompte(dialogue.p.id, dialogue.statut, motif)
            toast.afficher(`${dialogue.p.nomStructure} : décision notifiée par mail`)
          }
          setDialogue(null)
        }}
      />
      {toast.element}
    </>
  )
}
