import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { modules } from '../../test.setup'

afterEach(() => {
  vi.unstubAllEnvs()
})

async function setup() {
  vi.stubEnv('MAIL_DOMAIN', 'mail.example.com')
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_dGVzdA==')
  const t = convexTest(schema, modules)
  const [ada, bob, cal] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'ada@example.com' }),
    await ctx.db.insert('users', { email: 'bob@example.com' }),
    await ctx.db.insert('users', {}),
  ])
  const asAda = t.withIdentity({ subject: ada })
  const asBob = t.withIdentity({ subject: bob })
  const project = async (who: typeof asAda, name: string) =>
    await who.mutation(api.api.projects.save, {
      name,
      brief: '',
      guidelines: '',
    })
  const adaProject = await project(asAda, 'Matilda')
  const bobProject = await project(asBob, 'Matilda')
  const emailStatus = async (who: typeof asAda, projectId: typeof adaProject) =>
    (await who.query(api.api.channels.list, { projectId })).find(
      (s) => s.id === 'email',
    )
  return {
    t,
    asAda,
    asBob,
    asCal: t.withIdentity({ subject: cal }),
    adaProject,
    bobProject,
    project,
    emailStatus,
  }
}

test('claiming a handle gives you handle@MAIL_DOMAIN, answered by that workspace', async () => {
  const { asAda, adaProject, emailStatus } = await setup()
  expect(await asAda.query(api.api.mailboxes.mine, {})).toEqual({
    domain: 'mail.example.com',
    email: 'ada@example.com',
    mailbox: null,
  })
  expect(await emailStatus(asAda, adaProject)).toMatchObject({
    status: 'ready',
    detail: 'Claim an address.',
  })

  await asAda.mutation(api.api.mailboxes.claim, {
    projectId: adaProject,
    handle: ' Ada.Lovelace ',
  })
  expect(await asAda.query(api.api.mailboxes.mine, {})).toMatchObject({
    mailbox: {
      handle: 'ada.lovelace',
      projectId: adaProject,
      address: 'ada.lovelace@mail.example.com',
    },
  })
  expect(await emailStatus(asAda, adaProject)).toMatchObject({
    status: 'connected',
    detail: 'ada.lovelace@mail.example.com',
  })
})

test('reserved, malformed and taken handles are refused', async () => {
  const { asAda, asBob, adaProject, bobProject } = await setup()
  const claim = (
    who: typeof asAda,
    projectId: typeof adaProject,
    handle: string,
  ) => who.mutation(api.api.mailboxes.claim, { projectId, handle })
  await expect(claim(asAda, adaProject, 'postmaster')).rejects.toThrow(
    'That name is reserved. Pick another.',
  )
  await expect(claim(asAda, adaProject, 'ab')).rejects.toThrow(
    'Handles are 3 to 32 characters.',
  )
  await expect(claim(asAda, adaProject, 'ada lovelace')).rejects.toThrow(
    'Use only lowercase letters, digits, dots, dashes and underscores.',
  )
  await claim(asAda, adaProject, 'ada')
  await expect(claim(asBob, bobProject, 'ADA')).rejects.toThrow(
    'That handle is taken. Pick another.',
  )
  // Renaming frees the old handle.
  await claim(asAda, adaProject, 'ada2')
  await claim(asBob, bobProject, 'ada')
  expect(await asBob.query(api.api.mailboxes.mine, {})).toMatchObject({
    mailbox: { handle: 'ada', address: 'ada@mail.example.com' },
  })
})

test('an account without a verified email, or without a mail domain, can’t claim', async () => {
  const { asCal, asAda, adaProject, project } = await setup()
  const calProject = await project(asCal, 'Matilda')
  await expect(
    asCal.mutation(api.api.mailboxes.claim, {
      projectId: calProject,
      handle: 'cal',
    }),
  ).rejects.toThrow('Verify your sign-in email first.')
  vi.stubEnv('MAIL_DOMAIN', '')
  await expect(
    asAda.mutation(api.api.mailboxes.claim, {
      projectId: adaProject,
      handle: 'ada',
    }),
  ).rejects.toThrow('Email isn’t set up on this deployment yet.')
  expect(await asAda.query(api.api.mailboxes.mine, {})).toMatchObject({
    domain: null,
  })
})

test('one address per user: another workspace shows it, and can take it over', async () => {
  const { asAda, adaProject, project, emailStatus } = await setup()
  const second = await project(asAda, 'Studio')
  await asAda.mutation(api.api.mailboxes.claim, {
    projectId: adaProject,
    handle: 'ada',
  })
  expect(await emailStatus(asAda, second)).toMatchObject({
    status: 'ready',
    detail: 'ada@mail.example.com answers in another workspace.',
  })
  await asAda.mutation(api.api.mailboxes.claim, {
    projectId: second,
    handle: 'ada',
  })
  expect(await emailStatus(asAda, second)).toMatchObject({
    status: 'connected',
  })
  expect(await emailStatus(asAda, adaProject)).toMatchObject({
    status: 'ready',
  })
})

test('releasing frees the address, and you can only claim for your own workspace', async () => {
  const { asAda, asBob, adaProject, emailStatus } = await setup()
  await asAda.mutation(api.api.mailboxes.claim, {
    projectId: adaProject,
    handle: 'ada',
  })
  await asAda.mutation(api.api.mailboxes.release, {})
  expect(await asAda.query(api.api.mailboxes.mine, {})).toMatchObject({
    mailbox: null,
  })
  expect(await emailStatus(asAda, adaProject)).toMatchObject({
    status: 'ready',
  })
  await expect(
    asBob.mutation(api.api.mailboxes.claim, {
      projectId: adaProject,
      handle: 'bob',
    }),
  ).rejects.toThrow('Project not found.')
})
