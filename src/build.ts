// Injecte le jeu de données dans le template → index.html autoportant (un seul fichier).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SRC, '..')

const data = readFileSync(join(ROOT, 'data.json'), 'utf8')
const tpl = readFileSync(join(SRC, 'template.html'), 'utf8')

if (!tpl.includes('/*__DATA__*/null/*__END__*/')) throw new Error('marqueur de données absent du template')
// `</script` dans une chaîne JSON refermerait la balise : on le neutralise.
const html = tpl.replace('/*__DATA__*/null/*__END__*/', data.replace(/<\/script/gi, '<\\/script'))

writeFileSync(join(ROOT, 'index.html'), html)
console.log('index.html :', (html.length / 1024).toFixed(1), 'ko')
