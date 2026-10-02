import { expect, test } from 'claude-code/testing'

import { EYE_COLOR, MAX_MINIS, MODES, compose, encodeCells, expressionName, frameIndex } from './pixels'
import type { Body } from './pixels'

// A stub pet: a solid block with the eye boxes where the slime's first stand frame has them.
const frame = { g: Array.from({ length: 20 }, (_, y) => (y >= 12 ? '..dddddddddddddd...' : '...................')), l: [5, 13], r: [10, 13], e: 'open' } as Body['clips']['stand']['frames'][number]
const clip = { fps: 8, frames: [frame, frame] }
const body: Body = {
  name: 'block',
  w: 19,
  h: 20,
  palette: { d: 0x3d84f0 },
  eye: EYE_COLOR,
  mini: { top: 0x9ad2ff, body: 0x3d84f0, edge: 0x1e3a8a },
  clips: { stand: clip, run: clip, jump: clip, think: clip, cheer: clip },
}

test('a loop clip wraps and a one-shot clip holds its last frame', () => {
  expect(frameIndex(8, 12, 0, true)).toBe(0)
  expect(frameIndex(8, 12, 1000 / 12, true)).toBe(1)
  expect(frameIndex(8, 12, 8000 / 12, true)).toBe(0)
  expect(frameIndex(14, 12, 60000, false)).toBe(13)
})

test('two pixels become one half-block cell, a clear one the terminal default', () => {
  expect(encodeCells({ w: 1, h: 2, px: [0xff0000, -1] })).toBe('gCUAAAAA/wAAAAAB')
  expect(encodeCells({ w: 1, h: 2, px: [-1, -1] })).toBe('IAAAAAAAAAEAAAAB')
})

test('an eye sequence loops by its own lengths', () => {
  expect(expressionName('idle', 0, '')).toBe('open')
  expect(expressionName('idle', 2500, '')).toBe('blink')
  expect(expressionName('edit', 3100, '')).toBe('blink')
  expect(expressionName('run', 0, 'bar')).toBe('blink')
  expect(expressionName('idle', 0, '', 'critical')).toBe('dizzy')
  expect(expressionName('edit', 0, '', 'critical')).toBe('focus')
})

test('every mode draws a canvas of its size, with a prop only where the mode has one', () => {
  for (const mode of Object.keys(MODES) as (keyof typeof MODES)[]) {
    for (const t of [0, 500, 1300, 2900]) {
      const c = compose(body, mode, t, 1)
      expect(c.h).toBe(20)
      expect(c.w).toBe(MODES[mode].prop ? 33 : 19)
      expect(c.px.length).toBe(c.w * c.h)
    }
  }
})

test('a running pet facing left is the mirror of one facing right', () => {
  const right = compose(body, 'run', 100, 1)
  const left = compose(body, 'run', 100, -1)
  for (let y = 0; y < 20; y++) {
    expect(left.px.slice(y * 19, y * 19 + 19)).toEqual(right.px.slice(y * 19, y * 19 + 19).reverse())
  }
})

test('each mini widens the picture by its trail, up to MAX_MINIS', () => {
  const mini = { age: 1000 }
  expect(compose(body, 'idle', 0, 1, 'ok', [mini]).w).toBe(19 + 6)
  expect(compose(body, 'read', 0, 1, 'ok', [mini, mini]).w).toBe(33 + 12)
  expect(compose(body, 'idle', 0, 1, 'ok', Array.from({ length: MAX_MINIS + 3 }, () => mini)).w).toBe(19 + MAX_MINIS * 6)
})

test('the trail stays behind the pet: left when running right, right when running left', () => {
  const minis = [{ age: 1000 }]
  const right = compose(body, 'run', 100, 1, 'ok', minis)
  const left = compose(body, 'run', 100, -1, 'ok', minis)
  const filled = (c: typeof right, x0: number, x1: number) => {
    for (let y = 0; y < c.h; y++) {
      for (let x = x0; x < x1; x++) {
        if ((c.px[y * c.w + x] as number) !== -1) {
          return true
        }
      }
    }
    return false
  }
  expect(filled(right, 0, 6)).toBe(true)
  expect(filled(left, left.w - 6, left.w)).toBe(true)
})

test('a time before the mode began draws its first frame', () => {
  for (const mode of Object.keys(MODES) as (keyof typeof MODES)[]) {
    expect(compose(body, mode, -250, 1).px).toEqual(compose(body, mode, 0, 1).px)
  }
})
