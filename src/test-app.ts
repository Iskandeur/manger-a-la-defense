// Fait TOURNER le script de index.html dans un faux DOM minimal.
// Ce que ça prouve : init() + render() s'exécutent sans lever, les filtres filtrent,
// le HTML produit contient ce qu'il doit contenir, et rien n'échappe au filtre anti-injection.
// Ce que ça NE prouve PAS : le rendu visuel, le CSS, la géoloc, Leaflet (pas de navigateur ici).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')  // racine du dépôt
import { readFileSync } from 'node:fs'

const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'))

let ko = 0
const t = (label: string, got: any, want: any) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g !== w) { console.log('✗', label, '\n   obtenu ', g, '\n   attendu', w); ko++ }
}
const ok = (label: string, cond: any) => { if (!cond) { console.log('✗', label); ko++ } }

// ---- faux DOM ----------------------------------------------------------
type Node = any
const listeners = new Map<string, Array<[string, Function]>>()
function mk(id: string): Node {
  const el: Node = {
    id, innerHTML: '', value: '', hidden: false, dataset: {},
    _tc: '',
    // un vrai DOM convertit toujours textContent en chaîne : le faux doit faire pareil
    get textContent() { return this._tc }, set textContent(v: any) { this._tc = String(v) },
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) { this.attrs[k] = v },
    getAttribute(k: string) { return this.attrs[k] ?? null },
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(ev: string, fn: Function) {
      const arr = listeners.get(id) ?? []; arr.push([ev, fn]); listeners.set(id, arr)
    },
    scrollIntoView() {},
  }
  return el
}
const els = new Map<string, Node>()
const IDS = ['total','total2','ohCount','gen','now','openNow','anchor','kinds','cuisines','flags',
             'q','dice','geo','rad','radLbl','sort',
             'healthy','healthyLbl','healthyHelp','price','priceLbl','priceHelp',
             'tOpen','tHours','tMap','reset','count','results','empty','map']
for (const id of IDS) els.set(id, mk(id))

const fire = (id: string, ev: string, target?: any) => {
  for (const [e, fn] of listeners.get(id) ?? []) {
    if (e === ev) fn({ target: target ?? els.get(id), currentTarget: els.get(id), closest: () => null })
  }
}

const g: any = globalThis
g.document = {
  getElementById: (id: string) => els.get(id) ?? null,
  querySelectorAll: () => [],
  createElement: () => ({ onload: null, onerror: null }),
  head: { appendChild() {} },
}
g.window = {}
// `navigator` est en lecture seule sous Node 22 → on le redéfinit
Object.defineProperty(g, 'navigator', { value: {}, configurable: true, writable: true })
g.alert = () => {}
let ticks = 0
g.setInterval = () => { ticks++; return 0 }
g.setTimeout = () => 0

// ---- exécution ---------------------------------------------------------
let api: any = {}
try {
  new Function('exports', src + '\nObject.assign(exports,{S,DB,render,matches,status,distOf});')(api)
} catch (e) {
  console.log('✗ le script lève au chargement :', (e as Error).message)
  process.exit(1)
}
const { S, DB, render, matches } = api

// ---- ce que l'init a écrit dans la page --------------------------------
t('nombre total affiché', els.get('total')!.textContent, String(DB.places.length))
t('nombre d’horaires affiché', els.get('ohCount')!.textContent, String(DB.places.filter((p: any) => p.oh).length))
ok('date d’extraction affichée', /2026/.test(els.get('gen')!.textContent))
ok('heure affichée', /^\d{2}:\d{2}$/.test(els.get('now')!.textContent))
ok('repères dans le menu déroulant', els.get('anchor')!.innerHTML.includes('Grande Arche'))
ok('puces de type construites', els.get('kinds')!.innerHTML.includes('Boulangerie'))
ok('puces de cuisine en français', els.get('cuisines')!.innerHTML.includes('japonais'))
ok('puces de critères', els.get('flags')!.innerHTML.includes('Terrasse'))
t('rafraîchissement périodique armé', ticks, 1)

// ---- la liste rendue ---------------------------------------------------
const out = () => els.get('results')!.innerHTML
ok('des cartes sont rendues', out().split('<li class="card').length - 1 > 5)
ok('chaque carte a un itinéraire', out().split('<li class="card').length - 1 === out().split('🧭 Itinéraire').length - 1)
ok('un statut par carte', out().split('<li class="card').length - 1 === out().split('class="st ').length - 1)
ok('aucune balise non échappée dans un nom', !/<li class="card[^]*?<script/i.test(out()))

// ---- les filtres filtrent vraiment -------------------------------------
const n = () => els.get('results')!.innerHTML.split('<li class="card').length - 1
const base = n()

S.kinds.add('boulangerie'); render()
const bak = n()
ok('filtre type : moins de résultats', bak > 0 && bak < base)
ok('filtre type : que des boulangeries', !out().includes('🍽️ '))
S.kinds.clear()

S.q = 'sushi'; render()
ok('recherche texte : trouve quelque chose', n() > 0)
ok('recherche texte : réduit', n() < base)
S.q = 'zzzzintrouvable'; render()
t('recherche sans résultat', n(), 0)
ok('message vide affiché', els.get('empty')!.hidden === false)
S.q = ''; render()

S.q = 'defense'; render(); const sansAccent = n()
S.q = 'défense'; render()
t('recherche insensible aux accents', n(), sansAccent)
S.q = 'JAPONAIS'; render(); const maj = n()
S.q = 'japonais'; render()
t('recherche insensible à la casse', n(), maj)
S.q = ''; render()

// rayon : 2 min à pied doit être un sous-ensemble strict de 20 min
S.radMin = 20; render(); const large = n()
S.radMin = 2; render(); const serre = n()
ok('rayon : 2 min ⊂ 20 min', serre < large && serre > 0)
S.radMin = 10; render()

// "ouvert maintenant" : décocher ne peut qu'ajouter
const avecFiltre = n()
S.openOnly = false; render()
ok('décocher « ouvert » n’enlève jamais de résultat', n() >= avecFiltre)
// et les "horaires inconnus" doivent survivre au filtre "ouvert" (promesse faite dans le pied de page)
S.openOnly = true; render()
ok('les horaires inconnus restent visibles', out().includes('horaires inconnus'))

// cumul de filtres : ajouter un critère ne peut qu'enlever
const c0 = n(); S.flags.add('terrasse'); render(); const c1 = n()
ok('cumuler un critère réduit', c1 <= c0 && c1 > 0)
S.flags.clear(); render()

// ---- l'ancre change bien les distances ---------------------------------
S.anchor = 'terrasses'; render(); const ordreA = out().slice(0, 400)
S.anchor = 'esplanade'; render(); const ordreB = out().slice(0, 400)
ok('changer de repère change le classement', ordreA !== ordreB)
S.anchor = '4temps'; render()

// ---- le dé tombe toujours sur un résultat affiché -----------------------
for (let i = 0; i < 30; i++) {
  fire('dice', 'click')
  const picked = S.pick
  ok('le dé choisit dans la liste filtrée', DB.places.some((p: any) => p.id === picked && matches(p)))
  if (!DB.places.some((p: any) => p.id === picked && matches(p))) break
}

// ---- intégrité du jeu de données ---------------------------------------
ok('tous les lieux ont un nom', DB.places.every((p: any) => p.n && p.n.trim()))
ok('toutes les coordonnées sont dans le coin', DB.places.every((p: any) =>
  p.lat > 48.87 && p.lat < 48.91 && p.lon > 2.21 && p.lon < 2.27))
ok('toutes les distances sont calculées', DB.places.every((p: any) =>
  DB.anchors.every((a: any) => typeof p.d[a.id] === 'number')))
ok('aucun doublon d’identifiant', new Set(DB.places.map((p: any) => p.id)).size === DB.places.length)
ok('tous les types sont connus de l’interface',
  DB.places.every((p: any) => ['restaurant','rapide','boulangerie','cafe','bar','traiteur','sucre'].includes(p.k)))
ok('aucun site web en http:// non échappé cassant l’attribut',
  DB.places.every((p: any) => !p.w || !/["'<>]/.test(p.w)))

console.log(ko ? `\n❌ ${ko} test(s) en échec` : `\n✅ l'app tourne : ${DB.places.length} lieux, ${base} affichés par défaut, tous les cas passent`)
process.exit(ko ? 1 : 0)
