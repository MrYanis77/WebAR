import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { cpSync, createReadStream, mkdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Adresse IPv4 du PC sur le réseau local (Wi-Fi ou Ethernet), pour que le QR code affiché à l'écran
 * ouvre l'application sur un téléphone connecté au même réseau. Les réseaux privés courants
 * (192.168.x.x, puis 10.x.x.x) sont préférés aux adaptateurs virtuels.
 */
function adresseReseau(): string | undefined {
  const adresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address)
  return adresses.find((a) => a.startsWith('192.168.')) ?? adresses.find((a) => a.startsWith('10.')) ?? adresses[0]
}

/**
 * Fichiers de la réalité augmentée servis tels quels, hors du code compilé, et chargés seulement à
 * l'ouverture de la caméra :
 *  - moteur 8th Wall (binaire distribué @8thwall/engine-binary, licence Niantic Spatial) : xr.js charge
 *    lui-même xr-slam.js (reconnaissance d'image + SLAM) et ses workers depuis son propre dossier ;
 *  - décodeurs Draco et KTX2 de three.js, pour les modèles GLB compressés.
 * Le module de visage (xr-face.js) et la segmentation du ciel ne servent pas : ils ne sont pas copiés.
 */
const FICHIERS_RA = [
  { route: '/xr8/', dossier: 'node_modules/@8thwall/engine-binary/dist', fichiers: ['xr.js', 'xr-slam.js', 'LICENSE', 'resources/media-worker.js', 'resources/powered-by.svg'] },
  { route: '/draco/', dossier: 'node_modules/three/examples/jsm/libs/draco/gltf', fichiers: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'] },
  { route: '/basis/', dossier: 'node_modules/three/examples/jsm/libs/basis', fichiers: ['basis_transcoder.js', 'basis_transcoder.wasm'] },
]
const TYPES_MIME: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' }

/** Sert FICHIERS_RA en développement et les copie dans dist/ à la compilation. */
function fichiersRealiteAugmentee(): Plugin {
  let racine = process.cwd()
  let sortie = 'dist'
  let compilation = false
  return {
    name: 'fichiers-realite-augmentee',
    configResolved(c) {
      racine = c.root
      sortie = path.resolve(c.root, c.build.outDir)
      compilation = c.command === 'build'
    },
    configureServer(serveur) {
      serveur.middlewares.use((req, res, suite) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0])
        const groupe = FICHIERS_RA.find((g) => url.startsWith(g.route))
        const relatif = groupe && url.slice(groupe.route.length)
        if (!groupe || !relatif || !groupe.fichiers.includes(relatif)) return suite()
        res.setHeader('Content-Type', TYPES_MIME[path.extname(relatif)] ?? 'text/plain; charset=utf-8')
        createReadStream(path.resolve(racine, groupe.dossier, relatif)).pipe(res)
      })
    },
    closeBundle() {
      if (!compilation) return
      for (const groupe of FICHIERS_RA)
        for (const fichier of groupe.fichiers) {
          const destination = path.join(sortie, groupe.route, fichier)
          mkdirSync(path.dirname(destination), { recursive: true })
          cpSync(path.resolve(racine, groupe.dossier, fichier), destination)
        }
    },
  }
}

// En développement, Vite sert l'application React et relaie l'API Express (port 3000)
// et les fichiers importés : le navigateur ne voit qu'une seule origine (cookies SameSite=Strict).
// Mode « mobile » (npm run dev:mobile) : HTTPS avec un certificat auto-signé et écoute sur le réseau
// local, car un téléphone n'autorise la caméra que sur une page HTTPS.
export default defineConfig(({ mode, command }) => {
  const mobile = mode === 'mobile'
  const ip = command === 'serve' ? adresseReseau() : undefined
  return {
    plugins: [react(), fichiersRealiteAugmentee(), ...(mobile ? [basicSsl()] : [])],
    define: {
      // URL que le téléphone doit ouvrir quand le site est consulté sur le PC via « localhost ».
      __URL_RESEAU__: JSON.stringify(mobile && ip ? `https://${ip}:5173` : ''),
    },
    server: {
      host: mobile ? true : undefined,
      // Tunnel HTTPS Cloudflare (npx cloudflared tunnel --url http://localhost:5173) : adresse publique
      // avec un vrai certificat, pour tester sur téléphone sans l'avertissement du certificat auto-signé.
      allowedHosts: ['.trycloudflare.com'],
      proxy: {
        '/api': 'http://localhost:3000',
        '/uploads': 'http://localhost:3000',
      },
    },
  }
})
