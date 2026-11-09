import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icone, type NomIcone } from '../commun/Icone'
import type { StatutCompte, StatutContenu, StatutControle, StatutSignalement } from '../commun/types'

// Composants d'affichage du back-office : données reçues par les props, aucune logique métier.

export function EnTetePage({ titre, description, actions }: { titre: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="bo-entete">
      <div>
        <h1>{titre}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="bo-entete-actions">{actions}</div>}
    </header>
  )
}

export function Panneau({ titre, sousTitre, action, children, className = '' }: { titre?: string; sousTitre?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panneau ${className}`}>
      {(titre || action) && (
        <div className="panneau-tete">
          <div>
            {titre && <h2>{titre}</h2>}
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Onglets<T extends string>({ valeur, options, onChange }: { valeur: T; options: { id: T; libelle: string; compte?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="onglets" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={valeur === o.id} className={valeur === o.id ? 'actif' : ''} onClick={() => onChange(o.id)}>
          {o.libelle}
          {o.compte !== undefined && <b>{o.compte}</b>}
        </button>
      ))}
    </div>
  )
}

const LIBELLES: Record<string, [string, string]> = {
  BROUILLON: ['Brouillon', 'pill-stone'],
  PUBLIEE: ['Publiée', 'pill-green'],
  SUSPENDUE: ['Suspendue', 'pill-amber'],
  RETIREE: ['Retirée', 'pill-wine'],
  EN_ATTENTE: ['À vérifier', 'pill-amber'],
  VERIFIE: ['Vérifié', 'pill-green'],
  REFUSE: ['Refusé', 'pill-wine'],
  SUSPENDU: ['Suspendu', 'pill-amber'],
  EN_COURS: ['En cours', 'pill-amber'],
  CONFORME: ['Conforme', 'pill-green'],
  NOUVEAU: ['Nouveau', 'pill-wine'],
  TRAITE: ['Traité', 'pill-stone'],
}

export function BadgeStatut({ statut, libelle }: { statut: StatutContenu | StatutCompte | StatutControle | StatutSignalement | string; libelle?: string }) {
  const [texte, classe] = LIBELLES[statut] ?? [statut, 'pill-stone']
  return <span className={`pill ${classe}`}>{libelle ?? texte}</span>
}

export function Interrupteur({ actif, onChange, libelle, desactive }: { actif: boolean; onChange: () => void; libelle: string; desactive?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={actif} aria-label={libelle} className={`interrupteur ${actif ? 'on' : ''}`} onClick={onChange} disabled={desactive}>
      <i />
    </button>
  )
}

/** Panneau latéral d'édition. */
export function Tiroir({ ouvert, titre, sousTitre, onFermer, children, pied, large }: { ouvert: boolean; titre: string; sousTitre?: string; onFermer: () => void; children: ReactNode; pied?: ReactNode; large?: boolean }) {
  useEffect(() => {
    if (!ouvert) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [ouvert, onFermer])
  if (!ouvert) return null
  return createPortal(
    <div className="bo-voile" onClick={onFermer}>
      <aside className={`tiroir ${large ? 'large' : ''}`} role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="tiroir-tete">
          <div>
            <h2>{titre}</h2>
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          <button type="button" className="bo-icone" onClick={onFermer} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </div>
        <div className="tiroir-corps">{children}</div>
        {pied && <div className="tiroir-pied">{pied}</div>}
      </aside>
    </div>,
    document.body,
  )
}

/** Fenêtre qui exige un motif avant un refus, une suspension ou un retrait (BF-34, BF-44, BF-49). */
export function DialogueMotif({
  ouvert,
  titre,
  description,
  libelleConfirmer,
  danger,
  suggestions = [],
  onConfirmer,
  onFermer,
}: {
  ouvert: boolean
  titre: string
  description?: string
  libelleConfirmer: string
  danger?: boolean
  suggestions?: string[]
  onConfirmer: (motif: string) => void
  onFermer: () => void
}) {
  const [motif, setMotif] = useState('')
  const id = useId()
  useEffect(() => {
    if (ouvert) setMotif('')
  }, [ouvert])
  if (!ouvert) return null
  return createPortal(
    <div className="bo-voile centre" onClick={onFermer}>
      <div className="dialogue" role="alertdialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <h2 id={id}>{titre}</h2>
        {description && <p className="dialogue-texte">{description}</p>}
        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setMotif(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <label className="champ">
          <span className="etiquette">
            Motif <small>Obligatoire · transmis au partenaire</small>
          </span>
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} maxLength={500} autoFocus placeholder="Expliquez la décision de façon claire et vérifiable…" />
        </label>
        <div className="dialogue-actions">
          <button type="button" className="btn btn-fantome" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primaire'}`} disabled={motif.trim().length < 5} onClick={() => onConfirmer(motif.trim())}>
            {libelleConfirmer}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Notification éphémère (« Partenaire notifié par mail », etc.). */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const minuteur = useRef<number | null>(null)
  const afficher = (m: string) => {
    setMessage(m)
    if (minuteur.current) window.clearTimeout(minuteur.current)
    minuteur.current = window.setTimeout(() => setMessage(null), 3800)
  }
  const element = message
    ? createPortal(
        <div className="toast" role="status">
          <Icone nom="check" taille={16} />
          {message}
        </div>,
        document.body,
      )
    : null
  return { afficher, element }
}

export function CarteStat({ libelle, valeur, evolution, icone, note }: { libelle: string; valeur: string; evolution?: string; icone: NomIcone; note?: string }) {
  return (
    <div className="carte-stat">
      <div className="carte-stat-haut">
        <span>{libelle}</span>
        <i>
          <Icone nom={icone} taille={16} />
        </i>
      </div>
      <strong>{valeur}</strong>
      <small>
        {evolution && <b>{evolution}</b>} {note ?? 'ces 30 derniers jours'}
      </small>
    </div>
  )
}

export function Vide({ icone, titre, texte, action }: { icone: NomIcone; titre: string; texte?: string; action?: ReactNode }) {
  return (
    <div className="vide">
      <span>
        <Icone nom={icone} taille={24} />
      </span>
      <strong>{titre}</strong>
      {texte && <p>{texte}</p>}
      {action}
    </div>
  )
}

export function Recherche({ valeur, onChange, placeholder = 'Rechercher' }: { valeur: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="recherche">
      <Icone nom="recherche" taille={15} />
      <input type="search" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  )
}

// ---------------------------------------------------------------- graphiques SVG

function chemin(points: number[], w: number, h: number, max: number) {
  const pas = w / Math.max(1, points.length - 1)
  return points
    .map((v, i) => {
      const x = i * pas
      const y = h - (v / max) * h
      if (i === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`
      const px = (i - 1) * pas
      const py = h - (points[i - 1] / max) * h
      const cx = (px + x) / 2
      return `C${cx.toFixed(1)} ${py.toFixed(1)} ${cx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function GraphiqueLignes({ series, etiquettes, hauteur = 190 }: { series: { nom: string; couleur: 'wine' | 'cyan'; valeurs: number[] }[]; etiquettes: string[]; hauteur?: number }) {
  const w = 600
  const h = 180
  const brut = Math.max(10, ...series.flatMap((s) => s.valeurs))
  const max = Math.ceil(brut / 100) * 100
  const [survol, setSurvol] = useState<number | null>(null)
  const n = series[0]?.valeurs.length ?? 0
  return (
    <div className="graphique" style={{ height: hauteur }}>
      <div className="axe-y" aria-hidden="true">
        {[max, max * 0.75, max / 2, max / 4, 0].map((v) => (
          <span key={v}>{Math.round(v)}</span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={series.map((s) => `${s.nom} : total ${s.valeurs.reduce((a, b) => a + b, 0)}`).join(', ')}
        onMouseLeave={() => setSurvol(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setSurvol(Math.round(((e.clientX - r.left) / r.width) * (n - 1)))
        }}
      >
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1={0} x2={w} y1={h * k} y2={h * k} className="grille-graphique" />
        ))}
        {series[0] && <path d={`${chemin(series[0].valeurs, w, h, max)} L${w} ${h} L0 ${h} Z`} className="aire" />}
        {series.map((s) => (
          <path key={s.nom} d={chemin(s.valeurs, w, h, max)} className={`ligne-${s.couleur}`} />
        ))}
        {survol !== null && survol >= 0 && survol < n && <line x1={(survol * w) / (n - 1)} x2={(survol * w) / (n - 1)} y1={0} y2={h} className="curseur-graphique" />}
      </svg>
      {survol !== null && survol >= 0 && survol < n && (
        <div className="info-graphique" style={{ left: `calc(${(survol / Math.max(1, n - 1)) * 100}% * 0.94 + 30px)` }}>
          {series.map((s) => (
            <span key={s.nom}>
              <i className={s.couleur} /> {s.nom} : <b>{s.valeurs[survol]}</b>
            </span>
          ))}
        </div>
      )}
      <div className="axe-x" aria-hidden="true">
        {etiquettes.map((e, i) => (
          <span key={`${e}-${i}`}>{e}</span>
        ))}
      </div>
    </div>
  )
}

export function Legende({ elements }: { elements: { nom: string; couleur: 'wine' | 'cyan' }[] }) {
  return (
    <div className="legende">
      {elements.map((e) => (
        <span key={e.nom}>
          <i className={e.couleur} />
          {e.nom}
        </span>
      ))}
    </div>
  )
}

export function Barres({ donnees, unite = '' }: { donnees: { libelle: string; valeur: number; secondaire?: number }[]; unite?: string }) {
  const max = Math.max(1, ...donnees.map((d) => d.valeur))
  return (
    <ul className="barres">
      {donnees.map((d) => (
        <li key={d.libelle}>
          <span>{d.libelle}</span>
          <div>
            <i style={{ width: `${(d.valeur / max) * 100}%` }} />
            {d.secondaire !== undefined && <i className="secondaire" style={{ width: `${(d.secondaire / max) * 100}%` }} />}
          </div>
          <b>
            {d.valeur.toLocaleString('fr-FR')}
            {unite}
          </b>
        </li>
      ))}
    </ul>
  )
}

export function formaterDate(iso: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat('fr-FR', options).format(new Date(iso))
}

export function formaterPoids(octets: number) {
  return octets >= 1_000_000 ? `${(octets / 1_000_000).toFixed(1).replace('.', ',')} Mo` : `${Math.round(octets / 1000)} Ko`
}
