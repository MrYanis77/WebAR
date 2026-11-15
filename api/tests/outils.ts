// Outils des tests de l'API : application Express en mémoire, comptes de test, connexion avec
// code reçu par mail (double authentification), jeton anti-CSRF et fichiers générés à la volée (GLB avec animations, MP3, PNG).
import { Document, NodeIO } from '@gltf-transform/core'
import argon2 from 'argon2'
import sharp from 'sharp'
import request from 'supertest'
import { creerApplication } from '../src/app.js'
import { prisma } from '../src/db.js'
import { attendreTraitements } from '../src/services/file.js'
import { mailsDeTest } from '../src/services/notifications.js'

export const app = creerApplication()
export type Client = ReturnType<typeof request.agent>
export const MOT_DE_PASSE = 'MotDePasse-Test-2026'
/** Preuve ALTCHA acceptée uniquement quand NODE_ENV=test (aucun navigateur pour calculer la preuve). */
export const ALTCHA_TEST = 'altcha-test-valide'

let compteur = 0
const unique = (prefixe: string) => `${prefixe}-${Date.now()}-${++compteur}`

/** Compte agent vérifié (comme le crée « npm run creer-agent »). */
export async function creerAgent() {
  const email = `${unique('agent')}@montbeliard.fr`
  const c = await prisma.compte.create({
    data: {
      email,
      nom_affiche: 'Agent de test',
      role: 'AGENT',
      statut: 'VERIFIE',
      mot_de_passe_hash: await argon2.hash(MOT_DE_PASSE, { type: argon2.argon2id }),
    },
  })
  return { id: c.id, email }
}

/** Client connecté (cookies conservés) avec son jeton anti-CSRF. */
export async function client() {
  const agent = request.agent(app)
  return agent
}

export async function jetonCsrf(c: Client): Promise<string> {
  const r = await c.get('/api/v1/auth/csrf').expect(200)
  return r.body.jeton
}

/** Dernier code de connexion envoyé par mail à cette adresse (transport de test de Nodemailer). */
export function dernierCode(email: string) {
  const mail = [...mailsDeTest].reverse().find((m) => m.destinataire === email && m.sujet.startsWith('Code de connexion'))
  const code = mail?.texte.match(/\b(\d{6})\b/)?.[1]
  if (!code) throw new Error(`Aucun code envoyé à ${email}`)
  return code
}

/** Connexion d'un agent : mot de passe puis code reçu par mail (double authentification). */
export async function connecterAgent() {
  const a = await creerAgent()
  const c = await client()
  const r1 = await c.post('/api/v1/auth/connexion').send({ email: a.email, motDePasse: MOT_DE_PASSE }).expect(200)
  if (r1.body.etape !== 'CODE') throw new Error('Étape « code par mail » attendue')
  await c.post('/api/v1/auth/code').send({ code: dernierCode(a.email) }).expect(200)
  return { c, jeton: await jetonCsrf(c), compte: a }
}

/** Inscription d'un partenaire puis vérification par un agent ; charte acceptée si demandé. */
export async function connecterPartenaire(agent: { c: Client; jeton: string }, options: { charte?: boolean } = {}) {
  const email = `${unique('partenaire')}@exemple.test`
  await request(app)
    .post('/api/v1/auth/inscription')
    .send({
      nomStructure: `Structure ${compteur}`,
      secteur: 'Culture & patrimoine',
      adresse: '1 rue du Test, Montbéliard',
      contactNom: 'Contact Test',
      email,
      motDePasse: MOT_DE_PASSE,
      rgpd: true,
      altcha: ALTCHA_TEST,
    })
    .expect(201)
  const p = await prisma.partenaire.findFirstOrThrow({ where: { compte: { email } } })
  await agent.c.patch(`/api/v1/admin/comptes/${p.id}`).set('X-CSRF-Token', agent.jeton).send({ statut: 'VERIFIE' }).expect(200)
  const c = await client()
  const r = await c.post('/api/v1/auth/connexion').send({ email, motDePasse: MOT_DE_PASSE }).expect(200)
  if (r.body.etape !== 'CONNECTE') throw new Error('Connexion partenaire attendue')
  const jeton = await jetonCsrf(c)
  if (options.charte !== false) await c.post('/api/v1/charte/acceptation').set('X-CSRF-Token', jeton).expect(200)
  return { c, jeton, email, partenaireId: String(p.id), compteId: p.compte_id }
}

// ---------------------------------------------------------------- fichiers générés

/**
 * Modèle GLB valide : `triangles` triangles, une animation par clip (translation du nœud),
 * et éventuellement des données binaires supplémentaires pour atteindre une taille donnée.
 */
export async function genererGlb(options: { triangles?: number; clips?: { nom: string; dureeS: number }[]; octetsSupplementaires?: number } = {}) {
  const { triangles = 12, clips = [], octetsSupplementaires = 0 } = options
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = new Float32Array(triangles * 9)
  for (let i = 0; i < triangles; i++) positions.set([i * 0.01, 0, 0, i * 0.01 + 0.01, 0, 0, i * 0.01, 0.01, 0], i * 9)
  const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
  const noeud = doc.createNode('modele').setMesh(doc.createMesh('maillage').addPrimitive(prim))
  doc.createScene('scene').addChild(noeud)
  for (const clip of clips) {
    // Un clip de durée nulle n'a qu'une image clé (les instants doivent être strictement croissants).
    const instantane = clip.dureeS === 0
    const temps = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(instantane ? [0] : [0, clip.dureeS])).setBuffer(buffer)
    const valeurs = doc.createAccessor().setType('VEC3').setArray(new Float32Array(instantane ? [0, 0, 0] : [0, 0, 0, 0, 1, 0])).setBuffer(buffer)
    const echantillon = doc.createAnimationSampler().setInput(temps).setOutput(valeurs).setInterpolation('LINEAR')
    const canal = doc.createAnimationChannel().setTargetNode(noeud).setTargetPath('translation').setSampler(echantillon)
    doc.createAnimation(clip.nom).addSampler(echantillon).addChannel(canal)
  }
  if (octetsSupplementaires > 0) {
    // Données de remplissage (accesseur non utilisé) : simule un modèle lourd sans le dessiner.
    doc.createAccessor('remplissage').setType('SCALAR').setArray(new Float32Array(Math.ceil(octetsSupplementaires / 4))).setBuffer(buffer)
  }
  return Buffer.from(await new NodeIO().writeBinary(doc))
}

/** MP3 MPEG-1 Layer III de `secondes` secondes (trames silencieuses à 128 kbit/s, 44,1 kHz). */
export function genererMp3(secondes = 2) {
  const trame = Buffer.alloc(417)
  trame.set([0xff, 0xfb, 0x90, 0x64])
  const nb = Math.ceil((secondes * 44100) / 1152)
  return Buffer.concat(Array.from({ length: nb }, () => trame))
}

/** Image PNG unie (affiche ou visuel de lieu). */
export function genererPng(largeur = 800, hauteur = 1131) {
  return sharp({ create: { width: largeur, height: hauteur, channels: 3, background: { r: 123, g: 30, b: 46 } } })
    .png()
    .toBuffer()
}

/** Import d'un fichier puis attente de la fin du contrôle automatique (file de traitements). */
export async function importer(c: Client, jeton: string, contenu: Buffer, nom: string, usage: 'AFFICHE' | 'LIEU' = 'AFFICHE') {
  const r = await c.post('/api/v1/fichiers').set('X-CSRF-Token', jeton).field('usage', usage).attach('fichier', contenu, nom)
  if (r.status !== 201) return { statut: r.status, corps: r.body }
  await attendreTraitements()
  const liste = await c.get('/api/v1/fichiers').expect(200)
  return { statut: r.status, corps: liste.body.find((f: { id: string }) => f.id === r.body.id) }
}

/** Date locale « AAAA-MM-JJTHH:mm:ss » décalée de `jours`. */
export function dateLocale(jours = 0) {
  const d = new Date(Date.now() + jours * 86_400_000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
}
