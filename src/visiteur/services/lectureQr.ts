// Lecture des QR codes des affiches par la caméra du téléphone, dans le navigateur : rien n'est envoyé.
// Le lecteur intégré au navigateur (API BarcodeDetector : Chrome et Edge sur Android, Samsung Internet…)
// est utilisé quand il existe. Sans lui (Safari sur iPhone, Firefox), la caméra reste ouverte et le
// visiteur est invité à scanner avec l'appareil photo du téléphone ou à choisir l'affiche dans la liste.

interface CodeDetecte {
  rawValue: string
}

export interface LecteurQr {
  detect(source: CanvasImageSource): Promise<CodeDetecte[]>
}

type ConstructeurDetecteur = (new (options: { formats: string[] }) => LecteurQr) & { getSupportedFormats?: () => Promise<string[]> }

/** Lecteur de QR code du navigateur, ou null s'il n'en a pas. */
export async function creerLecteurQr(): Promise<LecteurQr | null> {
  const Detecteur = (window as unknown as { BarcodeDetector?: ConstructeurDetecteur }).BarcodeDetector
  if (!Detecteur) return null
  try {
    const formats = (await Detecteur.getSupportedFormats?.()) ?? ['qr_code']
    if (!formats.includes('qr_code')) return null
    return new Detecteur({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * Code d'affiche contenu dans un QR code de l'application (« https://…/a/<code> »), sinon null. L'adresse
 * peut être celle du site public ou celle d'un test : seul le chemin compte, et l'affiche s'ouvre toujours
 * dans cette application (un QR code étranger n'ouvre jamais de site externe).
 */
export function codeAfficheDepuisQr(valeur: string): string | null {
  try {
    const u = new URL(valeur.trim(), window.location.origin)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const m = /^\/a\/([A-Za-z0-9_-]{6,40})\/?$/.exec(u.pathname)
    return m ? m[1] : null
  } catch {
    return null
  }
}
