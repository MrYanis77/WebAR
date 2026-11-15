// Affiche en plein écran avec son QR code, pour la tester sans l'imprimer : on scanne l'écran du PC
// avec l'appareil photo du téléphone, qui ouvre l'application visiteur (caméra + animation).
import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { AfficheAvecQr, QR_DEFAUT, urlQr } from '../../commun/AfficheQr'
import { Icone } from '../../commun/Icone'
import { publiable, reglePublication, useEtat } from '../../commun/store'

export default function PageVoirAffiche() {
  const { id } = useParams()
  const etat = useEtat()
  const cadre = useRef<HTMLDivElement>(null)
  const a = etat.affiches.find((x) => x.id === id)

  useEffect(() => {
    document.title = a ? `${a.nom} — affiche` : 'Affiche'
  }, [a])

  if (etat.chargement) return <div className="chargement-plein">Chargement…</div>
  if (!a)
    return (
      <div className="voir-affiche vide">
        <p>Affiche introuvable.</p>
        <Link to="/backoffice/affiches" className="btn btn-primaire">
          Retour aux affiches
        </Link>
      </div>
    )

  const ratio = a.image ? a.image.largeur / a.image.hauteur : 297 / 420
  // Le QR code ne mène à l'animation que si l'affiche est publiée, dans sa période et ses 4 conditions réunies.
  const diffusee = a.statut === 'PUBLIEE' && publiable(reglePublication(etat, a)) && new Date(a.debut) <= new Date() && new Date(a.fin) >= new Date()
  const url = urlQr(a.codeQr)
  const local = /\/\/(localhost|127\.)/.test(url)

  return (
    <div className="voir-affiche">
      <header>
        <Link to="/backoffice" className="btn btn-fantome petit">
          <Icone nom="gauche" taille={14} /> Retour
        </Link>
        <strong>{a.nom}</strong>
        <button type="button" className="btn btn-secondaire petit" onClick={() => void cadre.current?.requestFullscreen?.()}>
          Plein écran
        </button>
      </header>
      {!diffusee && (
        <p className="alerte-voir">
          <Icone nom="alerte" taille={15} /> Cette affiche n’est pas encore diffusée (publication, dates ou zone d’affichage) : le QR code affichera « animation indisponible ».{' '}
          <Link to={`/backoffice/affiches/${a.id}`}>Compléter l’affiche</Link>
        </p>
      )}
      {local && (
        <p className="alerte-voir">
          <Icone nom="info" taille={15} /> Le QR code pointe vers « localhost », injoignable depuis un téléphone : lancez « npm run dev:mobile » pour tester avec votre téléphone.
        </p>
      )}
      <div className="scene-affiche" ref={cadre}>
        <div className="affiche-ecran" style={{ aspectRatio: String(ratio) }}>
          <AfficheAvecQr image={a.image?.url} ratio={ratio} code={a.codeQr} qr={a.qr ?? QR_DEFAUT} nom={a.nom} />
        </div>
      </div>
      <p className="url-voir">
        Scannez le QR code avec l’appareil photo de votre téléphone · <code>{url}</code>
      </p>
    </div>
  )
}
