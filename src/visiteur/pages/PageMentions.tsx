import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useLangue } from '../../commun/i18n'
import { Icone } from '../../commun/Icone'
import type { Langue } from '../../commun/types'
import { BoutonLangue } from '../composants/Feuilles'

type Section = { id?: string; titre: string; texte: string[] }

// Mentions légales et politique de confidentialité (BNF-09, BNF-15, BNF-20, BNF-24).
// Les éléments entre crochets sont à compléter par le service juridique de la Ville.
const contenu: Record<Langue, Section[]> = {
  fr: [
    { id: 'accessibilite', titre: 'Déclaration d’accessibilité', texte: ['La Ville de Montbéliard s’engage à rendre l’application Mindi accessible, conformément à l’article 47 de la loi n° 2005-102 du 11 février 2005 et au décret n° 2019-768. État de conformité : partiellement conforme au référentiel général d’amélioration de l’accessibilité (RGAA 4.1) [audit de conformité à réaliser].', 'Le bouton « Accessibilité », en haut de chaque écran, permet d’agrandir le texte, de renforcer les contrastes, d’augmenter l’espacement du texte, de réduire les animations, de souligner les liens et de rendre le focus clavier très visible. Toutes les fonctions sont utilisables au clavier et avec un lecteur d’écran.', 'Contenus non accessibles : l’expérience en réalité augmentée repose sur la caméra et la vue. Alternative : chaque spectacle peut être lu sans caméra (transcription du son) et prévisualisé en 3D depuis la fiche du lieu.', 'Retour et contact : si vous ne parvenez pas à accéder à un contenu, écrivez à [adresse du référent accessibilité de la Ville] pour obtenir une alternative.', 'Voies de recours : si vous constatez un défaut d’accessibilité qui vous empêche d’accéder à un contenu et que vous n’avez pas obtenu de réponse satisfaisante, vous pouvez saisir le Défenseur des droits (formulaire en ligne, délégué de votre région ou courrier gratuit : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07).'] },
    { titre: 'Éditeur', texte: ['Ville de Montbéliard — Hôtel de Ville, place Saint-Martin, 25200 Montbéliard.', 'Directeur de la publication : [à compléter]. Hébergement : serveur situé dans l’Union européenne [prestataire à compléter].'] },
    { titre: 'Caméra et position', texte: ['La caméra sert uniquement à reconnaître l’affiche ou le monument, directement dans votre téléphone. Aucune image n’est envoyée ni conservée.', 'Votre position est utilisée dans le téléphone pour calculer les distances et le message de proximité. Aucune trajectoire n’est enregistrée ni transmise.', 'Ces accès sont demandés au moment de leur usage ; vous pouvez les refuser : la carte et les fiches restent disponibles.', 'Si vous demandez un itinéraire, votre position et celle du monument sont envoyées au calculateur d’itinéraire OpenStreetMap (routing.openstreetmap.de) pour ce seul calcul ; elles ne sont pas enregistrées par la Ville. Le fond de carte est fourni par OpenFreeMap.'] },
    { titre: 'Statistiques', texte: ['Nous comptons les scans de QR code et les lancements d’animation, sans cookie ni identifiant, arrondis à l’heure. Ils servent à mesurer la fréquentation des lieux.'] },
    { titre: 'Signalements', texte: ['Le signalement est anonyme : aucune identité n’est demandée ni transmise à la mairie ou au partenaire.', 'Votre adresse IP sert uniquement à limiter les abus (5 signalements par heure), reste en mémoire au plus une heure et n’est jamais enregistrée.', 'Les signalements et les décisions sont conservés 12 mois [durée à confirmer], puis supprimés. N’indiquez pas de données personnelles dans le commentaire.', 'Ce mécanisme répond au règlement européen sur les services numériques (DSA) [portée à confirmer par le service juridique].'] },
    { titre: 'Comptes partenaires', texte: ['Seules la structure (nom, secteur, adresse) et la personne de contact sont collectées, pour gérer le compte et notifier les décisions. Les comptes inactifs sont supprimés après [durée fixée par la Ville].', 'Vous disposez d’un droit d’accès, de rectification et de suppression : [contact du délégué à la protection des données].'] },
    { titre: 'Contenus et droits', texte: ['Les contenus des partenaires sont publiés sous leur responsabilité, dans le respect de la charte d’utilisation, et peuvent être suspendus ou retirés par la mairie.', 'Registre des contenus tiers : photographies Unsplash (licence Unsplash), polices Bricolage Grotesque et Inter (SIL Open Font License), fond de carte d’après les données OpenStreetMap (ODbL), effets sonores créés pour l’application.', 'Réalité augmentée : moteur 8th Wall (binaire distribué, licence XR Engine de Niantic Spatial) et three.js (licence MIT). This product includes the XR Engine software developed by Niantic Spatial, Inc. Copyright © 2026 Niantic Spatial, Inc. All rights reserved. Licensed under the XR Engine License Agreement: https://github.com/8thwall/engine/blob/main/LICENSE'] },
  ],
  en: [
    { id: 'accessibilite', titre: 'Accessibility statement', texte: ['The Town of Montbéliard is committed to making Mindi accessible (French law no. 2005-102 and decree 2019-768). Compliance status: partially compliant with RGAA 4.1.', 'The “Accessibility” button at the top of each screen lets you enlarge text, increase contrast and text spacing, reduce motion, underline links and show a strong keyboard focus.', 'Non-accessible content: the augmented reality experience relies on the camera and sight. Alternative: every show can be read without the camera (sound transcript) and previewed in 3D from the place card.', 'If you cannot access some content, contact [Town accessibility contact]. You may also refer the matter to the Défenseur des droits.'] },
    { titre: 'Publisher', texte: ['Town of Montbéliard — Town Hall, place Saint-Martin, 25200 Montbéliard. Hosting: server located in the European Union.'] },
    { titre: 'Camera and location', texte: ['The camera is only used on your phone to recognise the poster or monument. No image is sent or stored.', 'Your location is used on your phone to compute distances. No route is recorded or sent. You can refuse both: the map and place cards remain available.', 'If you ask for a walking route, your location and the monument’s are sent to the OpenStreetMap route planner (routing.openstreetmap.de) for that calculation only. Map tiles are provided by OpenFreeMap.'] },
    { titre: 'Statistics', texte: ['We count QR scans and animation launches without cookies or identifiers, rounded to the hour.'] },
    { titre: 'Reports', texte: ['Reports are anonymous. Your IP address is only used to limit abuse (5 reports per hour), kept in memory for at most one hour and never stored. Reports are kept for 12 months. Do not include personal data in comments.'] },
    { titre: 'Partner accounts', texte: ['Only the organisation and contact person are collected. You have the right to access, correct and delete your data.'] },
    { titre: 'Content and rights', texte: ['Partner content is published under their responsibility and may be suspended or removed by the town. Third-party content: Unsplash photos, Bricolage Grotesque and Inter fonts (OFL), OpenStreetMap data (ODbL).', 'Augmented reality: 8th Wall engine (distributed binary, Niantic Spatial XR Engine licence) and three.js (MIT licence). This product includes the XR Engine software developed by Niantic Spatial, Inc. Copyright © 2026 Niantic Spatial, Inc. All rights reserved. Licensed under the XR Engine License Agreement: https://github.com/8thwall/engine/blob/main/LICENSE'] },
  ],
  de: [
    { id: 'accessibilite', titre: 'Erklärung zur Barrierefreiheit', texte: ['Die Stadt Montbéliard verpflichtet sich, Mindi barrierefrei zu gestalten (französisches Gesetz Nr. 2005-102, Dekret 2019-768). Konformitätsstatus: teilweise konform mit RGAA 4.1.', 'Über die Schaltfläche „Barrierefreiheit“ oben auf jedem Bildschirm können Sie Text vergrößern, Kontrast und Textabstände erhöhen, Bewegungen reduzieren, Links unterstreichen und einen deutlichen Tastaturfokus anzeigen.', 'Nicht barrierefreie Inhalte: Das AR-Erlebnis benötigt Kamera und Sehvermögen. Alternative: Jede Show kann ohne Kamera gelesen (Transkript) und in 3D auf der Ortsseite angesehen werden.', 'Wenn Sie auf einen Inhalt nicht zugreifen können, wenden Sie sich an [Kontakt der Stadt]. Sie können sich auch an den Défenseur des droits wenden.'] },
    { titre: 'Herausgeber', texte: ['Stadt Montbéliard — Rathaus, place Saint-Martin, 25200 Montbéliard. Hosting: Server in der Europäischen Union.'] },
    { titre: 'Kamera und Standort', texte: ['Die Kamera wird nur auf Ihrem Handy zur Erkennung des Plakats oder Denkmals genutzt. Es wird kein Bild gesendet oder gespeichert.', 'Ihr Standort dient auf dem Handy zur Berechnung der Entfernungen. Es wird keine Route gespeichert. Karte und Ortsinfos bleiben auch ohne Zustimmung verfügbar.', 'Wenn Sie eine Route anfordern, werden Ihr Standort und der des Denkmals nur für diese Berechnung an den OpenStreetMap-Routenplaner (routing.openstreetmap.de) gesendet. Kartendaten: OpenFreeMap.'] },
    { titre: 'Statistiken', texte: ['Wir zählen QR-Scans und Animationsstarts ohne Cookies oder Kennungen, auf die Stunde gerundet.'] },
    { titre: 'Meldungen', texte: ['Meldungen sind anonym. Ihre IP-Adresse dient nur der Missbrauchsbegrenzung (5 Meldungen pro Stunde), bleibt höchstens eine Stunde im Speicher und wird nie gespeichert. Meldungen werden 12 Monate aufbewahrt.'] },
    { titre: 'Partnerkonten', texte: ['Es werden nur die Organisation und die Kontaktperson erfasst. Sie haben ein Recht auf Auskunft, Berichtigung und Löschung.'] },
    { titre: 'Inhalte und Rechte', texte: ['Partnerinhalte werden unter deren Verantwortung veröffentlicht und können von der Stadt ausgesetzt oder entfernt werden. Drittinhalte: Unsplash-Fotos, Schriften Bricolage Grotesque und Inter (OFL), OpenStreetMap-Daten (ODbL).', 'Augmented Reality: 8th-Wall-Engine (verteilte Binärdatei, XR-Engine-Lizenz von Niantic Spatial) und three.js (MIT-Lizenz). This product includes the XR Engine software developed by Niantic Spatial, Inc. Copyright © 2026 Niantic Spatial, Inc. All rights reserved. Licensed under the XR Engine License Agreement: https://github.com/8thwall/engine/blob/main/LICENSE'] },
  ],
}

export default function PageMentions() {
  const { t, langue } = useLangue()
  const navigate = useNavigate()
  const { hash } = useLocation()
  // Lien direct vers une section (ex. #accessibilite depuis le panneau Accessibilité).
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])
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
          RGPD · DSA · RGAA
        </span>
        <h1>{t('mentions.titre')}</h1>
        {contenu[langue].map((s) => (
          <section key={s.titre} id={s.id}>
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
