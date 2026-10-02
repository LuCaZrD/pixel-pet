import { BODY_W, EYE_COLOR, HEIGHT } from './pixels'
import type { Body, BodyFrame } from './pixels'

/** A pet as its file spells it. `skills/new-pet/FORMAT.md` documents each field for the people who write one. */
export type Pet = {
  name: string
  scale: number
  sprite: string[]
  palette: Record<string, string>
  outline?: string
  eyes?: [[number, number], [number, number]] // absent: no eyes and no faces
  eyeColor: string
  cheeks?: [[number, number], [number, number]]
  cheekColor?: string
  mini: { top: string; body: string; edge: string }
}

// The frames mark cheeks and sparkles, and the resting frame pupils, with characters a palette may not use.
const CHEEK_MARK = '*'
const SPARKLE_MARK = '+'
const PUPIL_MARK = '@'
const RESERVED = ['.', CHEEK_MARK, SPARKLE_MARK, PUPIL_MARK]
const SPARKLE_COLOR = 0xffe25a
const SLIME_MINI = { top: '#9ad2ff', body: '#3d84f0', edge: '#1e3a8a' }

// Each pose squashes the sprite by sx, sy and lifts it by dy pixels, all before `scale`. The run and jump poses
// also carry an eye hint. Tuned on the slime; any pet that fits the canvas reuses them.
type Pose = [sx: number, sy: number, dy: number, hint?: string]
const STAND: Pose[] = Array.from({ length: 16 }, (_, i) => {
  const s = (1 - Math.cos((2 * Math.PI * i) / 16)) / 2
  return [1 + 0.06 * s, 1 - 0.09 * s, 0]
})
const RUN: Pose[] = [[1.18, 0.74, 0, 'open'], [0.86, 1.22, 1, 'wide'], [0.9, 1.15, 4, 'wide'], [0.95, 1.05, 6, 'open'], [0.92, 1.12, 4, 'open'], [0.9, 1.18, 1, 'open'], [1.22, 0.7, 0, 'bar'], [1.08, 0.9, 0, 'open']]
const JUMP: Pose[] = [[1.15, 0.8, 0, 'open'], [1.22, 0.7, 0, 'bar'], [0.85, 1.25, 2, 'wide'], [0.88, 1.2, 5, 'wide'], [0.92, 1.12, 8, 'wide'], [0.96, 1.04, 9, 'open'], [1, 1, 9, 'open'],
  [0.96, 1.04, 8, 'open'], [0.92, 1.1, 6, 'open'], [0.9, 1.15, 3, 'open'], [0.9, 1.2, 1, 'open'], [1.25, 0.68, 0, 'bar'], [1.12, 0.85, 0, 'bar'], [1.04, 0.95, 0, 'open']]
const THINK: Pose[] = Array.from({ length: 12 }, (_, i) => {
  const wobble = 1 + 0.03 * Math.sin((2 * Math.PI * i) / 6)
  return [wobble, 2 - wobble, 0]
})
const CHEER: Pose[] = [[1, 1, 0], [1.18, 0.8, 0], [0.9, 1.18, 2], [0.95, 1.08, 4], [0.98, 1.02, 4], [0.92, 1.12, 2], [1.2, 0.76, 0], [0.88, 1.2, 2], [0.95, 1.08, 4],
  [0.98, 1.02, 4], [0.92, 1.12, 2], [1.2, 0.76, 0], [0.88, 1.2, 2], [0.95, 1.08, 4], [0.98, 1.02, 4], [0.92, 1.12, 2], [1.2, 0.76, 0], [1, 1, 0]]
const POSES = [...STAND, ...RUN, ...JUMP, ...THINK, ...CHEER]

function sparkle(x: number, y: number, isBig: boolean): [number, number][] {
  return isBig ? [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] : [[x, y]]
}

const cheerSparkles = (i: number) =>
  i % 3 ? [...sparkle(2, 8, i % 2 === 0), ...sparkle(16, 6, i % 2 === 1)] : [...sparkle(3, 6, true), ...sparkle(15, 9, false)]

// Round half to even. The frames pet.test.ts pins depend on it.
function roundHalfEven(v: number) {
  const r = Math.round(v)
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

/** The largest sprite, in pixels, that fits the canvas in every pose at `scale`. */
export function maxSize(scale: number) {
  return {
    w: Math.floor(Math.min(...POSES.map(([sx]) => BODY_W / (sx * scale))) + 1e-9),
    h: Math.floor(Math.min(...POSES.map(([, sy, dy]) => (HEIGHT / scale - dy) / sy)) + 1e-9),
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isPoint = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(n => Number.isInteger(n))
const isPair = (v: unknown): v is [[number, number], [number, number]] => Array.isArray(v) && v.length === 2 && v.every(isPoint)

/** `#rrggbb` from `#rrggbb` or `#rgb`, or undefined for anything else. */
function color(v: unknown) {
  if (typeof v !== 'string') {
    return undefined
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    return v.toLowerCase()
  }

  return /^#[0-9a-fA-F]{3}$/.test(v) ? `#${[...v.slice(1)].map(c => c + c).join('')}`.toLowerCase() : undefined
}

/** The largest scale, up to `scale`, at which a w×h sprite fits the canvas in every pose. */
function fitScale(w: number, h: number, scale: number) {
  const fits = Math.min(scale, ...POSES.map(([sx, sy, dy]) => Math.min(BODY_W / (sx * w), HEIGHT / (dy + sy * h))))

  return fits < scale ? Math.floor(fits * 100) / 100 : scale
}

/**
 * A pet from a parsed pet file, or why there is none. Only a value with no sprite is refused. Anything else
 * draws: the mod repairs what it can and says what it did in `notes`, which the drawer may act on or ignore.
 */
export function readPet(v: unknown): { pet: Pet; notes: string[]; errors?: undefined } | { errors: string[] } {
  if (!isObject(v)) {
    return { errors: ['A pet is a JSON object with a `sprite`.'] }
  }
  if (!Array.isArray(v.sprite) || !v.sprite.some(r => typeof r === 'string' && r.length > 0)) {
    return { errors: ['`sprite` is a list of text rows, one character per pixel.'] }
  }
  const notes: string[] = []
  const name = typeof v.name === 'string' && v.name.trim() !== '' ? v.name.trim().slice(0, 24) : 'pet'

  let rows = (v.sprite as unknown[]).map(r => (typeof r === 'string' ? r : ''))
  const w = Math.max(...rows.map(r => r.length))
  if (rows.some(r => r.length !== w)) {
    notes.push(`Rows of different widths were padded with "." to ${w}.`)
    rows = rows.map(r => r.padEnd(w, '.'))
  }
  if (rows.some(r => RESERVED.slice(1).some(c => r.includes(c)))) {
    notes.push(`The sprite's ${RESERVED.slice(1).map(c => `"${c}"`).join(', ')} pixels are drawn clear: the mod marks its own drawings with them.`)
    rows = rows.map(r => r.replace(/[*+@]/g, '.'))
  }
  const h = rows.length

  const palette: Record<string, string> = {}
  for (const [ch, value] of Object.entries(isObject(v.palette) ? v.palette : {})) {
    const c = color(value)
    if (c === undefined) {
      notes.push(`The palette color for "${ch}", ${JSON.stringify(value)}, is not "#rrggbb", so "${ch}" is drawn clear.`)
    } else if (!RESERVED.includes(ch)) {
      palette[ch] = c
    }
  }
  const uncolored = [...new Set(rows.join(''))].filter(c => c !== '.' && !(c in palette))
  if (uncolored.length > 0) {
    notes.push(`${uncolored.map(c => `"${c}"`).join(', ')} has no palette color, so it is drawn clear.`)
  }

  const asked = typeof v.scale === 'number' && v.scale > 0 ? v.scale : 1
  const scale = fitScale(w, h, asked)
  if (scale < asked) {
    notes.push(`A ${w}×${h} sprite is drawn at scale ${scale} to fit every pose. At scale 1 the largest is ${maxSize(1).w}×${maxSize(1).h}, and a smaller scale blurs detail.`)
  }

  const outline = typeof v.outline === 'string' && v.outline in palette ? v.outline : undefined
  const eyes = isPair(v.eyes) ? v.eyes : undefined
  if (v.eyes !== undefined && eyes === undefined) {
    notes.push('`eyes` is two [x, y] points, so the pet has no eyes and no faces.')
  }
  const inside = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h
  for (const [x, y] of eyes ?? []) {
    if (!inside(x, y - 1) || !inside(x + 2, y + 1)) {
      notes.push(`The eye at [${x}, ${y}] draws its 3×3 box partly off the ${w}×${h} sprite.`)
    }
  }
  if (eyes && Math.abs(eyes[0][0] - eyes[1][0]) < 3 && Math.abs(eyes[0][1] - eyes[1][1]) < 3) {
    notes.push('The eye boxes overlap, so the wide eyes and hearts merge into one shape. Pupils 4 pixels apart keep them apart.')
  }
  const cheeks = isPair(v.cheeks) ? v.cheeks : undefined
  if (v.cheeks !== undefined && cheeks === undefined) {
    notes.push('`cheeks` is two [x, y] pixels, so the pet has no cheeks.')
  }
  const inEyeBox = ([x, y]: [number, number]) => (eyes ?? []).some(([ex, ey]) => x >= ex && x <= ex + 2 && y >= ey - 1 && y <= ey + 1)
  if (cheeks?.some(inEyeBox)) {
    notes.push('A cheek sits inside an eye box, where some faces draw over it.')
  }
  const mini = isObject(v.mini) ? { top: color(v.mini.top), body: color(v.mini.body), edge: color(v.mini.edge) } : undefined
  const hasMini = mini?.top !== undefined && mini.body !== undefined && mini.edge !== undefined
  if (v.mini !== undefined && !hasMini) {
    notes.push('`mini` needs three colors, `top`, `body`, and `edge`, so the minis keep the slime\'s blues.')
  }

  return {
    pet: {
      name,
      scale,
      sprite: rows,
      palette,
      outline,
      eyes,
      eyeColor: color(v.eyeColor) ?? '#000000',
      cheeks,
      cheekColor: cheeks ? (color(v.cheekColor) ?? '#ff8aaa') : undefined,
      mini: hasMini ? (mini as Pet['mini']) : SLIME_MINI,
    },
    notes,
  }
}

const colorOf = (color: string) => parseInt(color.slice(1), 16)

function poseFrame(pet: Pet, pose: Pose, extra: [number, number][] = []): BodyFrame {
  const [sx, sy, dy] = [pose[0] * pet.scale, pose[1] * pet.scale, pose[2] * pet.scale]
  const sw = (pet.sprite[0] as string).length
  const sh = pet.sprite.length
  const cx = sw / 2
  const tcx = sw % 2 ? BODY_W / 2 : Math.floor(BODY_W / 2) // whole-pixel aligned, so at scale 1 a resting sprite is copied, not resampled
  const tb = HEIGHT - dy
  const g = Array.from({ length: HEIGHT }, () => new Array<string>(BODY_W).fill('.'))
  const put = (x: number, y: number, ch: string) => {
    const [px, py] = [roundHalfEven(x), roundHalfEven(y)]
    if (px >= 0 && px < BODY_W && py >= 0 && py < HEIGHT) {
      ;(g[py] as string[])[px] = ch
    }
  }
  // Each canvas pixel takes the sprite color that covers most of it; the outline counts extra, so it survives a squash.
  for (let ty = 0; ty < HEIGHT; ty++) {
    for (let tx = 0; tx < BODY_W; tx++) {
      const u0 = cx + (tx - tcx) / sx
      const u1 = cx + (tx + 1 - tcx) / sx
      const v0 = sh - (tb - ty) / sy
      const v1 = sh - (tb - ty - 1) / sy
      const cover = new Map<string, number>()
      for (let v = Math.max(0, Math.floor(v0)); v < Math.min(sh, Math.ceil(v1)); v++) {
        for (let u = Math.max(0, Math.floor(u0)); u < Math.min(sw, Math.ceil(u1)); u++) {
          const area = (Math.min(u1, u + 1) - Math.max(u0, u)) * (Math.min(v1, v + 1) - Math.max(v0, v))
          const ch = (pet.sprite[v] as string)[u] as string
          if (area > 0 && ch !== '.') {
            cover.set(ch, (cover.get(ch) ?? 0) + area * (ch === pet.outline ? 1.6 : 1))
          }
        }
      }
      let total = 0
      let best = ''
      for (const [ch, area] of cover) {
        total += area
        if (best === '' || area > (cover.get(best) as number)) {
          best = ch
        }
      }
      if (best !== '' && total >= 0.45 * (u1 - u0) * (v1 - v0)) {
        ;(g[ty] as string[])[tx] = best
      }
    }
  }
  const at = ([x, y]: [number, number]) => [tcx + (x - cx) * sx, tb - (sh - y) * sy] as const
  for (const [x, y] of pet.cheeks ?? []) {
    const [px, py] = at([x + 0.5, y + 0.5])
    put(px - 0.5, py - 0.5, CHEEK_MARK)
  }
  for (const [x, y] of extra) {
    put(x, y, SPARKLE_MARK)
  }
  const [l, r] = (pet.eyes ?? [[0, 0], [0, 0]]).map(([x, y]) => {
    const [px, py] = at([x + 1.5, y + 0.5])
    return [Math.floor(px - 1.5 + 0.5), Math.floor(py - 0.5 + 0.5) - 1] as [number, number]
  }) as [[number, number], [number, number]]

  return { g: g.map(row => row.join('')), l, r, e: pose[3] ?? '' }
}

/** The pet's frames for every clip, with its colors as the drawing code reads them. */
export function animate(pet: Pet): Body {
  const palette: Record<string, number> = { [SPARKLE_MARK]: SPARKLE_COLOR }
  for (const [ch, color] of Object.entries(pet.palette)) {
    palette[ch] = colorOf(color)
  }
  if (pet.cheekColor !== undefined) {
    palette[CHEEK_MARK] = colorOf(pet.cheekColor)
  }

  return {
    name: pet.name,
    w: BODY_W,
    h: HEIGHT,
    palette,
    eye: pet.eyes ? { ...EYE_COLOR, K: colorOf(pet.eyeColor) } : {},
    mini: { top: colorOf(pet.mini.top), body: colorOf(pet.mini.body), edge: colorOf(pet.mini.edge) },
    clips: {
      stand: { fps: 8, frames: STAND.map(p => poseFrame(pet, p)) },
      run: { fps: 12, frames: RUN.map(p => poseFrame(pet, p)) },
      jump: { fps: 12, frames: JUMP.map(p => poseFrame(pet, p)) },
      think: { fps: 6, frames: THINK.map(p => poseFrame(pet, p)) },
      cheer: { fps: 10, frames: CHEER.map((p, i) => poseFrame(pet, p, cheerSparkles(i))) },
    },
  }
}

/** The resting frame as text, trimmed to the rows in use: palette characters, `@` for a pupil, `*` for a cheek. */
export function restingFrame(body: Body) {
  const frame = body.clips.stand.frames[0] as BodyFrame
  const g = frame.g.map(row => [...row])
  for (const [x, y] of Object.keys(body.eye).length > 0 ? [frame.l, frame.r] : []) {
    for (const [dx, dy] of [[0, 1], [1, 1], [0, 2], [1, 2]] as const) {
      const row = g[y + dy]
      if (row && x + dx >= 0 && x + dx < row.length) {
        row[x + dx] = PUPIL_MARK
      }
    }
  }
  const rows = g.map(r => r.join(''))

  return rows.slice(rows.findIndex(r => /[^.]/.test(r))).join('\n')
}
