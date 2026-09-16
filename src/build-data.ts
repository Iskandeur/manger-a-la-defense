// Transforme l'export Overpass brut en jeu de données compact pour l'app "Manger à La Défense".
// Source : OpenStreetMap (ODbL). Sortie : scratch/ladefense-data.json
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')  // racine du dépôt
import { readFileSync, writeFileSync } from 'node:fs'

const RAW = join(ROOT, 'src/raw.json')
const OUT = join(ROOT, 'data.json')

// Repères de La Défense (lat, lon) — servent d'ancre pour "à côté de quoi je suis".
const ANCHORS = [
  { id: 'arche', name: 'Grande Arche', lat: 48.89264, lon: 2.23617 },
  { id: '4temps', name: 'Les 4 Temps', lat: 48.8918, lon: 2.2378 },
  { id: 'cnit', name: 'CNIT', lat: 48.8925, lon: 2.2394 },
  { id: 'first', name: 'Tour First', lat: 48.8906, lon: 2.2412 },
  { id: 'total', name: 'Tour Total / La Coupole', lat: 48.8892, lon: 2.24 },
  { id: 'coeur', name: 'Cœur Défense', lat: 48.8896, lon: 2.2432 },
  { id: 'takis', name: 'Bassin Takis / Areva', lat: 48.889, lon: 2.2452 },
  { id: 'esplanade', name: 'Esplanade de La Défense (M1)', lat: 48.888, lon: 2.2523 },
  { id: 'michelet', name: 'Quartier Michelet / Puteaux', lat: 48.8862, lon: 2.242 },
  { id: 'faubourg', name: 'Faubourg de l’Arche (Courbevoie)', lat: 48.8955, lon: 2.2335 },
  { id: 'terrasses', name: 'Terrasses de l’Arche (Nanterre)', lat: 48.893, lon: 2.228 },
]

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const raw = JSON.parse(readFileSync(RAW, 'utf8')) as { elements: El[] }

const KIND: Record<string, string> = {
  restaurant: 'restaurant',
  fast_food: 'rapide',
  cafe: 'cafe',
  bar: 'bar',
  pub: 'bar',
  food_court: 'rapide',
  ice_cream: 'sucre',
}
const SHOP_KIND: Record<string, string> = { bakery: 'boulangerie', pastry: 'sucre', deli: 'traiteur', sandwich: 'rapide' }

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function healthyScore(kind: string, cuisine: string[], tags: Record<string, string>, hasBrand: boolean, isOrganic: boolean) {
  // ⚠️ Ce score n'est PAS une vérité nutritionnelle : c'est un proxy basé sur des tags OSM.
  // But : permettre un tri/filtre "plutôt healthy" sans inventer une note externe.
  let s = 50

  // Tag diet:* : le signal le plus fort quand il existe.
  const veg = tags['diet:vegetarian']
  const vegan = tags['diet:vegan']
  if (vegan === 'only' || veg === 'only') s += 35
  else if (vegan === 'yes' || veg === 'yes') s += 20

  if (isOrganic) s += 8

  // Type : proxy grossier (un bar n'est pas "healthy" par défaut).
  const kindAdj: Record<string, number> = {
    restaurant: 0,
    traiteur: 6,
    boulangerie: -6,
    cafe: -10,
    bar: -18,
    rapide: -14,
    sucre: -20,
  }
  s += kindAdj[kind] ?? 0

  // Cuisine : très léger, et seulement quand c'est explicite.
  const c = new Set(cuisine.map((x) => x.toLowerCase()))
  if (c.has('salad') || c.has('salad bar') || c.has('poke') || c.has('healthy')) s += 8
  if (c.has('burger') || c.has('kebab') || c.has('french_tacos') || c.has('pizza') || c.has('fried_chicken') || c.has('chicken')) s -= 6

  // Marque : on ne pénalise pas fort, mais une chaîne est rarement "healthy" par défaut.
  if (hasBrand) s -= 4

  return clamp(Math.round(s), 0, 100)
}

function clean(v?: string) {
  return v && v.trim() ? v.trim() : undefined
}

const seen = new Map<string, any>()
const out: any[] = []

for (const e of raw.elements) {
  const t = e.tags || {}
  const name = clean(t.name || t['name:fr'] || t.brand)
  if (!name) continue
  const lat = e.lat ?? e.center?.lat
  const lon = e.lon ?? e.center?.lon
  if (lat == null || lon == null) continue

  const kind = t.amenity ? KIND[t.amenity] : t.shop ? SHOP_KIND[t.shop] : undefined
  if (!kind) continue

  // Déduplication : même nom à moins de ~25 m (un POI cartographié en node ET en way).
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const dup = [...seen.entries()].find(([k, p]) => k === key && Math.hypot((p.lat - lat) * 111320, (p.lon - lon) * 73000) < 40)
  if (dup) continue

  const cuisine = clean(t.cuisine)?.split(';').map((s) => s.trim()).filter(Boolean) ?? []

  const addrParts = [clean(t['addr:housenumber']) ?? clean(t['contact:housenumber']), clean(t['addr:street']) ?? clean(t['contact:street']) ?? clean(t['addr:place'])]
    .filter(Boolean)
    .join(' ')
  const city = clean(t['addr:city']) ?? clean(t['contact:city'])

  const p: any = {
    id: e.type[0] + e.id,
    n: name,
    lat: +lat.toFixed(6),
    lon: +lon.toFixed(6),
    k: kind,
    c: cuisine,
  }

  const hasBrand = Boolean(clean(t.brand))
  const isOrganic = (t.organic === 'yes' || t['diet:organic'] === 'only' || t['diet:organic'] === 'yes')
  p.h = healthyScore(kind, cuisine, t, hasBrand, isOrganic)
  if (clean(t.opening_hours)) p.oh = t.opening_hours.trim()
  if (clean(t.level)) p.lvl = t.level.trim()
  if (addrParts) p.a = addrParts
  if (city) p.city = city

  // Téléphone : celui que le commerce affiche lui-même sur la carte (phone / contact:phone), rien d'autre.
  // Utile à 12h25 pour vérifier qu'un endroit est ouvert. Les emails restent exclus.
  const phone = clean(t.phone) ?? clean(t['contact:phone'])
  if (phone) p.tel = phone.split(';')[0].trim()
  const website = clean(t.website) ?? clean(t['contact:website'])
  if (website && !website.includes('@') && !website.toLowerCase().startsWith('mailto:')) p.w = website.split(';')[0].trim()

  if (clean(t.brand)) p.br = t.brand.trim()

  const flags: string[] = []
  if (t['diet:vegetarian'] === 'yes' || t['diet:vegetarian'] === 'only' || t['diet:vegan'] === 'yes' || t['diet:vegan'] === 'only') flags.push('veg')
  if (t['diet:vegan'] === 'only' || t['diet:vegetarian'] === 'only') flags.push('veg100')
  if (t['diet:halal'] === 'yes' || t['diet:halal'] === 'only') flags.push('halal')
  if (t.outdoor_seating === 'yes') flags.push('terrasse')
  if (t.takeaway === 'yes' || t.takeaway === 'only') flags.push('emporter')
  if (t.delivery === 'yes') flags.push('livraison')
  if (t.wheelchair === 'yes') flags.push('pmr')
  if (t.internet_access === 'wlan' || t['internet_access'] === 'yes') flags.push('wifi')
  if (t.air_conditioning === 'yes') flags.push('clim')
  if (flags.length) p.f = flags

  // Rare mais utile pour un score "healthy" dérivé.
  if (isOrganic) p.org = true

  // Indice de prix : OSM ne porte quasi jamais de prix. On se rabat sur le type + la marque.
  out.push(p)
  seen.set(key, p)
}

// Distance de chaque lieu à chaque repère (mètres, approximation plane locale — suffisante à cette échelle).
function dist(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dy = (aLat - bLat) * 111320
  const dx = (aLon - bLon) * 111320 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
  return Math.round(Math.hypot(dx, dy))
}
for (const p of out) {
  p.d = Object.fromEntries(ANCHORS.map((a) => [a.id, dist(p.lat, p.lon, a.lat, a.lon)]))
}

// On ne garde que ce qui est raisonnablement "à La Défense" : à moins de 900 m d'un des repères.
const kept = out.filter((p) => Math.min(...(Object.values(p.d) as number[])) <= 900)

const payload = {
  generated: new Date().toISOString(),
  source: 'OpenStreetMap (ODbL) via Overpass API',
  anchors: ANCHORS,
  places: kept.sort((a, b) => a.n.localeCompare(b.n, 'fr')),
}
writeFileSync(OUT, JSON.stringify(payload))
console.log('places retenues :', kept.length, '/', out.length)
const byKind: Record<string, number> = {}
for (const p of kept) byKind[p.k] = (byKind[p.k] || 0) + 1
console.log(byKind)
console.log('avec horaires :', kept.filter((p) => p.oh).length)
console.log('avec cuisine  :', kept.filter((p) => p.c.length).length)
console.log('poids json    :', (JSON.stringify(payload).length / 1024).toFixed(1), 'ko')
