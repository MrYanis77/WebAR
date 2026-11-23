import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Icone } from '../../commun/Icone'
import { animationActive, enregistrerLieu, supprimerLieu, useEtat } from '../../commun/store'
import type { Lieu, Texte3 } from '../../commun/types'
import { BadgeStatut, DialogueSuppression, EnTetePage, executer, Interrupteur, Recherche, useToast, Vide } from '../ui'

/**
 * Sous-menu Monuments › Tous les monuments. Un monument sert à placer une animation 3D en réalité
 * augmentée (à voir sur place, dans son rayon) ; ses animations se gèrent dans Monuments › Animations 3D.
 * Les zones d'affichage, elles, servent aux affiches (sous-menu Affiches).
 */
export default function PageLieux() {
  const etat = useEtat()
  const toast = useToast()
  const navigate = useNavigate()
  const [texte, setTexte] = useState('')
  const [aSupprimer, setASupprimer] = useState<Lieu | null>(null)
  const lieux = etat.lieux.filter((l) => l.nom.toLowerCase().includes(texte.toLowerCase()))

  function resumeAnimations(lieuId: string) {
    const anims = etat.animations.filter((a) => a.type === 'LIEU' && a.lieuId === lieuId)
    if (!anims.length) return 'Aucune animation 3D'
    const visibles = anims.filter((a) => animationActive(a)).length
    return `${anims.length} animation${anims.length > 1 ? 's' : ''} 3D · ${visibles} visible${visibles > 1 ? 's' : ''} en ce moment`
  }

  return (
    <>
      <EnTetePage
        titre="Tous les monuments"
        description="Les lieux de la ville affichés sur la carte des visiteurs. Chaque monument a une fiche, une position GPS et un rayon dans lequel son animation 3D se lance."
        actions={
          <button type="button" className="btn btn-primaire" onClick={() => navigate('/backoffice/lieux/nouveau')}>
            <Icone nom="plus" taille={16} /> Créer un monument
          </button>
        }
      />
      <div className="bo-defilement">
        <p className="encart-aide">
          <Icone nom="info" taille={16} />
          <span>
            Un <strong>monument</strong> sert à placer une <strong>animation 3D</strong> : le visiteur la voit en réalité augmentée une fois sur place. Les animations se gèrent dans{' '}
            <strong>Monuments › Animations 3D</strong>.
          </span>
        </p>
        <div className="barre-outils">
          <span className="compte-liste">
            {etat.lieux.length} monument{etat.lieux.length > 1 ? 's' : ''}
          </span>
          <Recherche valeur={texte} onChange={setTexte} />
        </div>

        {lieux.length === 0 ? (
          <Vide icone="pin" titre="Aucun monument" texte="Créez un monument pour y placer une animation 3D." />
        ) : (
          <div className="grille-lieux">
            {lieux.map((l) => (
              <article key={l.id} className="carte-lieu">
                <div className="image-lieu">{l.image ? <img src={l.image} alt="" /> : <Icone nom="pin" taille={34} />}</div>
                <div className="corps-lieu">
                  <div className="titre-animation">
                    <div>
                      <h3>{l.nom}</h3>
                      <p>
                        {l.categorie.fr} · rayon {l.rayonM} m · {['fr', 'en', 'de'].filter((k) => l.description[k as keyof Texte3]).length}/3 langues
                      </p>
                    </div>
                    <Interrupteur
                      actif={l.actif}
                      libelle={l.actif ? 'Masquer le monument de la carte' : 'Afficher le monument sur la carte'}
                      onChange={() => executer(toast, () => enregistrerLieu({ ...l, actif: !l.actif }), l.actif ? `${l.nomCourt} masqué de la carte` : `${l.nomCourt} visible sur la carte des visiteurs`)}
                    />
                  </div>
                  <button type="button" className="resume-animations" onClick={() => navigate(`/backoffice/lieux/animations?lieu=${l.id}`)}>
                    <Icone nom="cube" taille={16} />
                    <span>{resumeAnimations(l.id)}</span>
                    <Icone nom="droite" taille={15} />
                  </button>
                  <div className="pied-carte">
                    <BadgeStatut statut={l.actif ? 'PUBLIEE' : 'BROUILLON'} libelle={l.actif ? 'Sur la carte' : 'Masqué'} />
                    <span className="actions-carte">
                      <button type="button" className="supprimer" onClick={() => setASupprimer(l)} aria-label={`Supprimer ${l.nom}`} title="Supprimer le monument">
                        <Icone nom="poubelle" taille={14} />
                      </button>
                      <button type="button" onClick={() => navigate(`/backoffice/lieux/${l.id}`)}>
                        <Icone nom="crayon" taille={13} /> Modifier
                      </button>
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <DialogueSuppression
        cible={aSupprimer?.nom ?? null}
        description="Le monument disparaîtra de la carte des visiteurs et des zones de proximité. Ses animations doivent d’abord être supprimées. La suppression reste inscrite au journal."
        onFermer={() => setASupprimer(null)}
        onConfirmer={async () => {
          const r = await supprimerLieu(aSupprimer!.id)
          if (r.ok) toast.afficher(`Monument « ${aSupprimer!.nomCourt || aSupprimer!.nom} » supprimé`)
          return r
        }}
      />
      {toast.element}
    </>
  )
}
