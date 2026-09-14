// Tire l'évaluateur d'horaires DU template lui-même (pas une copie : une copie divergerait)
// et le confronte à des cas construits à la main + aux 114 chaînes réelles du jeu de données.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const SRC = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SRC, '..')
import { readFileSync } from 'node:fs'
import assert from 'node:assert'

const tpl = readFileSync(join(SRC, 'template.html'), 'utf8')
const start = tpl.indexOf('const DAYS =')
const end = tpl.indexOf('/* ------------------------------------------------------------------ *\n * Vocabulaire')
assert.ok(start > 0 && end > start, 'bloc horaires introuvable dans le template')
const src = tpl.slice(start, end)

const mod: any = {}
new Function('exports', src + '\nObject.assign(exports,{parseOH,status,todayHours,expandDays,fmt});')(mod)
const { parseOH, status, todayHours } = mod

// 2026-09-14 est un LUNDI. On fabrique des instants précis.
const at = (dayISO: string, hm: string) => new Date(`${dayISO}T${hm}:00`)
const MON = '2026-09-14', TUE = '2026-09-15', SAT = '2026-09-19', SUN = '2026-09-20'

let ko = 0
function t(label: string, got: any, want: any) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g !== w) { console.log('✗', label, '\n   obtenu', g, '\n   attendu', w); ko++ }
}

// --- ouvert / fermé simples
t('Mo-Fr 12-15, lundi 12h30', status('Mo-Fr 12:00-15:00', at(MON, '12:30')).state, 'open')
t('Mo-Fr 12-15, lundi 15h30', status('Mo-Fr 12:00-15:00', at(MON, '15:30')).state, 'closed')
t('Mo-Fr 12-15, samedi midi', status('Mo-Fr 12:00-15:00', at(SAT, '12:30')).state, 'closed')
t('Mo-Fr 12-15, lundi 11h59', status('Mo-Fr 12:00-15:00', at(MON, '11:59')).state, 'closed')

// --- la borne exacte : 12:00 pile est ouvert, 15:00 pile est fermé
t('borne ouverture', status('Mo-Fr 12:00-15:00', at(MON, '12:00')).state, 'open')
t('borne fermeture', status('Mo-Fr 12:00-15:00', at(MON, '15:00')).state, 'closed')

// --- double service
t('double service, creux 16h', status('Mo-Sa 12:00-15:00,18:30-23:00', at(MON, '16:00')).state, 'closed')
t('double service, soir', status('Mo-Sa 12:00-15:00,18:30-23:00', at(MON, '19:00')).state, 'open')

// --- "ferme bientôt" (≤45 min)
t('ferme dans 20 min', status('Mo-Fr 12:00-15:00', at(MON, '14:40')).state, 'soon')
t('ferme dans 20 min, libellé', status('Mo-Fr 12:00-15:00', at(MON, '14:40')).label, 'ferme à 15:00')
t('ferme dans 60 min', status('Mo-Fr 12:00-15:00', at(MON, '14:00')).state, 'open')

// --- service de nuit (fin < début) et son débordement sur le lendemain
t('bar nuit, 01h du mardi', status('Sa-Th 11:00-02:00, Fr 14:00-02:00', at(TUE, '01:00')).state, 'open')
t('bar nuit, 03h du mardi', status('Sa-Th 11:00-02:00, Fr 14:00-02:00', at(TUE, '03:00')).state, 'closed')
t('bar nuit, 23h lundi', status('Sa-Th 11:00-02:00, Fr 14:00-02:00', at(MON, '23:00')).state, 'open')

// --- jours qui bouclent par-dessus dimanche (Sa-Th = sam,dim,lun,mar,mer,jeu)
t('Sa-Th inclut lundi', mod.expandDays('Sa-Th').sort((a: number, b: number) => a - b), [0, 1, 2, 3, 4, 6])
t('Sa-Th exclut vendredi', mod.expandDays('Sa-Th').includes(5), false)

// --- 24/7 et 24:00
t('24/7', status('24/7', at(SUN, '04:00')).state, 'open')
t('minuit de fin, 20h', status('Mo-Su 18:00-24:00', at(MON, '20:00')).state, 'open')
t('minuit de fin, 23h30', status('Mo-Su 18:00-24:00', at(MON, '23:30')).label, 'ferme à 00:00')

// --- "off" : un jour de fermeture au milieu d'une plage large
t('We off, mercredi', status('Mo-Su 07:00-12:00,15:00-20:00; We off', at('2026-09-16', '10:00')).state, 'closed')
t('We off, jeudi', status('Mo-Su 07:00-12:00,15:00-20:00; We off', at('2026-09-17', '10:00')).state, 'open')

// --- ce qu'on ne sait PAS évaluer doit rendre "inconnu", jamais "ouvert" ni "fermé"
t('férié seul → inconnu', status('PH off', at(MON, '12:00')).state, 'unknown')
t('saison → inconnu', status('Apr-Sep 10:00-20:00', at(MON, '12:00')).state, 'unknown')
t('vide → inconnu', status('', at(MON, '12:00')).state, 'unknown')
t('charabia → inconnu', status('sur rendez-vous', at(MON, '12:00')).state, 'unknown')
// mais une règle mixte garde sa partie évaluable
t('Mo-Fr + PH off garde Mo-Fr', status('Mo-Fr 09:00-18:00; PH off', at(MON, '12:00')).state, 'open')

// --- prochaine ouverture
t('rouvre le soir', status('Mo-Sa 12:00-15:00,18:30-23:00', at(MON, '16:00')).next, 'rouvre à 18:30')
t('rouvre demain', status('Mo-Fr 12:00-15:00', at(MON, '20:00')).next, 'demain 12:00')
t('rouvre lundi', status('Mo-Fr 12:00-15:00', at(SAT, '12:00')).next, 'lundi 12:00')

// --- horaires du jour affichés
t('horaires lundi', todayHours('Mo-Sa 12:00-15:00,18:30-23:00', 1), '12:00–15:00 · 18:30–23:00')
t('horaires dimanche', todayHours('Mo-Sa 12:00-15:00', 0), 'fermé aujourd’hui')

// --- passe sur les VRAIES chaînes du jeu de données : aucune ne doit lever,
//     et on mesure combien restent inévaluables (le chiffre annoncé dans l'app).
const db = JSON.parse(readFileSync(join(ROOT, 'data.json'), 'utf8'))
const withOH = db.places.filter((p: any) => p.oh)
let unknown = 0, crash = 0
const unknowns: string[] = []
for (const p of withOH) {
  for (const h of [0, 6, 12, 13, 19, 23]) {
    try {
      const st = status(p.oh, at(MON, String(h).padStart(2, '0') + ':30'))
      assert.ok(['open', 'soon', 'closed', 'unknown'].includes(st.state), 'état inattendu ' + st.state)
      assert.ok(typeof st.label === 'string' && st.label.length, 'libellé vide')
    } catch (e) { crash++; console.log('✗ CRASH sur', JSON.stringify(p.oh), (e as Error).message) }
  }
  if (status(p.oh, at(MON, '12:30')).state === 'unknown') { unknown++; unknowns.push(p.oh) }
}
t('aucune chaîne réelle ne fait planter', crash, 0)

console.log('\n— jeu réel —')
console.log('chaînes horaires   :', withOH.length, '/', db.places.length, 'lieux')
console.log('inévaluables       :', unknown, unknown ? '→ ' + [...new Set(unknowns)].slice(0, 10).join(' | ') : '')
const lunch = db.places.filter((p: any) => p.oh && status(p.oh, at(MON, '12:30')).state === 'open').length
console.log('ouverts lundi 12h30:', lunch)
const sunday = db.places.filter((p: any) => p.oh && status(p.oh, at(SUN, '12:30')).state === 'open').length
console.log('ouverts dimanche   :', sunday, '(La Défense le dimanche : doit être NETTEMENT plus bas)')

console.log(ko ? `\n❌ ${ko} test(s) en échec` : '\n✅ tous les cas passent')
process.exit(ko ? 1 : 0)
