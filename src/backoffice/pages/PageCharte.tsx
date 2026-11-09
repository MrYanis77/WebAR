import { useState } from 'react'
import { VERSION_CHARTE } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { accepterCharte, useEtat } from '../../commun/store'
import { useSession } from '../session'
import { EnTetePage, formaterDate, Panneau, useToast } from '../ui'

const ARTICLES = [
  ['Objet', 'La présente charte encadre la publication, par les partenaires, d’affiches et d’animations en réalité augmentée dans l’application de la Ville de Montbéliard.'],
  ['Contenus interdits', 'Sont interdits les contenus illicites, trompeurs, discriminatoires, violents, à caractère sexuel, ainsi que les contenus partisans ou de propagande politique ou religieuse.'],
  ['Droits des tiers', 'Le partenaire déclare détenir tous les droits sur les modèles 3D, sons, logos et visuels qu’il importe (droit d’auteur, droit à l’image, marques).'],
  ['Liens et QR codes', 'Le QR code est généré par l’application et renvoie uniquement vers celle-ci. Aucun lien externe ne peut être ajouté aux contenus.'],
  ['Publication et responsabilité', 'Après contrôle automatique des fichiers, les contenus sont publiés sans validation préalable par un agent. Le partenaire reste seul responsable de ses contenus.'],
  ['Signalement et modération', 'Tout visiteur peut signaler un contenu de façon anonyme. La mairie peut maintenir, suspendre ou retirer un contenu à tout moment, avec un motif. Le partenaire est notifié et peut demander un réexamen.'],
  ['Affichage physique', 'La zone d’affichage est attribuée par la mairie. La validation dans l’application ne vaut pas autorisation administrative d’affichage ou d’enseigne.'],
  ['Données personnelles', 'Les données du compte sont limitées à la structure et à la personne de contact. Les statistiques transmises sont anonymes.'],
]

/** Acceptation de la charte avant tout import ou création (BF-41) ; la version acceptée est enregistrée. */
export default function PageCharte() {
  const etat = useEtat()
  const session = useSession()
  const toast = useToast()
  const [lu, setLu] = useState(false)
  const partenaire = etat.partenaires.find((p) => p.id === session.partenaireId)
  const accepteeLe = session.role === 'AGENT' ? (etat.charteVilleAcceptee ? '2026-09-01T09:00:00' : undefined) : partenaire?.charteAccepteeLe

  return (
    <>
      <EnTetePage titre="Charte d’utilisation" description={`Version ${VERSION_CHARTE} — à accepter avant d’importer des fichiers ou de créer une affiche.`} />
      <div className="bo-defilement etroit">
        {accepteeLe && (
          <div className="bandeau-ok">
            <Icone nom="check" taille={16} />
            Charte version {VERSION_CHARTE} acceptée le {formaterDate(accepteeLe, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
          </div>
        )}
        <Panneau>
          <ol className="charte">
            {ARTICLES.map(([titre, texte], i) => (
              <li key={titre}>
                <h3>
                  Article {i + 1} — {titre}
                </h3>
                <p>{texte}</p>
              </li>
            ))}
          </ol>
          {!accepteeLe && (
            <div className="acceptation">
              <label className="case">
                <input type="checkbox" checked={lu} onChange={(e) => setLu(e.target.checked)} />
                J’ai lu la charte et je déclare détenir les droits sur les contenus que j’importerai.
              </label>
              <button
                type="button"
                className="btn btn-primaire"
                disabled={!lu}
                onClick={() => {
                  accepterCharte()
                  toast.afficher('Charte acceptée — vous pouvez importer et créer')
                }}
              >
                Accepter la charte
              </button>
            </div>
          )}
        </Panneau>
      </div>
      {toast.element}
    </>
  )
}
