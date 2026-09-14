import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(ROOT, 'data.json')

const db = JSON.parse(readFileSync(path, 'utf8'))
let removedTel = 0
let removedBadWeb = 0

for (const p of db.places) {
  if (p.tel) {
    delete p.tel
    removedTel++
  }
  if (typeof p.w === 'string') {
    const w = p.w.trim()
    if (w.includes('@') || /^mailto:/i.test(w)) {
      delete p.w
      removedBadWeb++
    }
  }
}

writeFileSync(path, JSON.stringify(db))
console.log('sanitize-data:', { removedTel, removedBadWeb, places: db.places.length })
