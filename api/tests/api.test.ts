// Tests de bout en bout de l'API : authentification, droits (401/403), contrôle des fichiers
// (taille maximale du modèle 3D lue dans la base : 100 Mo, animations GLB), règle des 4 conditions
// de publication, parcours visiteur public, signalement anonyme, modération et suppressions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import sharp from 'sharp'
import { NOM_ANIMATION_COMBINEE } from '../../src/commun/constantes.js'
import { prisma } from '../src/db.js'
import { attendreTraitements } from '../src/services/file.js'
import { origineQr } from '../src/traitements/genererPDF.js'
import { ALTCHA_TEST, app, connecterAgent, creerAgent, dernierCode, connecterPartenaire, dateLocale, genererGlb, genererMp3, genererPng, importer, MOT_DE_PASSE, type Client } from './outils.js'

const API = '/api/v1'
type Session = { c: Client; jeton: string }
let agent: Session
let partenaire: Session & { partenaireId: string; compteId: number }

beforeAll(async () => {
  agent = await connecterAgent()
  partenaire = await connecterPartenaire(agent)
})

afterAll(async () => {
  await attendreTraitements()
  await prisma.$disconnect()
})

// ---------------------------------------------------------------- authentification et droits

describe('Authentification', () => {
  it('refuse les routes protégées sans connexion (401)', async () => {
    const r = await request(app).get(`${API}/animations`)
    expect(r.status).toBe(401)
  })

  it('compte les échecs puis bloque le compte après 5 essais (429)', async () => {
    const { compte } = await connecterAgent()
    for (let i = 1; i <= 4; i++) {
      const r = await request(app).post(`${API}/auth/connexion`).send({ email: compte.email, motDePasse: 'mauvais' })
      expect(r.status).toBe(401)
      expect(r.body.erreur).toContain(`${i}/5`)
    }
    expect((await request(app).post(`${API}/auth/connexion`).send({ email: compte.email, motDePasse: 'mauvais' })).status).toBe(429)
    // Même le bon mot de passe est refusé pendant le blocage.
    expect((await request(app).post(`${API}/auth/connexion`).send({ email: compte.email, motDePasse: MOT_DE_PASSE })).status).toBe(429)
  })

  it('envoie un code par mail à l’agent et refuse un code incorrect', async () => {
    const compte = await creerAgent()
    const c = request.agent(app)
    expect((await c.post(`${API}/auth/connexion`).send({ email: compte.email, motDePasse: MOT_DE_PASSE })).body.etape).toBe('CODE')
    const code = dernierCode(compte.email)
    const faux = code === '000000' ? '111111' : '000000'
    const r = await c.post(`${API}/auth/code`).send({ code: faux })
    expect(r.status).toBe(401)
    expect(r.body.erreur).toContain('1/5')
    expect((await c.get(`${API}/auth/session`)).body.session).toBeNull()
    // Renvoi trop rapproché refusé, puis le bon code ouvre la session ; il ne sert qu'une fois.
    expect((await c.post(`${API}/auth/code/renvoi`)).status).toBe(429)
    await c.post(`${API}/auth/code`).send({ code }).expect(200)
    expect((await c.get(`${API}/auth/session`)).body.session.role).toBe('AGENT')
    expect((await request.agent(app).post(`${API}/auth/code`).send({ code })).status).toBe(401)
  })

  it('annule le code après 5 essais incorrects', async () => {
    const compte = await creerAgent()
    const c = request.agent(app)
    await c.post(`${API}/auth/connexion`).send({ email: compte.email, motDePasse: MOT_DE_PASSE }).expect(200)
    const code = dernierCode(compte.email)
    const faux = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await c.post(`${API}/auth/code`).send({ code: faux })
    const r = await c.post(`${API}/auth/code`).send({ code })
    expect(r.status).toBe(401)
    expect(r.body.erreur).toMatch(/reprenez la connexion/)
  })

  it('refuse l’inscription sans preuve anti-robot et la connexion d’un compte non vérifié', async () => {
    const corps = { nomStructure: 'Musée test', secteur: 'Culture & patrimoine', adresse: '2 rue Test', contactNom: 'Contact', email: 'attente@exemple.test', motDePasse: MOT_DE_PASSE, rgpd: true }
    expect((await request(app).post(`${API}/auth/inscription`).send({ ...corps, altcha: 'preuve-invalide-123' })).status).toBe(400)
    expect((await request(app).post(`${API}/auth/inscription`).send({ ...corps, altcha: ALTCHA_TEST })).status).toBe(201)
    const r = await request(app).post(`${API}/auth/connexion`).send({ email: corps.email, motDePasse: MOT_DE_PASSE })
    expect(r.status).toBe(403)
    expect(r.body.erreur).toMatch(/attente/)
  })

  it('refuse une modification sans jeton anti-CSRF (403)', async () => {
    const r = await agent.c.post(`${API}/zones`).send({ nom: 'Zone', adresse: 'Rue', format: 'A2', regles: '', active: true })
    expect(r.status).toBe(403)
  })

  it('réserve les routes des agents (403 pour un partenaire)', async () => {
    expect((await partenaire.c.get(`${API}/admin/journal`)).status).toBe(403)
    const lieu = { nom: 'Lieu', nomCourt: 'Lieu', categorie: { fr: 'Patrimoine' }, adresse: 'Rue', description: { fr: 'Texte' }, latitude: 47.5, longitude: 6.8, rayonM: 50, accesLibre: true, actif: true }
    expect((await partenaire.c.post(`${API}/lieux`).set('X-CSRF-Token', partenaire.jeton).send(lieu)).status).toBe(403)
  })

  it('bloque l’import tant que la charte n’est pas acceptée', async () => {
    const sansCharte = await connecterPartenaire(agent, { charte: false })
    const r = await importer(sansCharte.c, sansCharte.jeton, await genererPng(), 'affiche.png')
    expect(r.statut).toBe(403)
  })
})

// ---------------------------------------------------------------- fichiers

describe('Contrôle automatique des fichiers', () => {
  it('lit les animations intégrées d’un GLB (clips de durée nulle ignorés)', async () => {
    const glb = await genererGlb({ clips: [{ nom: 'Apparition', dureeS: 2 }, { nom: 'Vide', dureeS: 0 }, { nom: 'Danse', dureeS: 4.5 }] })
    const { statut, corps } = await importer(agent.c, agent.jeton, glb, 'modele.glb', 'LIEU')
    expect(statut).toBe(201)
    expect(corps.statutControle).toBe('EN_COURS')
    expect(corps.controleTermine).toBe(true)
    expect(corps.nbTriangles).toBe(12)
    expect(corps.clips.map((c: { nom: string; indice: number }) => [c.nom, c.indice])).toEqual([
      ['Apparition', 0],
      ['Danse', 2],
    ])
    expect(corps.url).toMatch(/^\/uploads\/3d\/.+\.glb$/)
    // Le fichier servi contient en plus l'animation combinée (toutes les animations ensemble, pour
    // model-viewer), absente de la liste des clips proposés à l'éditeur.
    const servi = await request(app).get(corps.url).buffer(true).parse((res, fin) => {
      const morceaux: Buffer[] = []
      res.on('data', (m: Buffer) => morceaux.push(m))
      res.on('end', () => fin(null, Buffer.concat(morceaux)))
    })
    expect(servi.status).toBe(200)
    const fichierServi = servi.body as Buffer
    const json = JSON.parse(fichierServi.subarray(20, 20 + fichierServi.readUInt32LE(12)).toString()) as { animations: { name: string; channels: unknown[] }[] }
    expect(json.animations.map((a) => a.name)).toEqual(['Apparition', 'Vide', 'Danse', NOM_ANIMATION_COMBINEE])
    expect(json.animations[3].channels).toHaveLength(2)
    expect(corps.tailleOctets).toBe(fichierServi.length)
    await agent.c.patch(`${API}/fichiers/${corps.id}/valider`).set('X-CSRF-Token', agent.jeton).expect(200)
  })

  it('accepte un modèle 3D de 60 Mo (limite de la base : 100 Mo)', async () => {
    const glb = await genererGlb({ clips: [{ nom: 'Tour', dureeS: 3 }], octetsSupplementaires: 60_000_000 })
    expect(glb.length).toBeGreaterThan(60_000_000)
    const { statut, corps } = await importer(partenaire.c, partenaire.jeton, glb, 'lourd.glb')
    expect(statut).toBe(201)
    expect(corps.tailleOctets).toBe(glb.length)
    expect(corps.statutControle).toBe('EN_COURS')
    expect(corps.clips).toHaveLength(1)
    const ligne = await prisma.fichier.findUniqueOrThrow({ where: { id: Number(corps.id) } })
    expect(ligne.taille_octets).toBe(glb.length)
  })

  it('refuse un fichier de plus de 100 Mo (413)', async () => {
    const trop = Buffer.alloc(100_000_001)
    trop.write('glTF', 0)
    const { statut } = await importer(partenaire.c, partenaire.jeton, trop, 'enorme.glb')
    expect(statut).toBe(413)
  })

  it('la base refuse aussi un modèle de plus de 100 Mo (contrainte ck_fichier_taille)', async () => {
    await expect(
      prisma.fichier.create({
        data: { proprietaire_id: partenaire.compteId, type: 'MODELE_3D', nom_original: 'x.glb', chemin: '3d/x.glb', type_mime: 'model/gltf-binary', taille_octets: 100_000_001 },
      }),
    ).rejects.toThrow()
  })

  it('refuse un modèle d’affiche au-delà du budget de triangles', async () => {
    const { corps } = await importer(partenaire.c, partenaire.jeton, await genererGlb({ triangles: 30_001 }), 'dense.glb')
    expect(corps.statutControle).toBe('REFUSE')
    expect(corps.raisonRefus).toMatch(/triangles/)
    expect((await partenaire.c.patch(`${API}/fichiers/${corps.id}/valider`).set('X-CSRF-Token', partenaire.jeton)).status).toBe(409)
  })

  it('refuse un faux GLB (type réel vérifié par file-type)', async () => {
    const { statut } = await importer(partenaire.c, partenaire.jeton, Buffer.from('ceci n’est pas un modèle 3D'.repeat(20)), 'faux.glb')
    expect(statut).toBe(400)
  })

  it('mesure la durée d’un son MP3 (ffprobe)', async () => {
    const { statut, corps } = await importer(partenaire.c, partenaire.jeton, genererMp3(2), 'son.mp3')
    expect(statut).toBe(201)
    expect(corps.type).toBe('SON')
    expect(corps.dureeS).toBeGreaterThan(1.5)
    expect(corps.dureeS).toBeLessThan(2.5)
  })

  it('réencode une image et relève ses dimensions (sharp)', async () => {
    const { corps } = await importer(partenaire.c, partenaire.jeton, await genererPng(900, 1273), 'affiche.png')
    expect(corps.type).toBe('IMAGE')
    expect(corps.statutControle).toBe('CONFORME')
    expect([corps.largeurPx, corps.hauteurPx]).toEqual([900, 1273])
  })
})

// ---------------------------------------------------------------- parcours complet d'une affiche

describe('Parcours affiche : création, conditions, publication, visiteur, modération', () => {
  let lieuId: string
  let animLieuId: string
  let animAfficheId: string
  let afficheId: string
  let codeQr: string
  let zoneId: string
  let modeleLieuId: string

  it('un agent crée un lieu et son animation à partir d’un clip du GLB', async () => {
    const lieu = await agent.c
      .post(`${API}/lieux`)
      .set('X-CSRF-Token', agent.jeton)
      .send({ nom: 'Château des Ducs', nomCourt: 'Château', categorie: { fr: 'Patrimoine' }, adresse: 'Montbéliard', description: { fr: 'Château' }, latitude: 47.5098, longitude: 6.7985, rayonM: 50, accesLibre: true, actif: true })
      .expect(201)
    lieuId = lieu.body.id
    const glb = await importer(agent.c, agent.jeton, await genererGlb({ clips: [{ nom: 'Entrée', dureeS: 2 }, { nom: 'Feu', dureeS: 3 }] }), 'lieu.glb', 'LIEU')
    modeleLieuId = glb.corps.id
    await agent.c.patch(`${API}/fichiers/${modeleLieuId}/valider`).set('X-CSRF-Token', agent.jeton).expect(200)
    const anim = await agent.c
      .post(`${API}/animations`)
      .set('X-CSRF-Token', agent.jeton)
      .send({ titre: 'Lumières du château', type: 'LIEU', lieuId, modeleId: modeleLieuId, clipIndice: 1, lecture: 'UNE_FOIS', declencheur: 'MONUMENT', dureeS: 60, debut: dateLocale(-1), transcription: { fr: 'Musique' }, publier: true })
      .expect(201)
    animLieuId = anim.body.id
    expect(anim.body.clipIndice).toBe(1)
    expect(anim.body.lecture).toBe('UNE_FOIS')
    expect(anim.body.modeleUrl).toMatch(/^\/uploads\/3d\//)
    const pub = await request(app).get(`${API}/public/lieux`).expect(200)
    expect(pub.body.animations.map((a: { id: string }) => a.id)).toContain(animLieuId)
    // Sans position personnalisée : le téléphone utilise la position du lieu.
    expect(anim.body.placement).toBeUndefined()
  })

  it('atelier 3D : enregistre les réglages d’un modèle et les transmet au visiteur', async () => {
    const reglages = { rotation: { x: -90, y: 45, z: 0 }, ancrage: 'centre', hauteur: 0.2, vitesse: 0.5, luminosite: 1.3 }
    const r = await agent.c.patch(`${API}/fichiers/${modeleLieuId}/reglages`).set('X-CSRF-Token', agent.jeton).send(reglages).expect(200)
    expect(r.body.reglages3d).toEqual(reglages)
    // Valeurs hors limites refusées.
    expect((await agent.c.patch(`${API}/fichiers/${modeleLieuId}/reglages`).set('X-CSRF-Token', agent.jeton).send({ ...reglages, vitesse: 100 })).status).toBe(400)
    expect((await agent.c.patch(`${API}/fichiers/${modeleLieuId}/reglages`).set('X-CSRF-Token', agent.jeton).send({ ...reglages, ancrage: 'plafond' })).status).toBe(400)
    // Un partenaire ne règle pas le modèle d'un autre compte.
    expect((await partenaire.c.patch(`${API}/fichiers/${modeleLieuId}/reglages`).set('X-CSRF-Token', partenaire.jeton).send(reglages)).status).toBe(403)
    const pub = await request(app).get(`${API}/public/lieux`).expect(200)
    expect(pub.body.animations.find((a: { id: string }) => a.id === animLieuId).reglages3d).toEqual(reglages)
    // Une ancienne « échelle » envoyée est ignorée : la taille se règle au placement de l'animation.
    const sansEchelle = await agent.c.patch(`${API}/fichiers/${modeleLieuId}/reglages`).set('X-CSRF-Token', agent.jeton).send({ ...reglages, echelle: 8 }).expect(200)
    expect(sansEchelle.body.reglages3d).toEqual(reglages)
  })

  it('atelier 3D : optimise un modèle en conservant l’original, puis le restaure', async () => {
    // Modèle alourdi par des données inutilisées (1 Mo), avec deux animations.
    const glb = await importer(agent.c, agent.jeton, await genererGlb({ triangles: 200, clips: [{ nom: 'Entrée', dureeS: 2 }, { nom: 'Feu', dureeS: 3 }], octetsSupplementaires: 1_000_000 }), 'lourd.glb', 'LIEU')
    const id = glb.corps.id
    const avant = glb.corps as { url: string; tailleOctets: number }
    const r = await agent.c
      .post(`${API}/fichiers/${id}/optimiser`)
      .set('X-CSRF-Token', agent.jeton)
      .send({ textureMaxPx: 1024, webp: true, simplification: 0, compression: true })
      .expect(202)
    expect(r.body.optimisation.etat).toBe('EN_COURS')
    await attendreTraitements()
    const liste = await agent.c.get(`${API}/fichiers`).expect(200)
    const apres = liste.body.find((f: { id: string }) => f.id === id)
    expect(apres.optimisation.etat).toBe('TERMINEE')
    expect(apres.aOriginal).toBe(true)
    expect(apres.url).not.toBe(avant.url)
    expect(apres.tailleOctets).toBeLessThan(avant.tailleOctets / 10)
    expect(apres.optimisation.avant.octets).toBe(avant.tailleOctets)
    expect(apres.optimisation.apres.triangles).toBe(200)
    expect(apres.clips).toHaveLength(2)
    // Le fichier optimisé (compressé Meshopt) est servi et relisible.
    const servi = await request(app)
      .get(apres.url)
      .buffer(true)
      .parse((res, fin) => {
        const morceaux: Buffer[] = []
        res.on('data', (m: Buffer) => morceaux.push(m))
        res.on('end', () => fin(null, Buffer.concat(morceaux)))
      })
      .expect(200)
    expect((servi.body as Buffer).subarray(0, 4).toString()).toBe('glTF')
    // Paramètres invalides refusés ; un partenaire ne peut pas optimiser le modèle d'un autre compte.
    expect((await agent.c.post(`${API}/fichiers/${id}/optimiser`).set('X-CSRF-Token', agent.jeton).send({ textureMaxPx: 300, webp: true, simplification: 0, compression: true })).status).toBe(400)
    expect((await partenaire.c.post(`${API}/fichiers/${id}/optimiser`).set('X-CSRF-Token', partenaire.jeton).send({ textureMaxPx: null, webp: false, simplification: 0, compression: true })).status).toBe(403)
    // Restauration : retour au fichier importé, le fichier optimisé disparaît.
    const restaure = await agent.c.post(`${API}/fichiers/${id}/restaurer`).set('X-CSRF-Token', agent.jeton).expect(200)
    expect(restaure.body.url).toBe(avant.url)
    expect(restaure.body.aOriginal).toBe(false)
    expect(restaure.body.tailleOctets).toBe(avant.tailleOctets)
    expect((await request(app).get(apres.url)).status).toBe(404)
    expect((await agent.c.post(`${API}/fichiers/${id}/restaurer`).set('X-CSRF-Token', agent.jeton)).status).toBe(409)
  })

  it('enregistre le placement GPS en 3D d’une animation de lieu et le transmet au visiteur', async () => {
    const corps = { titre: 'Lumières du château', type: 'LIEU', lieuId, modeleId: modeleLieuId, declencheur: 'MONUMENT', dureeS: 60, debut: dateLocale(-1), transcription: { fr: 'Musique' }, publier: true }
    const placement = { latitude: 47.51012, longitude: 6.79835, hauteurM: 18.5, orientationDeg: 135, tailleM: 25 }
    const r = await agent.c.patch(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', agent.jeton).send({ ...corps, placement }).expect(200)
    expect(r.body.placement).toEqual(placement)
    const pub = await request(app).get(`${API}/public/lieux`).expect(200)
    expect(pub.body.animations.find((a: { id: string }) => a.id === animLieuId).placement).toEqual(placement)
    // Valeurs hors limites refusées (hauteur, orientation).
    expect((await agent.c.patch(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', agent.jeton).send({ ...corps, placement: { ...placement, hauteurM: 500 } })).status).toBe(400)
    expect((await agent.c.patch(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', agent.jeton).send({ ...corps, placement: { ...placement, orientationDeg: 360 } })).status).toBe(400)
    // Sans orientation : face au visiteur ; placement retiré : retour à la position du lieu.
    const sansOrientation = await agent.c.patch(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', agent.jeton).send({ ...corps, placement: { ...placement, orientationDeg: null } }).expect(200)
    expect(sansOrientation.body.placement.orientationDeg).toBeUndefined()
    const retire = await agent.c.patch(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', agent.jeton).send({ ...corps, placement: null }).expect(200)
    expect(retire.body.placement).toBeUndefined()
  })

  it('refuse une animation avec un modèle non validé ou un clip inexistant', async () => {
    const glb = await importer(partenaire.c, partenaire.jeton, await genererGlb({ clips: [{ nom: 'Saut', dureeS: 1 }] }), 'affiche.glb')
    const base = { titre: 'Promo', type: 'AFFICHE', modeleId: glb.corps.id, declencheur: 'AFFICHE', dureeS: 15, debut: dateLocale(-1), fin: dateLocale(30), transcription: { fr: 'Son' } }
    // Modèle encore « en cours » (non validé par l'éditeur) : 409.
    expect((await partenaire.c.post(`${API}/animations`).set('X-CSRF-Token', partenaire.jeton).send(base)).status).toBe(409)
    await partenaire.c.patch(`${API}/fichiers/${glb.corps.id}/valider`).set('X-CSRF-Token', partenaire.jeton).expect(200)
    expect((await partenaire.c.post(`${API}/animations`).set('X-CSRF-Token', partenaire.jeton).send({ ...base, clipIndice: 7 })).status).toBe(400)
    // Un partenaire ne peut pas créer d'animation de lieu.
    expect((await partenaire.c.post(`${API}/animations`).set('X-CSRF-Token', partenaire.jeton).send({ ...base, type: 'LIEU', lieuId, declencheur: 'MONUMENT' })).status).toBe(403)
    // Réglage par défaut de l'animation d'affiche : devant l'affiche, 1,5 fois sa hauteur.
    const anim = await partenaire.c.post(`${API}/animations`).set('X-CSRF-Token', partenaire.jeton).send({ ...base, clipIndice: 0, publier: true }).expect(201)
    animAfficheId = anim.body.id
    expect(anim.body.reglageAffiche).toEqual({ position: 'devant', taille: 1.5, decalage: { x: 0, y: 0, z: 0 } })
    // Déplacement autour de l'affiche, en mètres, dans le rayon de 3 m (BNF-05).
    const decalage = { x: -1.2, y: 0.45, z: 0.8 }
    const regle = await partenaire.c
      .patch(`${API}/animations/${animAfficheId}`)
      .set('X-CSRF-Token', partenaire.jeton)
      .send({ ...base, clipIndice: 0, publier: true, reglageAffiche: { position: 'dessus', taille: 2.5, decalage } })
      .expect(200)
    expect(regle.body.reglageAffiche).toEqual({ position: 'dessus', taille: 2.5, decalage })
    const refuse = (reglageAffiche: object) => partenaire.c.patch(`${API}/animations/${animAfficheId}`).set('X-CSRF-Token', partenaire.jeton).send({ ...base, reglageAffiche })
    expect((await refuse({ position: 'dessus', taille: 9 })).status).toBe(400)
    // Chaque axe tient dans 3 m, mais le modèle serait à 3,46 m de l'affiche.
    expect((await refuse({ position: 'devant', taille: 1.5, decalage: { x: 2, y: 2, z: 2 } })).status).toBe(400)
  })

  it('crée l’affiche avec un QR code unique généré par le serveur', async () => {
    const image = await importer(partenaire.c, partenaire.jeton, await genererPng(), 'promo.png')
    const r = await partenaire.c
      .post(`${API}/affiches`)
      .set('X-CSRF-Token', partenaire.jeton)
      .send({
        imageId: image.corps.id,
        animationAfficheId: animAfficheId,
        lieuId,
        animationLieuId: animLieuId,
        nom: 'Festival de test',
        texte: 'Venez https://lien-interdit.test voir <b>le spectacle</b>',
        format: 'A3',
        qr: { x: 0.7, y: 0.75, taille: 0.2, fond: true, mention: true },
        debut: dateLocale(-1),
        fin: dateLocale(20),
      })
      .expect(201)
    afficheId = r.body.id
    codeQr = r.body.codeQr
    expect(r.body.lieuId).toBe(lieuId)
    expect(codeQr).toMatch(/^[A-Za-z0-9_-]{22}$/)
    // Texte brut : balises et liens retirés (BNF-18).
    expect(r.body.texte).not.toMatch(/https?:|<b>/)
    expect(r.body.conditions).toEqual({ compteVerifie: true, fichiersConformes: true, charteAcceptee: true, zoneAttribuee: false })
  })

  it('accepte une affiche avec seulement un lieu promu, refuse un spectacle d’un autre lieu', async () => {
    const image = await importer(partenaire.c, partenaire.jeton, await genererPng(), 'sans-spectacle.png')
    const base = { imageId: image.corps.id, animationAfficheId: animAfficheId, lieuId, nom: 'Sans spectacle', texte: 'Texte', format: 'A4', qr: { x: 0.7, y: 0.7, taille: 0.2, fond: true, mention: true }, debut: dateLocale(-1), fin: dateLocale(5) }
    const autreLieu = await agent.c.post(`${API}/lieux`).set('X-CSRF-Token', agent.jeton).send({ nom: 'Autre lieu', nomCourt: 'Autre', categorie: { fr: 'Parc' }, adresse: 'Rue', description: { fr: 'Parc' }, latitude: 47.51, longitude: 6.8, rayonM: 50, accesLibre: true, actif: true }).expect(201)
    expect((await partenaire.c.post(`${API}/affiches`).set('X-CSRF-Token', partenaire.jeton).send({ ...base, lieuId: autreLieu.body.id, animationLieuId: animLieuId })).status).toBe(400)
    const r = await partenaire.c.post(`${API}/affiches`).set('X-CSRF-Token', partenaire.jeton).send(base).expect(201)
    expect(r.body.animationLieuId).toBeUndefined()
    // Un lieu promu par une affiche ne peut pas être supprimé.
    expect((await agent.c.delete(`${API}/lieux/${autreLieu.body.id}`).set('X-CSRF-Token', agent.jeton)).status).toBe(204)
    expect((await agent.c.delete(`${API}/lieux/${lieuId}`).set('X-CSRF-Token', agent.jeton)).status).toBe(409)
    await partenaire.c.delete(`${API}/affiches/${r.body.id}`).set('X-CSRF-Token', partenaire.jeton).expect(204)
  })

  it('bloque publication et PDF tant qu’aucune zone n’est attribuée (409)', async () => {
    const r = await partenaire.c.post(`${API}/affiches/${afficheId}/publier`).set('X-CSRF-Token', partenaire.jeton)
    expect(r.status).toBe(409)
    expect(r.body.details.zoneAttribuee).toBe(false)
    expect((await partenaire.c.get(`${API}/affiches/${afficheId}/pdf`)).status).toBe(409)
    expect((await request(app).get(`${API}/public/affiches/${codeQr}`)).status).toBe(410)
  })

  it('zone proposée par le partenaire puis attribuée par la mairie ; publication et PDF', async () => {
    const z = await agent.c.post(`${API}/zones`).set('X-CSRF-Token', agent.jeton).send({ nom: 'Place Saint-Martin', adresse: 'Place Saint-Martin', format: 'A2', regles: 'Panneau', active: true }).expect(201)
    zoneId = z.body.id
    await partenaire.c.post(`${API}/affiches/${afficheId}/zone-proposee`).set('X-CSRF-Token', partenaire.jeton).send({ zoneId }).expect(200)
    expect((await partenaire.c.put(`${API}/affiches/${afficheId}/zone`).set('X-CSRF-Token', partenaire.jeton).send({ zoneId })).status).toBe(403)
    const attribuee = await agent.c.put(`${API}/affiches/${afficheId}/zone`).set('X-CSRF-Token', agent.jeton).send({ zoneId }).expect(200)
    expect(attribuee.body.zoneId).toBe(zoneId)
    const pub = await partenaire.c.post(`${API}/affiches/${afficheId}/publier`).set('X-CSRF-Token', partenaire.jeton).expect(200)
    expect(pub.body.statut).toBe('PUBLIEE')
    const pdf = await partenaire.c.get(`${API}/affiches/${afficheId}/pdf`).buffer(true).parse((res, fin) => {
      const morceaux: Buffer[] = []
      res.on('data', (m: Buffer) => morceaux.push(m))
      res.on('end', () => fin(null, Buffer.concat(morceaux)))
    })
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('QR code du PDF : adresse réseau du PC transmise par Vite en développement, domaine sinon', () => {
    expect(origineQr('https://10.14.28.115:5173')).toBe('https://10.14.28.115:5173')
    expect(origineQr(['https://192.168.1.20:5174'])).toBe('https://192.168.1.20:5174')
    // Valeur qui n'est pas une simple origine (chemin, autre schéma) : domaine officiel.
    expect(origineQr('https://pirate.example/a/x')).toBe('https://experiences.montbeliard.fr')
    expect(origineQr('javascript:alert(1)')).toBe('https://experiences.montbeliard.fr')
    expect(origineQr(undefined)).toBe('https://experiences.montbeliard.fr')
  })

  it('le visiteur ouvre l’affiche par son QR code et les statistiques sont comptées', async () => {
    const r = await request(app).get(`${API}/public/affiches/${codeQr}`).expect(200)
    expect(r.body.animationAffiche.id).toBe(animAfficheId)
    expect(r.body.lieu.id).toBe(lieuId)
    expect(r.body.proprietaire).toMatch(/^Structure/)
    // Cible 8th Wall générée à partir du visuel (800 × 1131) : recadrage 3:4 centré, luminance 480 × 640.
    expect(r.body.cible).toMatchObject({ type: 'PLANAR', properties: { left: 0, top: 32, width: 800, height: 1067, isRotated: false, originalWidth: 800, originalHeight: 1131 } })
    const luminance = await request(app).get(r.body.cible.imagePath).buffer(true).expect(200)
    expect(luminance.headers['content-type']).toBe('image/jpeg')
    expect(await sharp(luminance.body as Buffer).metadata()).toMatchObject({ width: 480, height: 640, channels: 1 })
    expect((await request(app).get(`${API}/public/affiches/inconnu-0000000000000`)).status).toBe(404)
    await request(app).post(`${API}/public/statistiques`).send({ type: 'SCAN', afficheId }).expect(204)
    await request(app).post(`${API}/public/statistiques`).send({ type: 'LANCEMENT', animationId: animAfficheId, declencheur: 'AFFICHE' }).expect(204)
    const stats = await partenaire.c.get(`${API}/statistiques?jours=7`).expect(200)
    expect(stats.body.serie).toHaveLength(7)
    expect(stats.body.parAffiche.find((a: { libelle: string }) => a.libelle === 'Festival de test').valeur).toBe(1)
    expect(stats.body.parDeclencheur.find((d: { libelle: string }) => d.libelle === 'AFFICHE').valeur).toBe(1)
  })

  it('signalement anonyme, suspension par un agent, réexamen et levée de la mesure', async () => {
    expect((await request(app).post(`${API}/public/signalements`).send({ afficheId, motif: 'AUTRE', commentaire: '', altcha: ALTCHA_TEST })).status).toBe(400)
    const s = await request(app).post(`${API}/public/signalements`).send({ afficheId, motif: 'TROMPEUR', commentaire: 'Horaires faux', altcha: ALTCHA_TEST }).expect(201)
    const vusPartenaire = await partenaire.c.get(`${API}/signalements`).expect(200)
    expect(vusPartenaire.body.map((x: { id: string }) => x.id)).toContain(s.body.id)
    const journal = await agent.c.get(`${API}/admin/journal`).expect(200)
    expect(journal.body[0]).toMatchObject({ action: 'SIGNALEMENT', auteur: 'Visiteur anonyme' })

    await agent.c.post(`${API}/admin/contenus/affiche/${afficheId}/decision`).set('X-CSRF-Token', agent.jeton).send({ action: 'SUSPENDRE', motif: 'Informations trompeuses', signalementIds: [s.body.id] }).expect(201)
    const retiree = await request(app).get(`${API}/public/affiches/${codeQr}`)
    expect(retiree.status).toBe(410)
    expect(retiree.body.details.raison).toBe('RETIREE')
    // Le partenaire ne peut plus modifier un contenu suspendu.
    expect((await partenaire.c.post(`${API}/affiches/${afficheId}/publier`).set('X-CSRF-Token', partenaire.jeton)).status).toBe(409)

    const decisions = await partenaire.c.get(`${API}/decisions`).expect(200)
    const d = decisions.body.find((x: { contenuId: string; action: string }) => x.contenuId === afficheId && x.action === 'SUSPENDRE')
    await partenaire.c.post(`${API}/decisions/${d.id}/reponse`).set('X-CSRF-Token', partenaire.jeton).send({ reponse: 'Horaires corrigés', reexamen: true }).expect(204)
    await agent.c.post(`${API}/admin/decisions/${d.id}/cloture`).set('X-CSRF-Token', agent.jeton).send({ conclusion: 'Correction constatée', lever: true }).expect(204)
    expect((await request(app).get(`${API}/public/affiches/${codeQr}`)).status).toBe(200)
  })

  it('limite les signalements à 5 par heure (429)', async () => {
    const statuts: number[] = []
    for (let i = 0; i < 6; i++) {
      const r = await request(app).post(`${API}/public/signalements`).set('x-test-limite', '1').send({ animationId: animLieuId, motif: 'CHOQUANT', commentaire: '', altcha: ALTCHA_TEST })
      statuts.push(r.status)
    }
    expect(statuts.slice(0, 5).every((s) => s === 201)).toBe(true)
    expect(statuts[5]).toBe(429)
  })

  it('met à jour le score affiché dans l’animation du lieu', async () => {
    await agent.c
      .put(`${API}/lieux/${lieuId}/score`)
      .set('X-CSRF-Token', agent.jeton)
      .send({ equipeDomicile: 'FCSM', equipeExterieur: 'OL', scoreDomicile: 2, scoreExterieur: 1, competition: 'Ligue 1', minute: 'En cours' })
      .expect(200)
    const pub = await request(app).get(`${API}/public/lieux`).expect(200)
    expect(pub.body.lieux.find((l: { id: string }) => l.id === lieuId)).toMatchObject({ scoreDomicile: 2, scoreExterieur: 1, equipeDomicile: 'FCSM' })
  })

  it('protège les suppressions des contenus encore utilisés (409), puis supprime', async () => {
    expect((await partenaire.c.delete(`${API}/animations/${animAfficheId}`).set('X-CSRF-Token', partenaire.jeton)).status).toBe(409)
    expect((await agent.c.delete(`${API}/lieux/${lieuId}`).set('X-CSRF-Token', agent.jeton)).status).toBe(409)
    expect((await agent.c.delete(`${API}/fichiers/${modeleLieuId}`).set('X-CSRF-Token', agent.jeton)).status).toBe(409)
    // Un partenaire ne supprime pas le contenu d'un autre compte.
    expect((await partenaire.c.delete(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', partenaire.jeton)).status).toBe(403)

    await partenaire.c.delete(`${API}/affiches/${afficheId}`).set('X-CSRF-Token', partenaire.jeton).expect(204)
    expect((await request(app).get(`${API}/public/affiches/${codeQr}`)).status).toBe(404)
    await partenaire.c.delete(`${API}/animations/${animAfficheId}`).set('X-CSRF-Token', partenaire.jeton).expect(204)
    await agent.c.delete(`${API}/animations/${animLieuId}`).set('X-CSRF-Token', agent.jeton).expect(204)
    await agent.c.delete(`${API}/lieux/${lieuId}`).set('X-CSRF-Token', agent.jeton).expect(204)
    await agent.c.delete(`${API}/fichiers/${modeleLieuId}`).set('X-CSRF-Token', agent.jeton).expect(204)
  })
})
