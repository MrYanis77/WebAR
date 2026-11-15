// Accès à la base MySQL/MariaDB par Prisma 7 (adaptateur MariaDB, compatible MySQL).
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.js'
import { config } from './config.js'

/** Options de connexion déduites de DATABASE_URL (mysql://utilisateur:mdp@hote:port/base). */
export function optionsConnexion(url = config.urlBase) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  }
}

const adaptateur = new PrismaMariaDb({ ...optionsConnexion(), connectionLimit: 10 })

export const prisma = new PrismaClient({ adapter: adaptateur })
