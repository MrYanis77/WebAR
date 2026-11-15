import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'node:os'
import { defineConfig } from 'vite'

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

// En développement, Vite sert l'application React et relaie l'API Express (port 3000)
// et les fichiers importés : le navigateur ne voit qu'une seule origine (cookies SameSite=Strict).
// Mode « mobile » (npm run dev:mobile) : HTTPS avec un certificat auto-signé et écoute sur le réseau
// local, car un téléphone n'autorise la caméra que sur une page HTTPS.
export default defineConfig(({ mode, command }) => {
  const mobile = mode === 'mobile'
  const ip = command === 'serve' ? adresseReseau() : undefined
  return {
    plugins: [react(), ...(mobile ? [basicSsl()] : [])],
    define: {
      // URL que le téléphone doit ouvrir quand le site est consulté sur le PC via « localhost ».
      __URL_RESEAU__: JSON.stringify(mobile && ip ? `https://${ip}:5173` : ''),
    },
    server: {
      host: mobile ? true : undefined,
      proxy: {
        '/api': 'http://localhost:3000',
        '/uploads': 'http://localhost:3000',
      },
    },
  }
})
