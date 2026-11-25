// Données de l'application visiteur, lues sans compte ni cookie sur l'API publique (/api/v1/public).
// Les réponses sont mises en cache 60 s au plus : un contenu suspendu disparaît en moins de 5 minutes (CR-11).
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { appelApi, ErreurApi } from '../commun/api'
import type { Affiche, Animation, CibleImage, Lieu } from '../commun/types'

export interface DonneesPubliques {
  lieux: Lieu[]
  animations: Animation[]
}

const vide: DonneesPubliques = { lieux: [], animations: [] }

/** Lieux actifs et animations de lieu publiées (en cours ou à venir), relus chaque minute (score en direct). */
export function useDonneesPubliques() {
  const q = useQuery({
    queryKey: ['public-lieux'],
    queryFn: () => appelApi<DonneesPubliques>('/public/lieux', { publique: true }),
    refetchInterval: 60_000,
  })
  // Objet stable entre deux rendus tant que les données ne changent pas : les effets et mémos
  // des pages (carte, proximité) qui en dépendent ne se relancent pas en boucle.
  const { data, isLoading, isError } = q
  return useMemo(() => ({ ...(data ?? vide), chargement: isLoading, erreur: isError }), [data, isLoading, isError])
}

/** Affiche ouverte par son QR code, avec les animations et le lieu promu. */
export interface AffichePublique {
  affiche: Affiche
  animationAffiche: Animation
  /** Spectacle du lieu mis en avant (absent si l'éditeur n'en a pas choisi). */
  animationLieu: Animation | null
  lieu: Lieu
  proprietaire: string
  animationLieuActive: boolean
  /** Cible de reconnaissance 8th Wall du visuel (null si le visuel ne convient pas). */
  cible: CibleImage | null
}

export type RaisonIndisponible = 'INCONNUE' | 'EXPIREE' | 'RETIREE'

/** Description d'une affiche ; en cas d'erreur, la raison renvoyée par l'API (404 inconnue, 410 retirée/expirée). */
export function useAffichePublique(code: string | null | undefined) {
  const q = useQuery({
    queryKey: ['public-affiche', code],
    queryFn: () => appelApi<AffichePublique>(`/public/affiches/${encodeURIComponent(code!)}`, { publique: true }),
    enabled: !!code,
    retry: (n, e) => !(e instanceof ErreurApi && e.statut < 500) && n < 2,
  })
  let raison: RaisonIndisponible | undefined
  if (q.error instanceof ErreurApi && (q.error.statut === 404 || q.error.statut === 410))
    raison = ((q.error.details as { raison?: RaisonIndisponible } | undefined)?.raison ?? (q.error.statut === 404 ? 'INCONNUE' : 'EXPIREE'))
  return { donnees: q.data, raison, chargement: q.isLoading, erreurReseau: q.isError && !raison }
}

/** Affiche diffusée, telle que la présente la liste « Les affiches à découvrir ». */
export interface AfficheDiffusee {
  codeQr: string
  nom: string
  accroche: string
  /** Dernier jour de diffusion (heure locale). */
  fin: string
  image: { url: string; largeur: number; hauteur: number } | null
  /** Monument vers lequel l'affiche invite (s'il est visible sur la carte). */
  lieu: { id: string; nom: string; nomCourt: string } | null
  /** Où l'affiche est collée : zone d'affichage attribuée par la mairie. */
  emplacement: { nom: string; adresse: string; latitude: number | null; longitude: number | null } | null
}

/** Affiches actuellement diffusées : liste des affiches, repères de la carte et scanner. */
export function useAffichesDiffusees() {
  const q = useQuery({ queryKey: ['public-affiches'], queryFn: () => appelApi<AfficheDiffusee[]>('/public/affiches', { publique: true }), refetchInterval: 120_000 })
  return { affiches: q.data ?? [], chargement: q.isLoading, erreur: q.isError }
}

/** Position d'une affiche (emplacement placé sur la carte), sinon null. */
export function positionAffiche(a: AfficheDiffusee) {
  const e = a.emplacement
  return e && e.latitude && e.longitude ? { latitude: e.latitude, longitude: e.longitude } : null
}
