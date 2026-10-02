import { expect, test } from 'claude-code/testing'

import { animate, maxSize, readPet, restingFrame } from './pet'

// The default slime, as assets/slime.json spells it.
const slime = {
  name: 'slime',
  scale: 0.8,
  sprite: [
    '........a........',
    '.......aha.......',
    '......agfda......',
    '....aagffddaa....',
    '...ahgffffddda...',
    '..ahhgffffffdda..',
    '.agggfffffffddda.',
    '.afffffffffdddca.',
    'acdffffffffdddcca',
    '.accddddddddddca.',
    '..aaaaaaaaaaaaa..',
  ],
  palette: { a: '#1e3a8a', c: '#2a5fd6', d: '#3d84f0', f: '#5aa9ff', g: '#9ad2ff', h: '#e3f4ff' },
  outline: 'a',
  eyes: [[4, 5], [10, 5]],
  cheeks: [[3, 6], [13, 6]],
  cheekColor: '#ff8aaa',
}

const petOf = (v: unknown) => {
  const read = readPet(v)
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  return read.pet
}

test('the slime animates to the frames it was first drawn with', () => {
  const body = animate(petOf(slime))
  const rest = body.clips.stand.frames[0]!
  expect(rest.g.slice(10)).toEqual([
    '...................',
    '.........a.........',
    '........aha........',
    '......aagfdaa......',
    '.....aagffddaa.....',
    '....ahhgffffdda....',
    '...ag*gfffffd*da...',
    '...affffffffddca...',
    '...accddddddddca...',
    '....aaaaaaaaaaa....',
  ])
  expect([rest.l, rest.r]).toEqual([[6, 14], [10, 14]])
  expect(body.clips.jump.frames[6]!.g[4]).toBe('.........a.........')
  expect(body.clips.jump.frames[6]!.l).toEqual([6, 7])
  expect(Object.fromEntries(Object.entries(body.clips).map(([k, c]) => [k, [c.fps, c.frames.length]]))).toEqual({
    stand: [8, 16], run: [12, 8], jump: [12, 14], think: [6, 12], cheer: [10, 18],
  })
})

test('a pet fills in its defaults', () => {
  const pet = petOf({ sprite: ['aaaaaaa', 'aaaaaaa', 'aaaaaaa'], palette: { a: '#123456' }, eyes: [[0, 1], [4, 1]] })
  expect([pet.name, pet.scale, pet.eyeColor, pet.mini.body]).toEqual(['pet', 1, '#000000', '#3d84f0'])
})



test('the resting frame marks the pupils with @ and starts at the first row in use', () => {
  const rows = restingFrame(animate(petOf(slime))).split('\n')
  expect(rows[0]).toBe('.........a.........')
  expect(rows[5]).toBe('...ag*@@ff@@d*da...')
})

test('at scale 1 the resting frame is the sprite itself, at an even width or an odd one', () => {
  for (const sprite of [['.aaaaaa.', 'abbaabba', 'abbaabba', 'aaaaaaaa'], ['..aaaaa..', '.abbabba.', 'abbbabbba', 'aaaaaaaaa']]) {
    const body = animate(petOf({ sprite, palette: { a: '#111111', b: '#999999' }, eyes: [[0, 1], [5, 1]] }))
    const rows = body.clips.stand.frames[0]!.g.filter(r => /[^.]/.test(r)).map(r => r.replace(/^\.+|\.+$/g, ''))
    expect(rows).toEqual(sprite.map(r => r.replace(/^\.+|\.+$/g, '')))
  }
})


test('a sprite too big for scale 1 is drawn smaller, with a note', () => {
  expect(maxSize(1)).toEqual({ w: 15, h: 10 })
  const read = readPet({ ...slime, scale: 1 })
  expect(read.errors).toBeUndefined()
  expect(read.errors ? 0 : read.pet.scale).toBe(0.89)
  expect(read.errors ? [] : read.notes).toEqual([
    'A 17×11 sprite is drawn at scale 0.89 to fit every pose. At scale 1 the largest is 15×10, and a smaller scale blurs detail.',
  ])
})

test('only a pet with no sprite is refused; the rest is repaired and noted', () => {
  expect(readPet('a cat').errors).toEqual(['A pet is a JSON object with a `sprite`.'])
  expect(readPet({ palette: { a: '#123456' } }).errors).toEqual(['`sprite` is a list of text rows, one character per pixel.'])

  const read = readPet({ sprite: ['ab*', 'a'], palette: { a: '#abc', b: 'blue' }, eyes: 'big', mini: { top: '#fff' } })
  if (read.errors) {
    throw new Error(read.errors.join('\n'))
  }
  expect(read.pet.sprite).toEqual(['ab.', 'a..'])
  expect(read.pet.palette).toEqual({ a: '#aabbcc' })
  expect(read.pet.eyes).toBeUndefined()
  expect(read.notes).toEqual([
    'Rows of different widths were padded with "." to 3.',
    'The sprite\'s "*", "+", "@" pixels are drawn clear: the mod marks its own drawings with them.',
    'The palette color for "b", "blue", is not "#rrggbb", so "b" is drawn clear.',
    '"b" has no palette color, so it is drawn clear.',
    '`eyes` is two [x, y] points, so the pet has no eyes and no faces.',
    '`mini` needs three colors, `top`, `body`, and `edge`, so the minis keep the slime\'s blues.',
  ])
})

test('overlapping eyes and a cheek in an eye box draw anyway, with notes', () => {
  const read = readPet({ sprite: ['aaaaaaa', 'aaaaaaa', 'aaaaaaa', 'aaaaaaa'], palette: { a: '#123456' }, eyes: [[0, 1], [2, 1]], cheeks: [[1, 2], [6, 3]] })
  expect(read.errors ? [] : read.notes).toEqual([
    'The eye boxes overlap, so the wide eyes and hearts merge into one shape. Pupils 4 pixels apart keep them apart.',
    'A cheek sits inside an eye box, where some faces draw over it.',
  ])
  expect(read.errors ? undefined : read.pet.cheekColor).toBe('#ff8aaa')
})

test('a pet with no eyes draws no faces, and its resting frame marks no pupils', () => {
  const body = animate(petOf({ sprite: ['.aaa.', 'aaaaa', 'aaaaa'], palette: { a: '#123456' } }))
  expect(body.eye).toEqual({})
  expect(restingFrame(body)).not.toContain('@')
})

test('a pet with fields this version does not know still reads', () => {
  const read = readPet({ ...slime, frames: { jump: [] }, author: 'someone' })
  expect(read.errors).toBeUndefined()
  expect(read.errors ? [] : read.notes).toEqual([])
})
