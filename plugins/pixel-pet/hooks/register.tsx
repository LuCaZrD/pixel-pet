import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Anim, Mode } from '../types'
import { TICK_MS, fail, step } from './anim'
import { BAR_W, FRAME_COLOR, HUD_WINDOW_W, hudFrom, hudRows, mood, windowEdges } from './hud'
import type { Hud } from './hud'
import { minisOnScreen, reconcile } from './minis'
import type { Mini } from './minis'
import { animate, readPet, restingFrame } from './pet'
import { previewPage } from './preview'
import { readSettings } from './settings'
import { BODY_W, FACES, MAX_MINIS, compose, encodeCells, encodeSvg, trailWidth } from './pixels'
import type { Body } from './pixels'
import { lineColor, statusLine, targetOf, toolMode } from './status'
import type { ToolMode } from './status'

const ROWS = 10 // a cell is two pixels tall, so the frames are 20 px high
const STATUS_ROOM = 20 // columns kept free beside a running pet for its status line
const USAGE_EVERY_BEATS = 20
const AGENTS_EVERY_BEATS = 5
const SLOW_BEATS: Partial<Record<Mode, number>> = { idle: 2, sleep: 4 } // ticks per redraw while nothing moves fast

const PET_KEY = 'pet' // in $.store: the pet file set_pet last took
const OWN_TOOLS = 'mcp__pixel-pet__'
// Literals, so `claude plugin validate` can read the hooks' matchers.
const SET_PET = 'mcp__pixel-pet__set_pet'
const PREVIEW_PET = 'mcp__pixel-pet__preview_pet'

const anim = atom({ plugin: 'pixel-pet', key: 'anim' } as const, {
  mode: 'idle',
  since: 0,
  x: 0,
  dir: 1,
  tick: 0,
  target: '',
  working: false,
} as Anim)

/** The HUD from fresh usage, or `last` when the usage call fails. */
async function usageOr($: EngineInterface, now: number, last: Hud | undefined) {
  try {
    return hudFrom(await $.session.usage(), now)
  } catch {
    return last
  }
}

/** The minis after a fresh look at the session's agents, or `last` when the list call fails. */
async function minisOr($: EngineInterface, now: number, last: Mini[]) {
  try {
    return reconcile(last, await $.agent.list(), now)
  } catch {
    return last
  }
}

/** What preview_pet and set_pet tell Claude about a pet: the clips and faces made, the resting frame, and readPet's notes. */
function petReport(pet: Body, notes: string[]) {
  const made = `${Object.keys(pet.clips).join(', ')}, and ${FACES.length} faces`
  const noted = notes.length > 0 ? `\n\nNotes, to act on or leave as drawn:\n- ${notes.join('\n- ')}` : ''

  return `The mod made every clip and face from the sprite: ${made}.\n\nResting frame (@ is a pupil, * a cheek):\n${restingFrame(pet)}${noted}`
}

/** The default slime, from the plugin's own pet file. */
async function slimeBody($: EngineInterface) {
  const read = readPet(JSON.parse(await $.fs.read(`${$.plugin.root}/assets/slime.json`)))
  if (read.errors) {
    throw new Error(`assets/slime.json: ${read.errors.join(' ')}`)
  }

  return animate(read.pet)
}

/** The pet set_pet kept in an earlier session, else the slime. A kept pet this version cannot read gives way to the slime, with a toast. */
async function keptBody($: EngineInterface) {
  const kept = await $.store.get(PET_KEY)
  if (kept !== undefined) {
    const read = readPet(kept)
    if (!read.errors) {
      return animate(read.pet)
    }
    $.ui.toast(`pixel-pet: your pet no longer reads (${read.errors[0]}). Showing the slime.`)
  }

  return slimeBody($)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)
  let isWorking = false
  let lastToolAt = 0
  let activeTools = 0
  let activeMode: ToolMode = 'bash'
  let activeTarget = ''
  let bodyColumns = 80
  let beat = 0
  let showsError = false
  let body: Body | undefined
  let hud: Hud | undefined
  let minis: Mini[] = []

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, anim, () => ({ mode: 'idle', since: now, x: 0, dir: 1, tick: 0, target: '', working: false }))
    hud = await usageOr($, now, undefined)
    try {
      await $.tool.register({
        name: 'preview_pet',
        description:
          'Writes the preview of a pixel pet to `path`: an HTML page with every motion and face the mod makes from its sprite. It does not change the pet on screen. `pet` is a pet in the format the `pixel-pet:new-pet` skill describes. Returns the resting frame and notes on anything repaired.',
        inputSchema: {
          type: 'object',
          properties: {
            pet: { type: 'object', description: 'The pet as a JSON object, in the format FORMAT.md documents.' },
            path: { type: 'string', description: 'Absolute path of the HTML file to write, such as one in the temp folder.' },
          },
          required: ['pet', 'path'],
        },
      })
      await $.tool.register({
        name: 'set_pet',
        description:
          'Sets the pixel pet drawn above the prompt, at once, and keeps it for later sessions. `pet` is a pet in the format the `pixel-pet:new-pet` skill describes, or null for the default slime. Returns the resting frame and notes on anything repaired.',
        inputSchema: {
          type: 'object',
          properties: { pet: { type: ['object', 'null'], description: 'The pet as a JSON object, or null for the default slime.' } },
          required: ['pet'],
        },
      })
    } catch {
      // Without the tools the pet still draws; only making a new one is missing.
    }

    $.clock.every(TICK_MS, async () => {
      const t = await $.clock.now()
      beat += 1
      if (beat % USAGE_EVERY_BEATS === 0) {
        hud = await usageOr($, t, hud)
        $.ui.invalidate('ui.render')
      }
      if (settings.minis && beat % AGENTS_EVERY_BEATS === 0) {
        minis = await minisOr($, t, minis)
      }

      const room = Math.max(0, bodyColumns - BODY_W - trailWidth(minis.length) - STATUS_ROOM)
      await update($, anim, a => {
        const moved = step(a, { isWorking, activeTools, activeMode, activeTarget, lastToolAt, room }, t, settings)
        // Minis hop on every tick, so they keep the redraw rate up while the pet idles.
        const slowBeat = minis.length > 0 ? undefined : SLOW_BEATS[moved.mode]
        return slowBeat !== undefined && moved.mode === a.mode && beat % slowBeat !== 0 ? a : moved
      })
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool.startsWith(OWN_TOOLS)) {
      return next(e)
    }
    const t = await $.clock.now()
    activeTools += 1
    activeMode = toolMode(e.tool)
    const input = e as unknown as Record<string, unknown>
    activeTarget = settings.targets ? targetOf(e.tool, input) : ''
    lastToolAt = t

    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      activeTools = Math.max(0, activeTools - 1)
      lastToolAt = await $.clock.now()
    }
    if ('deny' in result || ('isError' in result && result.isError)) {
      await update($, anim, a => fail(a, lastToolAt))
    }

    return result
  })

  on('tool.call', { tool: PREVIEW_PET }, async ($, e) => {
    const { pet, path } = e as unknown as { pet?: unknown; path?: unknown }
    const read = readPet(pet)
    if (read.errors) {
      return { deny: `No preview was written: ${read.errors.join(' ')}` }
    }
    if (typeof path !== 'string' || path === '') {
      return { deny: 'No preview was written: `path` is the HTML file to write.' }
    }
    const preview = animate(read.pet)
    await $.fs.write(path, previewPage(preview, read.notes))

    return { result: `Wrote the preview of ${read.pet.name} to ${path}. The pet on screen has not changed.\n\n${petReport(preview, read.notes)}` }
  })

  on('tool.call', { tool: SET_PET }, async ($, e) => {
    const value = (e as unknown as { pet?: unknown }).pet
    if (value === null || value === undefined) {
      await $.store.delete(PET_KEY)
      body = await slimeBody($)
      $.ui.invalidate('ui.render')

      return { result: 'The slime is back, for this session and later ones.' }
    }
    const read = readPet(value)
    if (read.errors) {
      return { deny: `The pet was not set: ${read.errors.join(' ')}` }
    }
    await $.store.set(PET_KEY, value)
    body = animate(read.pet)
    $.ui.invalidate('ui.render')

    return { result: `${read.pet.name} is above the prompt now, for this session and later ones.\n\n${petReport(body, read.notes)}` }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!settings.hud || !hud || e.surface !== 'terminal') {
      return next(e)
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    const edges = windowEdges(HUD_WINDOW_W)

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="column" marginLeft={1}>
          <Text color={FRAME_COLOR}>{edges.top}</Text>
          {hudRows(hud).map(r => (
            <Box key={r.key}>
              <Text color={FRAME_COLOR}>{edges.side}</Text>
              <Box width={HUD_WINDOW_W - 2} paddingLeft={1}>
                <Text color={r.color}>{r.label} </Text>
                <Raster key={`bar-${r.key}`} columns={BAR_W} rows={1} cells={r.cells} />
                {r.parts.map((p, i) => (
                  <Text key={String(i)} color={p.color} bold={p.bold} wrap="truncate">
                    {p.text}
                  </Text>
                ))}
              </Box>
              <Text color={FRAME_COLOR}>{edges.side}</Text>
            </Box>
          ))}
          <Text color={FRAME_COLOR}>{edges.bottom}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey) {
        return next(e)
      }
      isWorking = e.props.isWorking
      bodyColumns = e.props.bodyColumns

      if (!body) {
        body = await keptBody($)
      }
      const a = await read($, anim)
      const now = await $.clock.now()
      const elapsed = now - a.since
      const views = minisOnScreen(minis, now)
      const picture = compose(body, a.mode, elapsed * settings.pace, a.dir, hud ? mood(hud) : 'ok', views)
      const extra = views.length > MAX_MINIS ? ` (+${views.length - MAX_MINIS} minis)` : ''
      const line = settings.statusLine ? statusLine(a.mode, a.since, elapsed, a.target) + extra : ''
      if (showsError) {
        showsError = false
        $.ui.status(undefined)
      }

      if (e.surface === 'terminal') {
        const { Box, Raster, Text } = $.ui.resolve(e)
        const room = Math.max(0, bodyColumns - picture.w - line.length - 4)

        return (
          <Box height={ROWS}>
            <Box marginLeft={Math.min(Math.round(a.x), room)} alignItems="flex-end">
              <Raster key="pet" columns={picture.w} rows={ROWS} cells={encodeCells(picture)} />
              {line && (
                <Box marginBottom={1} marginLeft={1}>
                  <Text color={lineColor(a.mode)} bold>
                    › {line}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        )
      }
      if (e.surface === 'desktop') {
        const { Box, Svg, Text } = $.ui.resolve(e)

        return (
          <Box alignItems="flex-end">
            <Box marginLeft={Math.round(a.x)}>
              <Svg source={encodeSvg(picture)} alt={`${body.name}, ${a.mode}`} width={picture.w * 4} height={80} />
            </Box>
            {line && (
              <Text color={lineColor(a.mode)} bold>
                {line}
              </Text>
            )}
          </Box>
        )
      }

      return next(e)
    } catch (err) {
      showsError = true
      $.ui.status(`pixel-pet: ${String(err)}`)

      return next(e)
    }
  })
}
