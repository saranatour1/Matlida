import { expect, test } from 'vitest'
import { REFRESH_EVERY_MS, handleSnapshot, snapshotKey } from '../lib/snapshots'
import type { SnapshotDeps, SnapshotMeta } from '../lib/snapshots'

const NAME = 'api/projects:list'

const fakeDeps = (fresh: unknown = [{ name: 'From Convex' }]) => {
  const store = new Map<string, { value: string; metadata: SnapshotMeta }>()
  const pending: Array<Promise<unknown>> = []
  const clock = { now: 1_000_000, runs: 0 }
  const deps: SnapshotDeps = {
    kv: {
      getWithMetadata: (key) =>
        Promise.resolve(store.get(key) ?? { value: null, metadata: null }),
      put: (key, value, { metadata }) => {
        store.set(key, { value, metadata })
        return Promise.resolve()
      },
    },
    waitUntil: (promise) => void pending.push(promise),
    now: () => clock.now,
    verify: (token) =>
      Promise.resolve(token.startsWith('good-') ? token.slice(5) : null),
    run: () => {
      clock.runs += 1
      return Promise.resolve(fresh as never)
    },
  }
  return { deps, store, clock, settle: () => Promise.all(pending) }
}

const post = (token: string | null, body: unknown) =>
  new Request('http://localhost/api/snapshot', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })

test('each user gets their own key for the same query and args', async () => {
  const args = { projectId: 'p1' }
  const a = await snapshotKey('alice', NAME, args)
  const b = await snapshotKey('bob', NAME, args)
  expect(a).not.toBe(b)
  expect(a).toBe(await snapshotKey('alice', NAME, { projectId: 'p1' }))
})

test('no token or a bad one gets a 401 and touches nothing', async () => {
  const { deps, store, settle } = fakeDeps()
  for (const token of [null, 'forged']) {
    const response = await handleSnapshot(
      post(token, { name: NAME, args: {} }),
      deps,
    )
    expect(response.status).toBe(401)
  }
  await settle()
  expect(store.size).toBe(0)
})

test('first read is null, then the result Convex gave, never what the browser sent', async () => {
  const { deps, store, settle } = fakeDeps()
  const body = { name: NAME, args: {}, value: [{ name: 'Forged' }] }

  const first = await handleSnapshot(post('good-alice', body), deps)
  expect(await first.json()).toBeNull()
  await settle()

  const second = await handleSnapshot(post('good-alice', body), deps)
  expect(await second.json()).toEqual([{ name: 'From Convex' }])
  expect(JSON.stringify([...store.values()])).not.toContain('Forged')
  // Bob reads nothing of Alice's.
  const bob = await handleSnapshot(post('good-bob', body), deps)
  expect(await bob.json()).toBeNull()
})

test('a bad function name or args is rejected', async () => {
  const { deps } = fakeDeps()
  for (const body of [
    { name: 'nope', args: {} },
    { name: NAME, args: [] },
    { name: NAME },
  ]) {
    const response = await handleSnapshot(post('good-alice', body), deps)
    expect(response.status).toBe(400)
  }
})

test('an entry re-runs its query on Convex at most once per refresh window', async () => {
  const { deps, store, clock, settle } = fakeDeps()
  const read = async () => {
    await handleSnapshot(post('good-alice', { name: NAME, args: {} }), deps)
    await settle()
  }

  await read() // missing: refreshes
  await read() // fresh: served from KV only
  clock.now += REFRESH_EVERY_MS - 1
  await read() // still inside the window
  expect(clock.runs).toBe(1)

  clock.now += 1
  await read() // window passed: refreshes, and stamps the time even though nothing changed
  expect(clock.runs).toBe(2)
  expect([...store.values()][0].metadata.refreshedAt).toBe(clock.now)
})
