// Tests automatisés de l'API (Vitest + Supertest). Ils tournent sur une base dédiée « webar_test »
// recréée à chaque lancement à partir de database/montbeliard_webar.sql : la base « webar » n'est
// jamais modifiée. Prérequis : MariaDB (XAMPP) démarré sur 127.0.0.1:3306.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['api/tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['api/tests/preparation.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? 'mysql://root@127.0.0.1:3306/webar_test',
      DOSSIER_UPLOADS: 'uploads-test',
      // Les tests couvrent la double authentification, même désactivée dans .env.
      DOUBLE_AUTHENTIFICATION: 'true',
    },
    // Une seule base partagée : les fichiers de test s'exécutent l'un après l'autre.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
