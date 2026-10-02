import type { Mode } from '../types'
import { BODY_W, FACES, HEIGHT, MODES, compose, composeFace } from './pixels'
import type { Body, Canvas, Clip } from './pixels'

// When each mode plays, in the words of the README's table.
const WHEN: Record<Mode, string> = {
  idle: 'Claude is idle',
  sleep: 'Idle for a while',
  jump: 'A turn starts',
  think: 'Claude thinks longer',
  read: 'Read',
  search: 'Grep, Glob',
  edit: 'Edit, MultiEdit, Write, NotebookEdit, TodoWrite',
  bash: 'Bash, and any tool not listed',
  web: 'WebFetch, WebSearch',
  run: 'A tool call ends',
  agent: 'A subagent starts',
  error: 'A tool call fails',
  cheer: 'A turn ends',
}
const MOTION_FPS = 10
const FACE_FPS = 5
const LOOP_MS = 2400

// One character per palette entry; the set leaves out what would need escaping in HTML or a JS string.
const CODES = [...Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).filter(c => !`"'\\<>&\``.includes(c)), ...Array.from({ length: 200 }, (_, i) => String.fromCharCode(192 + i))]

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

type Tile = { label: string; note: string; w: number; h: number; fps: number; frames: string[] }

/**
 * The preview: a self-contained HTML page with every motion, face, and frame the mod makes for `body`. It shows each mode in
 * motion with when it plays, each face, and each clip's frames before eyes go on. A button switches to a light
 * terminal's background. `notes` are readPet's.
 */
export function previewPage(body: Body, notes: string[]): string {
  const colors: number[] = []
  const encode = (c: Canvas) =>
    c.px
      .map(color => {
        if (color === -1) {
          return ' '
        }
        let i = colors.indexOf(color)
        if (i === -1) {
          i = colors.push(color) - 1
        }
        return CODES[i] ?? ' '
      })
      .join('')
  const frames = (count: number, fps: number, draw: (t: number) => Canvas) => Array.from({ length: count }, (_, i) => draw((i * 1000) / fps))

  const motions: Tile[] = (Object.keys(WHEN) as Mode[]).map(mode => {
    const length = MODES[mode].once ?? LOOP_MS
    const minis = mode === 'agent' ? [{ age: 1000 }, { age: 400 }] : []
    const shots = frames(Math.ceil((length / 1000) * MOTION_FPS), MOTION_FPS, t => compose(body, mode, t, 1, 'ok', minis.map(m => ({ age: m.age + t }))))
    const first = shots[0] as Canvas
    return { label: mode, note: WHEN[mode], w: first.w, h: first.h, fps: MOTION_FPS, frames: shots.map(encode) }
  })
  const faces: Tile[] = FACES.map(name => {
    const shots = frames((LOOP_MS / 1000) * FACE_FPS, FACE_FPS, t => composeFace(body, name, t))
    const first = shots[0] as Canvas
    return { label: name, note: '', w: first.w, h: first.h, fps: FACE_FPS, frames: shots.map(encode) }
  })
  const clips: Tile[] = (Object.keys(body.clips) as Clip[]).map(clip => {
    const { fps, frames: list } = body.clips[clip]
    const shots = list.map(f => {
      const c: Canvas = { w: BODY_W, h: HEIGHT, px: [] }
      for (const row of f.g) {
        for (const ch of row) {
          c.px.push(body.palette[ch] ?? -1)
        }
      }
      return c
    })
    return { label: clip, note: `${list.length} frames at ${fps} fps`, w: BODY_W, h: HEIGHT, fps, frames: shots.map(encode) }
  })
  const palette = colors.map(c => `#${c.toString(16).padStart(6, '0')}`)
  const name = escapeHtml(body.name)
  const tiles = (list: Tile[], kind: string) =>
    list.map((t, i) => `<figure><canvas data-kind="${kind}" data-i="${i}" width="${t.w * 4}" height="${t.h * 4}"></canvas><figcaption><b>${t.label}</b>${t.note ? `<span>${escapeHtml(t.note)}</span>` : ''}</figcaption></figure>`).join('')
  const noteList = notes.length > 0 ? `<section class="notes"><h2>Notes</h2><ul>${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></section>` : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}: preview</title>
<style>
  body { margin: 0; padding: 32px; font: 15px/1.5 ui-monospace, Menlo, monospace; background: #0b0f2a; color: #e3e8ff; }
  body.light { background: #f4f5f9; color: #1b1e2b; }
  header { display: flex; flex-wrap: wrap; gap: 16px; align-items: baseline; justify-content: space-between; max-width: 1100px; }
  h1 { margin: 0; font-size: 28px; }
  h2 { font-size: 18px; margin: 32px 0 12px; }
  p { margin: 4px 0 0; opacity: 0.8; }
  button { font: inherit; padding: 8px 14px; border: 2px solid currentColor; background: transparent; color: inherit; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; max-width: 1100px; }
  figure { margin: 0; padding: 12px; border: 2px solid #2a3470; display: grid; gap: 8px; justify-items: center; }
  body.light figure { border-color: #c9cede; }
  canvas { image-rendering: pixelated; max-width: 100%; }
  figcaption { display: grid; text-align: center; }
  figcaption span { font-size: 12px; opacity: 0.7; }
  .notes { max-width: 1100px; border: 2px solid #e0b400; padding: 0 16px 8px; }
</style>
</head>
<body>
<header>
  <div><h1>${name}</h1><p>Every state the mod made from the sprite. Approve it in Claude Code, or say what to change.</p></div>
  <button type="button" aria-pressed="false" id="light">Light terminal</button>
</header>
${noteList}
<h2>Motions</h2>
<div class="grid">${tiles(motions, 'motion')}</div>
<h2>Faces</h2>
<div class="grid">${tiles(faces, 'face')}</div>
<h2>Frames</h2>
<p>Each clip as the mod squashes and stretches the sprite, before eyes and props go on.</p>
<div class="grid">${tiles(clips, 'clip')}</div>
<script>
const PALETTE = ${JSON.stringify(palette)}
const CODES = ${JSON.stringify(CODES.slice(0, palette.length).join(''))}
const TILES = { motion: ${JSON.stringify(motions)}, face: ${JSON.stringify(faces)}, clip: ${JSON.stringify(clips)} }
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const canvases = [...document.querySelectorAll('canvas')].map(c => ({ ctx: c.getContext('2d'), tile: TILES[c.dataset.kind][c.dataset.i] }))
function draw(ctx, tile, frame) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (let i = 0; i < frame.length; i++) {
    const k = CODES.indexOf(frame[i])
    if (k < 0) continue
    ctx.fillStyle = PALETTE[k]
    ctx.fillRect((i % tile.w) * 4, Math.floor(i / tile.w) * 4, 4, 4)
  }
}
function loop(now) {
  for (const { ctx, tile } of canvases) draw(ctx, tile, tile.frames[still ? 0 : Math.floor((now / 1000) * tile.fps) % tile.frames.length])
  if (!still) requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
const light = document.getElementById('light')
light.onclick = () => light.setAttribute('aria-pressed', String(document.body.classList.toggle('light')))
</script>
</body>
</html>
`
}
