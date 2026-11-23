// Préparation globale des tests : recrée la base « webar_test » avec le script SQL du projet
// et vide le dossier des fichiers importés pendant les tests.
import mariadb from 'mariadb'
import { readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const URL_TEST = process.env.DATABASE_URL_TEST ?? 'mysql://root@127.0.0.1:3306/webar_test'

export default async function preparer() {
  const url = new URL(URL_TEST)
  const base = url.pathname.slice(1)
  if (!/test/.test(base)) throw new Error(`Refus : la base de test doit contenir « test » dans son nom (${base}).`)
  const connexion = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    multipleStatements: true,
  })
  try {
    await connexion.query(`DROP DATABASE IF EXISTS \`${base}\``)
    await connexion.query(`CREATE DATABASE \`${base}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connexion.query(`USE \`${base}\``)
    // Le script SQL recrée lui-même la base « webar » (DROP / CREATE / USE) : ces lignes sont retirées,
    // sinon il effacerait la vraie base au lieu de remplir la base de test.
    const script = (await readFile(resolve('database/montbeliard_webar.sql'), 'utf8')).replace(/^\s*(DROP DATABASE|CREATE DATABASE|USE)\b[^;]*;/gim, '')
    if (/(DROP|CREATE)\s+DATABASE|^\s*USE\s/im.test(script)) throw new Error('Refus : le script SQL change encore de base ; il ne doit remplir que la base de test.')
    await connexion.query(script)
  } finally {
    await connexion.end()
  }
  await rm(resolve('uploads-test'), { recursive: true, force: true })
  return async () => {
    await rm(resolve('uploads-test'), { recursive: true, force: true })
  }
}
