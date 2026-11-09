import { useNavigate } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import type { Langue } from '../../commun/types'
import { BoutonLangue } from '../composants/Feuilles'

type Section = { titre: string; texte: string[] }

// Mentions légales et politique de confidentialité (BNF-09, BNF-15, BNF-20, BNF-24).
// Les éléments entre crochets sont à compléter par le service juridique de la Ville.
const contenu: Record<Langue, Section[]> = {
  fr: [
    { titre: 'Éditeur', texte: ['Ville de Montbéliard — Hôtel de Ville, place Saint-Martin, 25200 Montbéliard.', 'Directeur de la publication : [à compléter]. Hébergement : serveur situé dans l’Union européenne [prestataire à compléter].'] },
    { titre: 'Caméra et position', texte: ['La caméra sert uniquement à reconnaître l’affiche ou le monument, directement dans votre téléphone. Aucune image n’est envoyée ni conservée.', 'Votre position est utilisée dans le téléphone pour calculer les distances et le message de proximité. Aucune trajectoire n’est enregistrée ni transmise.', 'Ces accès sont demandés au moment de leur usage ; vous pouvez les refuser : la carte et les fiches restent disponibles.'] },
    { titre: 'Statistiques', texte: ['Nous comptons les scans de QR code et les lancements d’animation, sans cookie ni identifiant, arrondis à l’heure. Ils servent à mesurer la fréquentation des lieux.'] },
    { titre: 'Signalements', texte: ['Le signalement est anonyme : aucune identité n’est demandée ni transmise à la mairie ou au partenaire.', 'Votre adresse IP sert uniquement à limiter les abus (5 signalements par heure), reste en mémoire au plus une heure et n’est jamais enregistrée.', 'Les signalements et les décisions sont conservés 12 mois [durée à confirmer], puis supprimés. N’indiquez pas de données personnelles dans le commentaire.', 'Ce mécanisme répond au règlement européen sur les services numériques (DSA) [portée à confirmer par le service juridique].'] },
    { titre: 'Comptes partenaires', texte: ['Seules la structure (nom, secteur, adresse) et la personne de contact sont collectées, pour gérer le compte et notifier les décisions. Les comptes inactifs sont supprimés après [durée fixée par la Ville].', 'Vous disposez d’un droit d’accès, de rectification et de suppression : [contact du délégué à la protection des données].'] },
    { titre: 'Contenus et droits', texte: ['Les contenus des partenaires sont publiés sous leur responsabilité, dans le respect de la charte d’utilisation, et peuvent être suspendus ou retirés par la mairie.', 'Registre des contenus tiers : photographies Unsplash (licence Unsplash), polices Bricolage Grotesque et Inter (SIL Open Font License), fond de carte d’après les données OpenStreetMap (ODbL), effets sonores créés pour l’application.'] },
  ],
  en: [
    { titre: 'Publisher', texte: ['Town of Montbéliard — Town Hall, place Saint-Martin, 25200 Montbéliard. Hosting: server located in the European Union.'] },
    { titre: 'Camera and location', texte: ['The camera is only used on your phone to recognise the poster or monument. No image is sent or stored.', 'Your location is used on your phone to compute distances. No route is recorded or sent. You can refuse both: the map and place cards remain available.'] },
    { titre: 'Statistics', texte: ['We count QR scans and animation launches without cookies or identifiers, rounded to the hour.'] },
    { titre: 'Reports', texte: ['Reports are anonymous. Your IP address is only used to limit abuse (5 reports per hour), kept in memory for at most one hour and never stored. Reports are kept for 12 months. Do not include personal data in comments.'] },
    { titre: 'Partner accounts', texte: ['Only the organisation and contact person are collected. You have the right to access, correct and delete your data.'] },
    { titre: 'Content and rights', texte: ['Partner content is published under their responsibility and may be suspended or removed by the town. Third-party content: Unsplash photos, Bricolage Grotesque and Inter fonts (OFL), OpenStreetMap data (ODbL).'] },
  ],
  de: [
    { titre: 'Herausgeber', texte: ['Stadt Montbéliard — Rathaus, place Saint-Martin, 25200 Montbéliard. Hosting: Server in der Europäischen Union.'] },
    { titre: 'Kamera und Standort', texte: ['Die Kamera wird nur auf Ihrem Handy zur Erkennung des Plakats oder Denkmals genutzt. Es wird kein Bild gesendet oder gespeichert.', 'Ihr Standort dient auf dem Handy zur Berechnung der Entfernungen. Es wird keine Route gespeichert. Karte und Ortsinfos bleiben auch ohne Zustimmung verfügbar.'] },
    { titre: 'Statistiken', texte: ['Wir zählen QR-Scans und Animationsstarts ohne Cookies oder Kennungen, auf die Stunde gerundet.'] },
    { titre: 'Meldungen', texte: ['Meldungen sind anonym. Ihre IP-Adresse dient nur der Missbrauchsbegrenzung (5 Meldungen pro Stunde), bleibt höchstens eine Stunde im Speicher und wird nie gespeichert. Meldungen werden 12 Monate aufbewahrt.'] },
    { titre: 'Partnerkonten', texte: ['Es werden nur die Organisation und die Kontaktperson erfasst. Sie haben ein Recht auf Auskunft, Berichtigung und Löschung.'] },
    { titre: 'Inhalte und Rechte', texte: ['Partnerinhalte werden unter deren Verantwortung veröffentlicht und können von der Stadt ausgesetzt oder entfernt werden. Drittinhalte: Unsplash-Fotos, Schriften Bricolage Grotesque und Inter (OFL), OpenStreetMap-Daten (ODbL).'] },
  ],
}

export default function PageMentions() {
  const { t, langue } = useLangue()
  const navigate = useNavigate()
  return (
    <div className="page page-defilante page-mentions">
      <div className="entete-mobile">
        <button type="button" className="bouton-icone" onClick={() => navigate(-1)} aria-label={t('commun.retour')}>
          <Icone nom="gauche" taille={20} />
        </button>
        <BoutonLangue />
      </div>
      <main>
        <span className="pill pill-wine">
          <Icone nom="bouclier" taille={12} />
          RGPD · DSA
        </span>
        <h1>{t('mentions.titre')}</h1>
        {contenu[langue].map((s) => (
          <section key={s.titre}>
            <h2>{s.titre}</h2>
            {s.texte.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}
