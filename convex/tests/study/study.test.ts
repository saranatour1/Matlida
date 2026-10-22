import { convexTest } from 'convex-test'
import { generateObject } from 'ai'
import { DateTime } from 'luxon'
import { expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import { nextReview } from '../../components/study/decks'
import { gradeAnswer } from '../../lib/decide'
import schema from '../../schema'
import { modules, registerStudy } from '../../test.setup'
import type * as Ai from 'ai'
import type * as Decide from '../../lib/decide'

vi.mock('../../lib/budget', () => import('../../test.budget'))
vi.mock('../../lib/ai', () => ({ languageModel: {}, decisionModel: {} }))
vi.mock('ai', async (original) => ({
  ...(await original<typeof Ai>()),
  generateObject: vi.fn(),
}))
vi.mock('../../lib/decide', async (original) => ({
  ...(await original<typeof Decide>()),
  gradeAnswer: vi.fn(),
}))

const written = (items: Array<Record<string, unknown>>) =>
  vi.mocked(generateObject).mockResolvedValue({
    object: { title: 'Spanish basics', items },
  } as never)

const setup = async () => {
  const t = convexTest(schema, modules)
  registerStudy(t)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Ada' }),
    await ctx.db.insert('users', { name: 'Bob' }),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  return { asAda, asBob: t.withIdentity({ subject: bob }), projectId }
}

const NOW = Date.parse('2026-10-22T12:00:00Z')
const days = (at: number) =>
  Math.round(
    DateTime.fromMillis(at).diff(DateTime.fromMillis(NOW), 'days').days,
  )

test('reviews space out with right answers and start over on a miss', () => {
  const fresh = { interval: 0, ease: 2.5, reps: 0 }
  const first = nextReview(fresh, 'good', NOW)
  expect(days(first.due)).toBe(1)
  const second = nextReview(first, 'good', NOW)
  expect(days(second.due)).toBe(6)
  const third = nextReview(second, 'good', NOW)
  expect(days(third.due)).toBe(15)
  expect(days(nextReview(second, 'easy', NOW).due)).toBeGreaterThan(15)
  expect(days(nextReview(second, 'hard', NOW).due)).toBeLessThan(15)
  const missed = nextReview(third, 'again', NOW)
  expect(missed).toMatchObject({ reps: 0, interval: 0 })
  expect(missed.due - NOW).toBe(10 * 60_000)
  expect(missed.ease).toBeLessThan(third.ease)
})

test('a quiz keeps valid choice questions and turns broken ones into short answers', async () => {
  const { asAda, projectId } = await setup()
  written([
    {
      kind: 'choice',
      front: 'Hola means?',
      back: 'A greeting.',
      choices: ['Hello', 'Bye'],
      answer: 0,
    },
    {
      kind: 'choice',
      front: 'Gato means?',
      back: 'Cat',
      choices: ['Dog'],
      answer: 3,
    },
    { kind: 'short', front: 'Say thank you', back: 'Gracias' },
    { kind: 'short', front: 'One too many', back: '…' },
  ])
  const { deckId, count } = await asAda.action(api.api.study.make, {
    projectId,
    topic: 'Spanish basics',
    format: 'quiz',
    count: 3,
    level: 'beginner',
  })
  expect(count).toBe(3)
  const found = await asAda.query(api.api.study.deck, { id: deckId })
  expect(found?.items.map((i) => i.kind)).toEqual(['choice', 'short', 'short'])
  expect(await asAda.query(api.api.study.list, { projectId })).toMatchObject([
    { deck: { title: 'Spanish basics', format: 'quiz' }, due: 3 },
  ])
})

test('grading moves a card out of review, and only you can see or grade it', async () => {
  const { asAda, asBob, projectId } = await setup()
  written([{ kind: 'card', front: 'Perro', back: 'Dog' }])
  const { deckId } = await asAda.action(api.api.study.make, {
    projectId,
    topic: 'Spanish animals',
    format: 'cards',
    count: 3,
    level: 'beginner',
  })
  const found = await asAda.query(api.api.study.deck, { id: deckId })
  const card = found!.items[0]
  expect(await asBob.query(api.api.study.deck, { id: deckId })).toBeNull()
  await expect(
    asBob.mutation(api.api.study.grade, { id: card._id, grade: 'good' }),
  ).rejects.toThrow('Card not found.')
  await asAda.mutation(api.api.study.grade, { id: card._id, grade: 'good' })
  expect(await asAda.query(api.api.study.list, { projectId })).toMatchObject([
    { due: 0 },
  ])
})

test('Jev grades a short answer, and a wrong one comes back soon', async () => {
  const { asAda, projectId } = await setup()
  written([{ kind: 'short', front: 'Say thank you', back: 'Gracias' }])
  const { deckId } = await asAda.action(api.api.study.make, {
    projectId,
    topic: 'Spanish',
    format: 'quiz',
    count: 3,
    level: 'beginner',
  })
  const itemId = (await asAda.query(api.api.study.deck, { id: deckId }))!
    .items[0]._id
  vi.mocked(gradeAnswer).mockResolvedValue({ correct: false, cost: 0 })
  expect(
    await asAda.action(api.api.study.check, {
      deckId,
      itemId,
      answer: 'Por favor',
    }),
  ).toEqual({ correct: false, expected: 'Gracias' })
  expect(gradeAnswer).toHaveBeenCalledWith(expect.anything(), {
    question: 'Say thank you',
    expected: 'Gracias',
    answer: 'Por favor',
  })
  const [item] = (await asAda.query(api.api.study.deck, { id: deckId }))!.items
  expect(item.reps).toBe(0)
})

test('an answer, typed or said on a call, is checked only against your own cards', async () => {
  const { asAda, asBob, projectId } = await setup()
  written([{ kind: 'short', front: 'Say thank you', back: 'Gracias' }])
  const { deckId } = await asAda.action(api.api.study.make, {
    projectId,
    topic: 'Spanish',
    format: 'quiz',
    count: 3,
    level: 'beginner',
  })
  const itemId = (await asAda.query(api.api.study.deck, { id: deckId }))!
    .items[0]._id
  vi.mocked(gradeAnswer).mockResolvedValue({ correct: true, cost: 0 })
  await expect(
    asBob.action(api.api.study.check, { deckId, itemId, answer: 'Gracias' }),
  ).rejects.toThrow('Question not found.')
  expect(
    await asAda.action(api.api.study.check, {
      deckId,
      itemId,
      answer: 'gracias',
    }),
  ).toEqual({ correct: true, expected: 'Gracias' })
  const [item] = (await asAda.query(api.api.study.deck, { id: deckId }))!.items
  expect(item.reps).toBe(1)
})
