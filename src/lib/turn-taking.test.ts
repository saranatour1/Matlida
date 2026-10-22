import { describe, expect, test } from 'vitest'
import { hear, startListening } from './turn-taking'
import type { TurnEvent } from './turn-taking'

const LOUD = 0.2
const QUIET = 0.001
/** Between the normal bar and the bar while the assistant talks: its own voice leaking in. */
const ECHO = 0.04

type Segment = { ms: number; level: number }

/**
 * Feeds 50 ms microphone samples through `hear`, the way the call loop does,
 * and returns each non-"none" event with the time it fired. `replying` flips
 * to false on "pause", true on "resume", like the audio does.
 */
const run = (segments: Array<Segment>, { replying = false } = {}) => {
  let state = startListening(0)
  let playing = replying
  let paused = false
  let now = 0
  const events: Array<[TurnEvent, number]> = []
  for (const { ms, level } of segments) {
    for (const end = now + ms; now < end; now += 50) {
      const { next, event } = hear(state, {
        level,
        now,
        replying: playing,
        paused,
      })
      state = next
      if (event === 'none') continue
      events.push([event, now])
      if (event === 'pause') [playing, paused] = [false, true]
      if (event === 'resume' || event === 'send' || event === 'restart') {
        return events
      }
    }
  }
  return events
}

describe('your turn', () => {
  test('ends after a long quiet, not at a mid-sentence pause', () => {
    const events = run([
      { ms: 500, level: QUIET },
      { ms: 1000, level: LOUD },
      { ms: 900, level: QUIET },
      { ms: 800, level: LOUD },
      { ms: 2000, level: QUIET },
    ])
    expect(events.map(([e]) => e)).toEqual(['hearing', 'send'])
    const [, sentAt] = events[1] ?? []
    expect(sentAt).toBeGreaterThan(3200 + 1200 - 100)
  })

  test('is cut at the 30 s limit if you never stop', () => {
    expect(run([{ ms: 31_000, level: LOUD }]).map(([e]) => e)).toEqual([
      'hearing',
      'send',
    ])
  })

  test('restarts the recording after 15 s of nothing', () => {
    expect(run([{ ms: 16_000, level: QUIET }])).toEqual([['restart', 15_050]])
  })
})

describe('talking over the assistant', () => {
  test('a cough does not pause it', () => {
    expect(
      run(
        [
          { ms: 100, level: LOUD },
          { ms: 3000, level: QUIET },
        ],
        { replying: true },
      ),
    ).toEqual([])
  })

  test('its own voice leaking into the mic does not pause it', () => {
    expect(run([{ ms: 3000, level: ECHO }], { replying: true })).toEqual([])
  })

  test('a quarter second of talking pauses it', () => {
    const events = run([{ ms: 1000, level: LOUD }], { replying: true })
    expect(events).toEqual([['pause', 250]])
  })

  test('an "mm-hm" pauses it briefly, then it carries on', () => {
    const events = run(
      [
        { ms: 400, level: LOUD },
        { ms: 2000, level: QUIET },
      ],
      { replying: true },
    )
    expect(events.map(([e]) => e)).toEqual(['pause', 'resume'])
    const [, resumedAt] = events[1] ?? []
    expect(resumedAt).toBeLessThan(400 + 600 + 200)
  })

  test('really interrupting sends your turn instead of resuming', () => {
    const events = run(
      [
        { ms: 2000, level: LOUD },
        { ms: 2000, level: QUIET },
      ],
      { replying: true },
    )
    expect(events.map(([e]) => e)).toEqual(['pause', 'send'])
  })

  test('never restarts while it is talking', () => {
    expect(run([{ ms: 20_000, level: QUIET }], { replying: true })).toEqual([])
  })
})
