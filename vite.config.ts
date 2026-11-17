import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { cpSync, createReadStream, existsSync, mkdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Cartes réseau virtuelles (VPN, machines virtuelles, WSL…) : jamais utilisées pour le QR code. */
const CARTE_VIRTUELLE = /vethernet|virtual|vmware|vbox|wsl|hyper-v|docker|bluetooth|loopback|tailscale|zerotier|vpn|tap|tun/i
/** Cartes physiques usuelles : Wi-Fi et Ethernet. */
const CARTE_PHYSIQUE = /wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d/i
const privee = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)

/**
 * Adresse IPv4 actuelle du PC sur le réseau local, pour que le QR code affiché à l'écran ouvre
 * l'application sur un téléphone connecté au même réseau : carte Wi-Fi ou Ethernet d'abord, adresse
 * privée, jamais une carte virtuelle. Relue à chaque demande (le PC peut changer de réseau).
 */
function adresseReseau(): string | undefined {
  const cartes = Object.entries(networkInterfaces()).flatMap(([nom, adresses]) =>
    (adresses ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ nom, ip: a.address })),
  )
  const reelles = cartes.filter((c) => !CARTE_VIRTUELLE.test(c.nom))
  return (
    reelles.find((c) => CARTE_PHYSIQUE.test(c.nom) && privee(c.ip)) ??
    reelles.find((c) => privee(c.ip)) ??
    reelles[0] ??
    cartes[0]
  )?.ip
}

/**
 * Point d'accès de développement /__url-reseau : adresse que le téléphone doit ouvrir (QR codes du
 * back-office ouvert sur « localhost »). URL_RESEAU dans .env la force ; sinon IP actuelle du PC et vrai
 * port du serveur (Vite prend le port suivant si 5173 est occupé). Uniquement en HTTPS (npm run
 * dev:mobile) : un téléphone n'autorise la caméra que sur une page HTTPS.
 */
/** Adresse réseau actuelle que le téléphone doit ouvrir (renseignée par le plugin, lue par le proxy). */
let lireUrlReseau: () => { url: string | null; ip?: string; port?: number; https: boolean } = () => ({ url: null, https: false })

function urlReseauDeveloppement(forcee: string | undefined): Plugin {
  return {
    name: 'url-reseau-developpement',
    configureServer(serveur) {
      lireUrlReseau = () => {
        const adresse = serveur.httpServer?.address()
        const port = adresse && typeof adresse === 'object' ? adresse.port : serveur.config.server.port
        const https = !!serveur.config.server.https
        const ip = adresseReseau()
        return { url: forcee?.replace(/\/$/, '') || (https && ip ? `https://${ip}:${port}` : null), ip, port, https }
      }
      serveur.middlewares.use('/__url-reseau', (_req, res) => {
        const { url, ip, port, https } = lireUrlReseau()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ url, ip, port, https }))
      })
    },
  }
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
  // pdf.js (import d'une affiche en PDF dans le back-office) : polices standard, tables de caractères,
  // décodeurs d'images (JPEG 2000, JBIG2) et profils de couleur (PDF d'impression en CMJN).
  { route: '/pdfjs/cmaps/', dossier: 'node_modules/pdfjs-dist/cmaps', fichiers: '*' },
  { route: '/pdfjs/standard_fonts/', dossier: 'node_modules/pdfjs-dist/standard_fonts', fichiers: '*' },
  { route: '/pdfjs/wasm/', dossier: 'node_modules/pdfjs-dist/wasm', fichiers: '*' },
  { route: '/pdfjs/iccs/', dossier: 'node_modules/pdfjs-dist/iccs', fichiers: '*' },
] as { route: string; dossier: string; fichiers: string[] | '*' }[]
const TYPES_MIME: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile' }

/** Fichier autorisé d'un groupe : listé, ou n'importe quel fichier du dossier (sans remonter au-dessus). */
function autorise(groupe: { dossier: string; fichiers: string[] | '*' }, relatif: string) {
  if (groupe.fichiers !== '*') return groupe.fichiers.includes(relatif)
  return !relatif.split('/').includes('..') && existsSync(path.resolve(groupe.dossier, relatif))
}

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
        if (!groupe || !relatif || !autorise(groupe, relatif)) return suite()
        res.setHeader('Content-Type', TYPES_MIME[path.extname(relatif)] ?? 'text/plain; charset=utf-8')
        createReadStream(path.resolve(racine, groupe.dossier, relatif)).pipe(res)
      })
    },
    closeBundle() {
      if (!compilation) return
      for (const groupe of FICHIERS_RA) {
        if (groupe.fichiers === '*') {
          cpSync(path.resolve(racine, groupe.dossier), path.join(sortie, groupe.route), { recursive: true })
          continue
        }
        for (const fichier of groupe.fichiers) {
          const destination = path.join(sortie, groupe.route, fichier)
          mkdirSync(path.dirname(destination), { recursive: true })
          cpSync(path.resolve(racine, groupe.dossier, fichier), destination)
        }
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
  // URL_RESEAU (.env) : adresse à encoder dans les QR codes, si la détection automatique se trompe.
  const urlForcee = loadEnv(mode, process.cwd(), '').URL_RESEAU
  return {
    plugins: [react(), fichiersRealiteAugmentee(), urlReseauDeveloppement(urlForcee), ...(mobile ? [basicSsl()] : [])],
    define: {
      // URL que le téléphone doit ouvrir quand le site est consulté sur le PC via « localhost ».
      // Valeur de départ ; le back-office relit l'adresse actuelle sur /__url-reseau.
      __URL_RESEAU__: JSON.stringify(urlForcee || (mobile && ip ? `https://${ip}:5173` : '')),
    },
    server: {
      host: mobile ? true : undefined,
      // Tunnel HTTPS Cloudflare (npx cloudflared tunnel --url http://localhost:5173) : adresse publique
      // avec un vrai certificat, pour tester sur téléphone sans l'avertissement du certificat auto-signé.
      allowedHosts: ['.trycloudflare.com'],
      proxy: {
        // En-tête X-Url-Reseau : adresse réseau actuelle du PC, utilisée par l'API (en développement
        // seulement) pour le QR code des PDF à imprimer.
        '/api': {
          target: 'http://localhost:3000',
          configure: (proxy) =>
            proxy.on('proxyReq', (requete) => {
              const { url } = lireUrlReseau()
              if (url) requete.setHeader('X-Url-Reseau', url)
            }),
        },
        '/uploads': 'http://localhost:3000',
      },
    },
  }
})
