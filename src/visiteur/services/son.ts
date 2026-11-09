// Effets sonores synthétisés avec Web Audio (BF-20). Sur iPhone, le contexte audio
// doit être déverrouillé par un geste de l'utilisateur : on l'appelle depuis « Autoriser et commencer ».

type Theme = 'cloches' | 'stade' | 'affiche'

let ctx: AudioContext | null = null
let sortie: GainNode | null = null
let boucle: number | null = null
let muet = false

function contexte(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  sortie = ctx.createGain()
  sortie.gain.value = muet ? 0 : 0.35
  sortie.connect(ctx.destination)
  return ctx
}

export function deverrouillerSon() {
  const c = contexte()
  if (c && c.state === 'suspended') void c.resume()
}

function note(freq: number, debut: number, duree: number, type: OscillatorType = 'sine', volume = 0.5) {
  const c = contexte()
  if (!c || !sortie) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + debut)
  g.gain.linearRampToValueAtTime(volume, c.currentTime + debut + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + debut + duree)
  o.connect(g).connect(sortie)
  o.start(c.currentTime + debut)
  o.stop(c.currentTime + debut + duree + 0.05)
}

function foule(duree: number) {
  const c = contexte()
  if (!c || !sortie) return
  const buffer = c.createBuffer(1, c.sampleRate * duree, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i / 9000))
  const src = c.createBufferSource()
  src.buffer = buffer
  const filtre = c.createBiquadFilter()
  filtre.type = 'bandpass'
  filtre.frequency.value = 900
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.linearRampToValueAtTime(0.25, c.currentTime + 0.8)
  g.gain.linearRampToValueAtTime(0.0001, c.currentTime + duree)
  src.connect(filtre).connect(g).connect(sortie)
  src.start()
}

function motif(theme: Theme) {
  if (theme === 'cloches') {
    ;[659, 784, 988, 1319, 988, 784].forEach((f, i) => note(f, i * 0.42, 1.6, 'sine', 0.35))
  } else if (theme === 'stade') {
    foule(4)
    ;[392, 392, 523].forEach((f, i) => note(f, 0.4 + i * 0.3, 0.35, 'sawtooth', 0.12))
  } else {
    ;[523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.9, 'triangle', 0.3))
  }
}

export function jouerTheme(theme: Theme) {
  arreterSon()
  if (!contexte()) return
  deverrouillerSon()
  motif(theme)
  boucle = window.setInterval(() => motif(theme), theme === 'affiche' ? 4000 : 6000)
}

export function arreterSon() {
  if (boucle !== null) window.clearInterval(boucle)
  boucle = null
}

export function couperSon(valeur: boolean) {
  muet = valeur
  if (sortie && ctx) sortie.gain.setTargetAtTime(valeur ? 0 : 0.35, ctx.currentTime, 0.05)
}

export function estMuet() {
  return muet
}
