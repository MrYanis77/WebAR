// Fichiers d'affiche importés par les éditeurs. Ils sont gardés dans IndexedDB (trop lourds pour
// localStorage) ; en production ils iront dans le dossier uploads/ via POST /fichiers.
import { useEffect, useSyncExternalStore } from 'react'

const BASE = 'montbeliard-affiches'
const TABLE = 'images'

const urls = new Map<string, string | null>()
const abonnes = new Set<() => void>()
const notifier = () => abonnes.forEach((f) => f())

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(TABLE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir()
  return new Promise((ok, ko) => {
    const req = action(db.transaction(TABLE, mode).objectStore(TABLE))
    req.onsuccess = () => ok(req.result)
    req.onerror = () => ko(req.error)
  })
}

export async function enregistrerImageAffiche(id: string, fichier: Blob) {
  await transaction('readwrite', (s) => s.put(fichier, id))
  const ancienne = urls.get(id)
  if (ancienne) URL.revokeObjectURL(ancienne)
  urls.set(id, URL.createObjectURL(fichier))
  notifier()
}

export async function lireImageAffiche(id: string): Promise<Blob | undefined> {
  try {
    return (await transaction('readonly', (s) => s.get(id))) as Blob | undefined
  } catch {
    return undefined
  }
}

// Fichiers 3D et sons importés (clé « fichier:<id> »), pour l'aperçu de l'animation.
export async function enregistrerFichierBinaire(id: string, fichier: Blob) {
  await transaction('readwrite', (s) => s.put(fichier, `fichier:${id}`))
}

export function lireFichierBinaire(id: string): Promise<Blob | undefined> {
  return lireImageAffiche(`fichier:${id}`)
}

function charger(id: string) {
  if (urls.has(id)) return
  urls.set(id, null)
  void lireImageAffiche(id).then((b) => {
    if (b) {
      urls.set(id, URL.createObjectURL(b))
      notifier()
    }
  })
}

/** URL locale de l'image d'une affiche, ou undefined si aucun fichier n'a été importé. */
export function useImageAffiche(id: string | undefined): string | undefined {
  useEffect(() => {
    if (id) charger(id)
  }, [id])
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => (id ? (urls.get(id) ?? undefined) : undefined),
  )
}

export async function supprimerImageAffiche(id: string) {
  try {
    await transaction('readwrite', (s) => s.delete(id))
  } catch {
    /* ignoré */
  }
  const url = urls.get(id)
  if (url) URL.revokeObjectURL(url)
  urls.delete(id)
  notifier()
}
