/// <reference types="vite/client" />

/** URL du site sur le réseau local en mode « mobile » (injectée par vite.config.ts), sinon vide. */
declare const __URL_RESEAU__: string

interface ImportMetaEnv {
  /** Adresse publique imposée pour les QR codes (ex. tunnel HTTPS) ; prioritaire si renseignée. */
  readonly VITE_URL_PUBLIQUE?: string
}
