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
    await connexion.query(await readFile(resolve('database/montbeliard_webar.sql'), 'utf8'))
  } finally {
    await connexion.end()
  }
  await rm(resolve('uploads-test'), { recursive: true, force: true })
  return async () => {
    await rm(resolve('uploads-test'), { recursive: true, force: true })
  }
}
