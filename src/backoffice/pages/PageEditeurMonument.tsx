import { lazy, Suspense, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { RAYON_PAR_DEFAUT_M } from '../../commun/constantes'
import { Icone } from '../../commun/Icone'
import { messageErreur } from '../../commun/api'
import { attendreControle, enregistrerAnimation, enregistrerLieu, importerFichier, supprimerLieu, useEtat } from '../../commun/store'
import type { Animation, Lieu, Texte3 } from '../../commun/types'
import { ChoixPosition } from '../composants/ChoixPosition'
import { SonEtDuree, useReglagesModele } from '../composants/atelier/OutilsAtelier'
import { proprietaireDe, useSession } from '../session'
import { BadgeStatut, DialogueSuppression, maintenantLocal, Onglets, toastApresNavigation, useToast } from '../ui'

const AtelierMonument = lazy(() => import('../composants/atelier/AtelierMonument'))

const ETAPES = [
  { titre: 'Fiche', aide: 'Nom, adresse, présentation', intro: 'Ce que le visiteur lit sur la carte et la fiche du monument : en français (obligatoire), en anglais et en allemand.' },
  { titre: 'Position GPS', aide: 'Point et rayon', intro: 'Placez le repère au centre du monument (vue satellite) ou cherchez son adresse. Le rayon délimite la zone où le visiteur peut lancer l’animation.' },
  { titre: 'Animation 3D', aide: 'Modèle, position, taille', intro: 'Choisissez le modèle 3D du monument, puis placez-le autour du bâtiment : déplacez-le, tournez-le, changez sa taille.' },
  { titre: 'Publication', aide: 'Diffusion et carte', intro: 'Choisissez quand l’animation se lance et quand elle est diffusée, puis rendez le monument visible sur la carte des visiteurs.' },
]

const versLocal = (iso?: string) => (iso ? iso.slice(0, 16) : '')

function lieuVide(): Lieu {
  const vide: Texte3 = { fr: '', en: '', de: '' }
  return { id: '', nom: '', nomCourt: '', categorie: { ...vide }, adresse: '', description: { ...vide }, latitude: 47.5085, longitude: 6.8005, rayonM: RAYON_PAR_DEFAUT_M, actif: false, accesLibre: true }
}

/** Les monuments sont chargés depuis l'API avant d'ouvrir l'éditeur (lien direct vers /lieux/:id). */
export default function PageEditeurMonument() {
  const { id } = useParams()
  const { chargement } = useEtat()
  if (chargement) return <div className="bo-defilement">Chargement…</div>
  return <EditeurMonument key={id ?? 'nouveau'} id={id} />
}

/**
 * Création d'un monument en 4 étapes, sur le même modèle que la création d'affiche : sa fiche, sa
 * position GPS et son rayon, son animation 3D (réglée dans l'atelier du monument : modèle, position
 * autour du bâtiment, rotation, taille), puis sa publication (diffusion de l'animation, carte).
 */
function EditeurMonument({ id }: { id?: string }) {
  const etat = useEtat()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const existant = etat.lieux.find((x) => x.id === id)
  const demande = location.state as { etape?: number; animationId?: string } | null
  const etapeDemandee = demande?.etape
  const [etape, setEtape] = useState(etapeDemandee ?? 1)
  const [l, setL] = useState<Lieu>(() => existant ?? lieuVide())
  const [langue, setLangue] = useState<keyof Texte3>('fr')
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [suppression, setSuppression] = useState(false)
  const maj = (p: Partial<Lieu>) => setL((x) => ({ ...x, ...p }))

  // ------------------------------------------------------------ animation du monument (étape 3)
  const animations = l.id ? etat.animations.filter((x) => x.lieuId === l.id) : []
  const nouvelleAnimation = (): Animation => ({
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
  // Depuis la liste : une animation précise, ou une nouvelle (animationId vide) ; sinon la première du monument.
  const [anim, setAnim] = useState<Animation>(() => {
    const choisie = demande?.animationId === undefined ? animations[0] : animations.find((x) => x.id === demande.animationId)
    return choisie ? { ...choisie } : nouvelleAnimation()
  })
  const animEnregistree = useRef(JSON.stringify(anim))
  const majAnim = (p: Partial<Animation>) => setAnim((x) => ({ ...x, ...p }))
  const fichierModele = etat.fichiers.find((f) => f.id === anim.modeleId)
  const modele = useReglagesModele(fichierModele)
  /** Une animation existe (enregistrée) ou est en préparation (modèle choisi). */
  const avecAnimation = !!anim.id || !!anim.modeleId
  const animModifiee = JSON.stringify(anim) !== animEnregistree.current || modele.modifie
  const verrou = anim.statut === 'SUSPENDUE' || anim.statut === 'RETIREE'

  if (id && !existant && !l.id) {
    return (
      <div className="bo-defilement">
        <p>Monument introuvable.</p>
        <Link to="/backoffice/lieux">Retour aux monuments</Link>
      </div>
    )
  }

  const ficheComplete = !!(l.nom.trim() && l.nomCourt.trim() && l.adresse.trim() && l.description.fr.trim() && l.categorie.fr.trim())
  const erreursAnim = {
    modele: avecAnimation && !anim.modeleId,
    transcription: !!anim.sonId && !anim.transcription.fr.trim(),
    dates: !!anim.fin && anim.fin <= anim.debut,
    duree: !(anim.dureeS >= 5 && anim.dureeS <= 1800),
  }
  const animValide = !avecAnimation || !Object.values(erreursAnim).some(Boolean)
  const langues = (['fr', 'en', 'de'] as const).filter((k) => l.description[k].trim()).length

  /** Visuel de la fiche : image importée puis contrôlée par l'API (sharp). */
  async function importerVisuel(fichier: File) {
    setErreur(null)
    setEnvoi('visuel')
    try {
      const cree = await importerFichier(fichier, 'LIEU')
      const f = await attendreControle(cree.id)
      if (f.statutControle === 'REFUSE') throw new Error(`Visuel refusé : ${f.raisonRefus ?? 'format non reconnu'}.`)
      maj({ visuelId: f.id, image: f.url })
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(null)
    }
  }

  /** Enregistre le monument (création ou modification) ; renvoie le monument à jour. */
  async function enregistrerMonument(p: Partial<Lieu> = {}): Promise<Lieu> {
    const r = await enregistrerLieu({ ...l, ...p })
    setL((x) => ({ ...x, ...p, id: r.id }))
    return r
  }

  /** Enregistre l'animation (et les réglages de son modèle) si elle existe et a changé. */
  async function enregistrerAnim(lieuId: string, publier = false) {
    if (!avecAnimation || verrou || (!animModifiee && !publier)) return
    if (fichierModele) await modele.enregistrer()
    const envoyee: Animation = { ...anim, lieuId, titre: anim.titre.trim() || `Animation — ${l.nomCourt || l.nom}` }
    const r = await enregistrerAnimation(envoyee, publier)
    const suivante = { ...envoyee, id: r.id, statut: r.statut }
    animEnregistree.current = JSON.stringify(suivante)
    setAnim(suivante)
  }

  async function executer(action: () => Promise<void>, succes?: string) {
    setErreur(null)
    setEnvoi('enregistrement')
    try {
      await action()
      if (succes) toast.afficher(succes)
      return true
    } catch (e) {
      setErreur(messageErreur(e))
      return false
    } finally {
      setEnvoi(null)
    }
  }

  /** Étape suivante : le monument est créé en quittant l'étape 2 (l'animation lui est rattachée). */
  async function suivant() {
    setTente(true)
    if (etape === 1 && !ficheComplete) return setErreur('Complétez les champs signalés : nom, nom court, adresse, catégorie et présentation en français.')
    if (etape === 3 && !animValide) return
    setTente(false)
    if (etape === 1 && !l.id) return (setErreur(null), setEtape(2))
    const ok = await executer(async () => {
      const r = await enregistrerMonument()
      if (etape === 3) await enregistrerAnim(r.id)
      if (!l.id) navigate(`/backoffice/lieux/${r.id}`, { replace: true, state: { etape: 3 } })
    })
    if (ok && l.id) setEtape(Math.min(ETAPES.length, etape + 1))
  }

  async function sauver() {
    setTente(true)
    if (!ficheComplete) {
      setEtape(1)
      setErreur('Complétez d’abord la fiche : nom, nom court, adresse, catégorie et présentation en français.')
      return
    }
    if (!animValide) return setEtape(3)
    const ok = await executer(async () => {
      const r = await enregistrerMonument()
      await enregistrerAnim(r.id)
    })
    // Retour à la liste des monuments, où le message de confirmation s'affiche.
    if (ok) {
      toastApresNavigation(`« ${l.nomCourt || l.nom} » enregistré`)
      navigate('/backoffice/lieux')
    }
  }

  /** Publication : le monument devient visible sur la carte et son animation est activée. */
  async function publier() {
    setTente(true)
    if (!animValide) return setEtape(3)
    const ok = await executer(async () => {
      const r = await enregistrerMonument({ actif: true })
      await enregistrerAnim(r.id, anim.statut !== 'PUBLIEE')
    })
    if (ok) {
      toastApresNavigation(`« ${l.nomCourt || l.nom} » visible sur la carte${avecAnimation ? ', animation active' : ''}`)
      navigate('/backoffice/lieux')
    }
  }

  function choisirAnimation(animationId: string) {
    const choisie = animations.find((x) => x.id === animationId)
    const suivante = choisie ? { ...choisie } : nouvelleAnimation()
    setAnim(suivante)
    animEnregistree.current = choisie ? JSON.stringify(suivante) : JSON.stringify(nouvelleAnimation())
  }

  const pleineLargeur = etape === 2 || etape === 3
  const infoEtape = ETAPES[etape - 1]
  const controle = (ok: boolean, texte: string, facultatif = false) => (
    <li className={ok ? 'ok' : facultatif ? 'alerte' : 'ko'}>
      <Icone nom={ok ? 'check' : facultatif ? 'alerte' : 'fermer'} taille={14} /> {texte}
    </li>
  )

  return (
    <>
      <header className="bo-entete">
        <div>
          <Link to="/backoffice/lieux" className="fil-ariane">
            <Icone nom="gauche" taille={14} /> Tous les monuments
          </Link>
          <h1>{existant ? existant.nom : 'Nouveau monument'}</h1>
          <p>Le monument sert à placer une animation 3D, visible en réalité augmentée dans son rayon.</p>
        </div>
        <div className="bo-entete-actions">
          {l.id && <BadgeStatut statut={l.actif ? 'PUBLIEE' : 'BROUILLON'} libelle={l.actif ? 'Sur la carte' : 'Masqué'} />}
          {l.id && (
            <button type="button" className="btn btn-texte-danger" onClick={() => setSuppression(true)}>
              <Icone nom="poubelle" taille={15} /> Supprimer
            </button>
          )}
          <button type="button" className="btn btn-fantome" onClick={() => void sauver()} disabled={!!envoi}>
            {envoi === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </header>
      <div className={`editeur-affiche ${pleineLargeur ? 'pleine-largeur' : ''}`}>
        <div className="editeur-formulaire">
          <ol className="etapes-editeur">
            {ETAPES.map((e, i) => (
              <li key={e.titre} className={etape === i + 1 ? 'actif' : etape > i + 1 ? 'fait' : ''}>
                <button type="button" onClick={() => (l.id || i + 1 < etape ? setEtape(i + 1) : undefined)} aria-current={etape === i + 1 ? 'step' : undefined}>
                  <span>{etape > i + 1 ? <Icone nom="check" taille={13} /> : i + 1}</span>
                  <strong>{e.titre}</strong>
                  <small>{e.aide}</small>
                </button>
              </li>
            ))}
          </ol>

          <section className="section-editeur">
            <div className="tete-etape">
              <span className="eyebrow">
                Étape {etape} sur {ETAPES.length}
              </span>
              <h2>{etape === 1 ? 'Fiche du monument' : etape === 2 ? 'Position GPS du monument' : etape === 3 ? 'Animation 3D du monument' : 'Publication'}</h2>
              <p className="intro-etape">{infoEtape.intro}</p>
            </div>
            {erreur && (
              <p className="erreur-acces" role="alert">
                <Icone nom="alerte" taille={15} />
                {erreur}
              </p>
            )}

            {etape === 1 && (
              <>
                <div className="bloc-etape">
                  <h3>Identité</h3>
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
                  <label className="case">
                    <input type="checkbox" checked={l.accesLibre} onChange={(e) => maj({ accesLibre: e.target.checked })} />
                    Accès libre (indiqué sur la fiche)
                  </label>
                </div>
                <fieldset className={`bloc-etape transcriptions ${tente && (!l.description.fr.trim() || !l.categorie.fr.trim()) ? 'erreur' : ''}`}>
                  <legend>Présentation (français obligatoire)</legend>
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
                    <textarea rows={5} value={l.description[langue]} onChange={(e) => maj({ description: { ...l.description, [langue]: e.target.value } })} />
                  </label>
                </fieldset>
                <div className="bloc-etape photos-facade">
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

            {etape === 2 && (
              <div className="position-monument">
                <ChoixPosition latitude={l.latitude} longitude={l.longitude} rayonM={l.rayonM} rechercheInitiale={l.adresse} onChange={(latitude, longitude) => maj({ latitude, longitude })} />
                <div className="bloc-etape">
                  <label className="champ">
                    <span className="etiquette">
                      Rayon de proximité <small>{l.rayonM} m</small>
                    </span>
                    <input type="range" min={20} max={200} step={5} value={l.rayonM} onChange={(e) => maj({ rayonM: Number(e.target.value) })} />
                    <span className="aide">Message « Vous êtes arrivé » et lancement de l’animation dans ce rayon (50 m par défaut).</span>
                  </label>
                  <small className="aide-champ">
                    Point du monument : {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}. L’animation 3D se place ensuite autour de ce point.
                  </small>
                </div>
              </div>
            )}

            {etape === 3 && (
              <>
                <div className="atelier-etape">
                  <Suspense
                    fallback={
                      <div className="atelier-chargement">
                        <span className="spinner" /> Ouverture de l’atelier…
                      </div>
                    }
                  >
                    <AtelierMonument
                      animation={anim}
                      onAnimation={majAnim}
                      reglages3d={modele.reglages}
                      onReglages3d={modele.setReglages}
                      lieu={l}
                      desactive={verrou}
                      erreurModele={tente && erreursAnim.modele}
                      entete={
                        <div className="choix-animation">
                          {animations.length > 0 && (
                            <label className="champ">
                              <span className="etiquette">Animation du monument</span>
                              <select value={anim.id} onChange={(e) => choisirAnimation(e.target.value)}>
                                {animations.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.titre}
                                    {x.statut === 'PUBLIEE' ? '' : x.statut === 'BROUILLON' ? ' (brouillon)' : ' (suspendue)'}
                                  </option>
                                ))}
                                <option value="">+ Nouvelle animation</option>
                              </select>
                            </label>
                          )}
                          <label className="champ">
                            <span className="etiquette">
                              Titre de l’animation <small>Facultatif</small>
                            </span>
                            <input value={anim.titre} onChange={(e) => majAnim({ titre: e.target.value })} maxLength={120} placeholder={`Animation — ${l.nomCourt || l.nom || 'monument'}`} disabled={verrou} />
                          </label>
                          {verrou && (
                            <p className="note-partage">
                              <Icone nom="cadenas" taille={14} /> Animation {anim.statut === 'SUSPENDUE' ? 'suspendue' : 'retirée'} par la modération.
                            </p>
                          )}
                        </div>
                      }
                    />
                  </Suspense>
                </div>
                <details className="details-etape" open={!!anim.sonId || (tente && erreursAnim.transcription)}>
                  <summary>
                    <Icone nom="son" taille={16} />
                    <strong>Son, durée et accessibilité</strong>
                    <small>
                      {anim.sonId ? 'son ajouté' : 'sans son'} · {anim.dureeS} s
                    </small>
                  </summary>
                  <SonEtDuree animation={anim} onChange={majAnim} desactive={verrou} tente={tente} />
                </details>
                {!avecAnimation && (
                  <p className="note-partage">
                    <Icone nom="info" taille={14} /> Sans modèle 3D, le monument n’aura pas d’animation : vous pourrez en ajouter une plus tard.
                  </p>
                )}
                {tente && !animValide && (
                  <p className="erreur-acces" role="alert">
                    <Icone nom="alerte" taille={15} />
                    {erreursAnim.modele ? 'Choisissez le modèle 3D de l’animation.' : erreursAnim.transcription ? 'Ajoutez la transcription française du son (accessibilité).' : 'La durée doit être comprise entre 5 et 1 800 secondes.'}
                  </p>
                )}
              </>
            )}

            {etape === 4 && (
              <>
                {avecAnimation && (
                  <div className="bloc-etape">
                    <h3>Diffusion de l’animation</h3>
                    <div className="grille-champs">
                      <label className="champ pleine">
                        <span className="etiquette">Lancement</span>
                        <select value={anim.declencheur} onChange={(e) => majAnim({ declencheur: e.target.value as Animation['declencheur'] })} disabled={verrou}>
                          <option value="MONUMENT">Automatique dès que le visiteur arrive dans le rayon</option>
                          <option value="MANUEL">Le visiteur appuie sur « Lancer » dans le rayon</option>
                        </select>
                      </label>
                      <label className="champ">
                        <span className="etiquette">
                          Date et heure de sortie
                          <button type="button" className="lien-champ" onClick={() => majAnim({ debut: maintenantLocal() })} disabled={verrou}>
                            Maintenant
                          </button>
                        </span>
                        {/* Un champ incomplet (date sans heure) donne une valeur vide : la date précédente est gardée. */}
                        <input type="datetime-local" value={versLocal(anim.debut)} onChange={(e) => e.target.value && majAnim({ debut: `${e.target.value}:00` })} disabled={verrou} />
                        <span className="aide">
                          {new Date(anim.debut) <= new Date()
                            ? 'Diffusée dès la publication.'
                            : `Programmée : visible par les visiteurs à partir du ${new Date(anim.debut).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`}
                        </span>
                      </label>
                      <label className={`champ ${tente && erreursAnim.dates ? 'erreur' : ''}`}>
                        <span className="etiquette">
                          Fin <small>Vide = permanente</small>
                        </span>
                        <input type="datetime-local" value={versLocal(anim.fin)} onChange={(e) => majAnim({ fin: e.target.value ? `${e.target.value}:00` : undefined })} disabled={verrou} />
                        {tente && erreursAnim.dates && <span className="message-erreur">La fin doit être postérieure à la sortie.</span>}
                      </label>
                    </div>
                  </div>
                )}
                <div className="bloc-etape">
                  <h3>Carte des visiteurs</h3>
                  <label className="case">
                    <input type="checkbox" checked={l.actif} onChange={(e) => maj({ actif: e.target.checked })} />
                    Monument visible sur la carte des visiteurs
                  </label>
                  <small className="aide-champ">« Publier » rend le monument visible et active son animation ; « Enregistrer » garde les réglages sans rien montrer de plus.</small>
                </div>
                <div className="bloc-etape">
                  <h3>Récapitulatif</h3>
                  <ul className="verifications">
                    {controle(ficheComplete, 'Fiche complète (nom, adresse, présentation)')}
                    {controle(langues === 3, `Présentation traduite : ${langues}/3 langues`, true)}
                    {controle(!!l.image, l.image ? 'Visuel de la fiche importé' : 'Aucun visuel de fiche', true)}
                    {controle(true, `Position GPS et rayon de ${l.rayonM} m`)}
                    {controle(!!anim.modeleId, anim.modeleId ? `Animation 3D : ${fichierModele?.nomOriginal ?? 'modèle choisi'}${anim.placement ? ', placée autour du bâtiment' : ', position par défaut'}` : 'Aucune animation 3D', true)}
                    {avecAnimation && controle(!anim.sonId || !!anim.transcription.fr.trim(), anim.sonId ? 'Transcription du son en français' : 'Sans son')}
                    {avecAnimation && controle(anim.statut === 'PUBLIEE', anim.statut === 'PUBLIEE' ? 'Animation active' : 'Animation en brouillon : activée par « Publier »', true)}
                  </ul>
                </div>
              </>
            )}
          </section>

          <div className="pied-editeur">
            <button type="button" className="btn btn-fantome" onClick={() => (etape === 1 ? navigate('/backoffice/lieux') : setEtape(etape - 1))}>
              {etape === 1 ? (
                'Annuler'
              ) : (
                <>
                  <Icone nom="gauche" taille={15} /> {ETAPES[etape - 2].titre}
                </>
              )}
            </button>
            {etape < ETAPES.length ? (
              <button type="button" className="btn btn-primaire" onClick={() => void suivant()} disabled={!!envoi}>
                {envoi === 'enregistrement' ? <span className="spinner" /> : null}
                {etape === 2 && !l.id ? 'Créer le monument' : `Continuer : ${ETAPES[etape].titre}`} <Icone nom="droite" taille={15} />
              </button>
            ) : (
              <div className="actions-finales">
                <button type="button" className="btn btn-secondaire" onClick={() => void sauver()} disabled={!!envoi}>
                  Enregistrer
                </button>
                <button type="button" className="btn btn-primaire" onClick={() => void publier()} disabled={!!envoi || !ficheComplete || verrou}>
                  {envoi === 'enregistrement' ? <span className="spinner" /> : <Icone nom="check" taille={15} />}
                  {l.actif && (!avecAnimation || anim.statut === 'PUBLIEE') ? 'Enregistrer et garder publié' : 'Publier'}
                </button>
              </div>
            )}
          </div>
        </div>

        {!pleineLargeur && (
          <aside className="editeur-apercu">
            <div className="libelle-apercu">
              <strong>Fiche dans l’application</strong>
              <span className="pill pill-stone">{l.actif ? 'Sur la carte' : 'Masqué'}</span>
            </div>
            <article className="apercu-fiche-monument">
              <div className="image">{l.image ? <img src={l.image} alt="" /> : <Icone nom="pin" taille={34} />}</div>
              <div>
                <span className="eyebrow">{l.categorie.fr || 'Catégorie'}</span>
                <strong>{l.nom || 'Nom du monument'}</strong>
                <small>
                  <Icone nom="pin" taille={12} /> {l.adresse || 'Adresse'}
                  {l.accesLibre ? ' · accès libre' : ''}
                </small>
                <p>{l.description.fr || 'La présentation historique du monument apparaîtra ici.'}</p>
                {avecAnimation && (
                  <span className="pill pill-cyan">
                    <Icone nom="cube" taille={12} /> Animation 3D dans un rayon de {l.rayonM} m
                  </span>
                )}
              </div>
            </article>
          </aside>
        )}
      </div>
      <DialogueSuppression
        cible={suppression ? l.nom || 'ce monument' : null}
        description="Le lieu disparaîtra de la carte des visiteurs et des zones de proximité. Les animations qui y sont rattachées doivent d’abord être supprimées ou déplacées. La suppression reste inscrite au journal."
        onFermer={() => setSuppression(false)}
        onConfirmer={async () => {
          const r = await supprimerLieu(l.id)
          if (r.ok) navigate('/backoffice/lieux')
          return r
        }}
      />
      {toast.element}
    </>
  )
}
