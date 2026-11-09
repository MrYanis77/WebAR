import { useState } from 'react'
import { Icone } from '../../commun/Icone'
import { enregistrerModele, genererCodeQr, uid, useEtat } from '../../commun/store'
import { imageLieu } from '../../commun/images'
import { ApercuAffiche } from '../composants/ApercuAffiche'
import { EnTetePage, Interrupteur, Tiroir, useToast } from '../ui'

const CODE_DEMO = genererCodeQr()

/** Modèles de mise en page fournis par la Ville (BF-37). */
export default function PageModeles() {
  const etat = useEtat()
  const toast = useToast()
  const [nouveau, setNouveau] = useState(false)
  const [f, setF] = useState({ nom: '', description: '', format: 'A3', variante: 0 as 0 | 1 | 2, gabarit: '' })

  return (
    <>
      <EnTetePage
        titre="Modèles d’affiche"
        description="Formats, mises en page et charte graphique de la Ville, proposés aux agents et aux partenaires."
        actions={
          <button type="button" className="btn btn-primaire" onClick={() => setNouveau(true)}>
            <Icone nom="import" taille={16} /> Importer un gabarit
          </button>
        }
      />
      <div className="bo-defilement">
        <div className="grille-modeles">
          {etat.modeles.map((m) => (
            <article key={m.id} className={`carte-modele ${m.actif ? '' : 'inactif'}`}>
              <div className="apercu-modele">
                <ApercuAffiche
                  echelle={0.6}
                  d={{
                    variante: m.variante,
                    nom: m.nom,
                    accroche: 'Modèle de la Ville',
                    texte: m.description,
                    code: CODE_DEMO,
                    visuel: imageLieu(m.variante === 1 ? 'stade' : 'chateau'),
                    structure: 'Partenaire',
                    lieu: 'Château',
                    dates: '1 déc. → 5 janv.',
                  }}
                />
              </div>
              <div className="corps-lieu">
                <div className="titre-animation">
                  <div>
                    <h3>{m.nom}</h3>
                    <p>
                      {m.description} · {m.format}
                    </p>
                  </div>
                  <Interrupteur
                    actif={m.actif}
                    libelle={m.actif ? 'Retirer le modèle' : 'Proposer le modèle'}
                    onChange={() => {
                      enregistrerModele({ ...m, actif: !m.actif })
                      toast.afficher(m.actif ? `Modèle « ${m.nom} » retiré` : `Modèle « ${m.nom} » proposé`)
                    }}
                  />
                </div>
                <small className="usage-modele">{etat.affiches.filter((a) => a.modeleId === m.id).length} affiche(s) utilisent ce modèle</small>
              </div>
            </article>
          ))}
        </div>
      </div>
      <Tiroir
        ouvert={nouveau}
        titre="Importer un gabarit"
        sousTitre="Mise en page SVG respectant la charte graphique de la Ville."
        onFermer={() => setNouveau(false)}
        pied={
          <>
            <button type="button" className="btn btn-fantome" onClick={() => setNouveau(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primaire"
              disabled={!f.nom.trim() || !f.gabarit}
              onClick={() => {
                enregistrerModele({ id: uid('m'), nom: f.nom.trim(), description: f.description.trim() || 'Gabarit importé', format: f.format, variante: f.variante, actif: true })
                setNouveau(false)
                toast.afficher('Gabarit importé et proposé aux éditeurs')
              }}
            >
              Enregistrer
            </button>
          </>
        }
      >
        <div className="formulaire-bo">
          <label className="champ">
            <span className="etiquette">Nom</span>
            <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
          </label>
          <label className="champ">
            <span className="etiquette">Description</span>
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <div className="grille-champs">
            <label className="champ">
              <span className="etiquette">Format</span>
              <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>
                {['A3', 'A2', 'A1'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="champ">
              <span className="etiquette">Structure</span>
              <select value={f.variante} onChange={(e) => setF({ ...f, variante: Number(e.target.value) as 0 | 1 | 2 })}>
                <option value={0}>Photo & titre</option>
                <option value={1}>Visuel plein format</option>
                <option value={2}>Programme détaillé</option>
              </select>
            </label>
          </div>
          <label className="depot-petit">
            <Icone nom="gabarit" taille={20} />
            <span>
              <strong>{f.gabarit || 'Fichier SVG du gabarit'}</strong>
              <small>Zones nommées : titre, accroche, texte, visuel, logo, qr</small>
            </span>
            <input type="file" accept=".svg,image/svg+xml" onChange={(e) => setF({ ...f, gabarit: e.target.files?.[0]?.name ?? '' })} />
          </label>
        </div>
      </Tiroir>
      {toast.element}
    </>
  )
}
