import { expect, test } from 'vitest'
import { MAX_VOLUME, clampVolume } from './use-call-volume'

test('the volume stays between silent and 150%, in whole percents', () => {
  expect(clampVolume(-0.2)).toBe(0)
  expect(clampVolume(0.333)).toBe(0.33)
  expect(clampVolume(1.9)).toBe(MAX_VOLUME)
  // A step down from 0.3 lands on 0.2, not 0.19999999999999998.
  expect(clampVolume(0.3 - 0.1)).toBe(0.2)
})
