import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import { CHANNELS } from '../../lib/channels'
import schema from '../../schema'
import { modules } from '../../test.setup'

afterEach(() => {
  vi.unstubAllEnvs()
})

const setup = async () => {
  // Start from nothing set, whatever the shell exported.
  for (const name of new Set(CHANNELS.flatMap((c) => c.env))) {
    vi.stubEnv(name, '')
  }
  const t = convexTest(schema, modules)
  const [ada, bob] = await t.run(async (ctx) => [
    await ctx.db.insert('users', {}),
    await ctx.db.insert('users', {}),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const projectId = await asAda.mutation(api.api.projects.save, {
    name: 'Matilda',
    brief: '',
    guidelines: '',
  })
  const statuses = async () => {
    const list = await asAda.query(api.api.channels.list, { projectId })
    return Object.fromEntries(list.map((s) => [s.id, s]))
  }
  return {
    t,
    ada,
    asBob: t.withIdentity({ subject: bob }),
    projectId,
    statuses,
  }
}

test('with nothing set up, messaging needs the deployment and the tools are on', async () => {
  const { statuses } = await setup()
  const byId = await statuses()
  expect(byId.telegram).toMatchObject({
    status: 'needs_setup',
    missing: ['PHOTON_PROJECT_ID', 'PHOTON_API_KEY', 'PHOTON_WEBHOOK_SECRET'],
  })
  expect(byId.email).toMatchObject({
    status: 'needs_setup',
    missing: ['MAIL_DOMAIN', 'PHOTON_PROJECT_ID', 'PHOTON_API_KEY'],
  })
  expect(byId.phone.status).toBe('needs_setup')
  expect(byId.web_search).toMatchObject({
    status: 'connected',
    detail: 'perplexity/sonar',
  })
  expect(byId.voice_replies.status).toBe('connected')
})

test('a linked app is connected, the others are ready, and no value leaks', async () => {
  const { t, ada, projectId, statuses } = await setup()
  vi.stubEnv('SPECTRUM_PROJECT_ID', 'project-value')
  vi.stubEnv('SPECTRUM_PROJECT_SECRET', 'secret-value')
  vi.stubEnv('SPECTRUM_WEBHOOK_SECRET', 'webhook-value')
  await t.run(async (ctx) => {
    await ctx.db.insert('phoneLinks', {
      status: 'linked',
      ownerId: ada,
      projectId,
      spaceId: 'wa-1',
      platform: 'whatsapp_business',
    })
  })
  const byId = await statuses()
  expect(byId.whatsapp.status).toBe('connected')
  expect(byId.imessage.status).toBe('ready')
  expect(byId.telegram).toMatchObject({
    status: 'needs_setup',
    missing: ['PHOTON_PROJECT_ID', 'PHOTON_API_KEY', 'PHOTON_WEBHOOK_SECRET'],
  })
  expect(JSON.stringify(byId)).not.toMatch(
    /project-value|secret-value|webhook-value/,
  )
})

test('only the owner sees a project’s connections', async () => {
  const { asBob, projectId } = await setup()
  await expect(
    asBob.query(api.api.channels.list, { projectId }),
  ).rejects.toThrow('Project not found.')
})
