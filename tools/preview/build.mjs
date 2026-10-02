// Writes tools/preview/preview.html: the same preview the preview_pet tool writes, for a pet file.
// Run: node tools/preview/build.mjs [pet file], the default slime when no pet file is given. It prints the
// pet's resting frame and notes, or exits 1 when the pet has no sprite.
import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

process.removeAllListeners('warning') // stripTypeScriptTypes is experimental and says so on every run

const plugin = new URL('../../plugins/pixel-pet/', import.meta.url)
const source = name =>
  stripTypeScriptTypes(readFileSync(new URL(`hooks/${name}`, plugin), 'utf8'))
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '')
// The modules share one scope here, imports stripped, so a top-level name declared in two of them breaks the build.
const modules = ['pixels.ts', 'pet.ts', 'preview.ts'].map(source).join('\n')
const { animate, previewPage, readPet, restingFrame } = new Function(`${modules}\nreturn { animate, previewPage, readPet, restingFrame }`)()

const petFile = process.argv[2] ?? new URL('assets/slime.json', plugin)
const read = readPet(JSON.parse(readFileSync(petFile, 'utf8')))
if (read.errors) {
  console.error(`${petFile}: ${read.errors.join(' ')}`)
  process.exit(1)
}
const body = animate(read.pet)
console.log(restingFrame(body))
for (const note of read.notes) console.log(`note: ${note}`)

const out = new URL('preview.html', import.meta.url)
writeFileSync(out, previewPage(body, read.notes))
console.log(`wrote ${out.pathname}`)
