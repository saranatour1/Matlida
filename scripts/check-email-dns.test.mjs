// @vitest-environment node
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, test } from 'vitest'

/**
 * Runs the checker against a resolver served from this test, so the parsing
 * of MX priorities, quoted TXT data and DMARC tags is pinned without
 * touching the network.
 */

const run = promisify(execFile)

/** DNS JSON answers by "<name>/<type>". TXT data is quoted the way resolvers return it. */
const zones = {
  'good.example/MX': [
    { type: 15, data: '10 inbound-smtp.us-east-1.amazonaws.com.' },
  ],
  'send.good.example/TXT': [
    { type: 16, data: '"v=spf1 include:amazonses.com ~all"' },
  ],
  'send.good.example/MX': [
    { type: 15, data: '10 feedback-smtp.us-east-1.amazonses.com.' },
  ],
  'resend._domainkey.good.example/TXT': [
    {
      type: 16,
      data: '"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ" "DsC4Lh8xils=="',
    },
  ],
  '_dmarc.good.example/TXT': [
    {
      type: 16,
      data: '"v=DMARC1; p=reject; adkim=s; aspf=s; rua=mailto:dmarc@reports.example; fo=1"',
    },
  ],
  'good.example._report._dmarc.reports.example/TXT': [
    { type: 16, data: '"v=DMARC1"' },
  ],
  '_mta-sts.good.example/TXT': [{ type: 16, data: '"v=STSv1; id=20261020"' }],
  'weak.example/MX': [
    { type: 15, data: '20 inbound-smtp.us-east-1.amazonaws.com.' },
    { type: 15, data: '10 mail.weak.example.' },
  ],
  'send.weak.example/TXT': [{ type: 16, data: '"v=spf1 -all"' }],
  '_dmarc.weak.example/TXT': [
    { type: 16, data: '"v=DMARC1; p=none; rua=mailto:dmarc@weak.example"' },
  ],
  // A subdomain with no DMARC record of its own, covered by the
  // organization's record, reporting to a mailbox in the same organization.
  'mail.org.example/MX': [
    { type: 15, data: '10 inbound-smtp.eu-west-1.amazonaws.com.' },
  ],
  'send.mail.org.example/TXT': [
    { type: 16, data: '"v=spf1 include:amazonses.com ~all"' },
  ],
  'send.mail.org.example/MX': [
    { type: 15, data: '10 feedback-smtp.eu-west-1.amazonses.com.' },
  ],
  'resend._domainkey.mail.org.example/TXT': [
    {
      type: 16,
      data: '"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDsC4Lh8xils=="',
    },
  ],
  '_dmarc.org.example/TXT': [
    {
      type: 16,
      data: '"v=DMARC1; p=quarantine; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc@reports.org.example"',
    },
  ],
  // Resend's MX tied with another at the lowest priority.
  'tie.example/MX': [
    { type: 15, data: '10 mail.tie.example.' },
    { type: 15, data: '10 inbound-smtp.us-east-1.amazonaws.com.' },
  ],
}

let server
let resolver

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const key = `${url.searchParams.get('name')}/${url.searchParams.get('type')}`
    const answers = zones[key]
    response.setHeader('content-type', 'application/dns-json')
    response.end(
      JSON.stringify(answers ? { Status: 0, Answer: answers } : { Status: 3 }),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  resolver = `http://127.0.0.1:${server.address().port}/dns-query`
})

afterAll(() => server.close())

async function check(domain, through = resolver) {
  try {
    const { stdout } = await run(process.execPath, [
      'scripts/check-email-dns.mjs',
      domain,
      `--resolver=${through}`,
    ])
    return { code: 0, lines: stdout.trim().split('\n') }
  } catch (error) {
    if (typeof error.stdout !== 'string') throw error
    return { code: error.code, lines: error.stdout.trim().split('\n') }
  }
}

test('a fully set up domain passes every required check', async () => {
  const { code, lines } = await check('good.example')
  expect(code).toBe(0)
  expect(lines.filter((l) => l.startsWith('FAIL'))).toEqual([])
  expect(lines).toContain(
    'PASS Receiving MX: 10 inbound-smtp.us-east-1.amazonaws.com has the lowest priority',
  )
  expect(lines).toContain(
    'PASS Sending SPF: send.good.example TXT "v=spf1 include:amazonses.com ~all"',
  )
  expect(lines).toContainEqual(
    expect.stringMatching(
      /^PASS DKIM: resend\._domainkey\.good\.example has a public key \(53 characters\)$/,
    ),
  )
  expect(lines).toContain('PASS DMARC policy: p=reject')
  expect(lines).toContain('PASS DMARC DKIM alignment: adkim=s')
  expect(lines).toContain('PASS DMARC SPF alignment: aspf=s')
  expect(lines).toContain(
    'PASS DMARC report authorization: reports.example accepts reports for good.example',
  )
  expect(lines).toContain(
    'PASS MTA-STS: _mta-sts.good.example TXT "v=STSv1; id=20261020"; the policy must be served at https://mta-sts.good.example/.well-known/mta-sts.txt',
  )
  expect(lines).toContain('INFO TLS-RPT: not set (optional)')
})

test('a weak setup fails with the record to fix on each line', async () => {
  const { code, lines } = await check('weak.example')
  expect(code).toBe(1)
  expect(lines).toContain(
    "FAIL Receiving MX: lowest priority is 10 mail.weak.example, not Resend's inbound-smtp.<region>.amazonaws.com; Resend only receives when its MX has the lowest priority",
  )
  expect(lines).toContain(
    'FAIL Sending SPF: send.weak.example TXT is "v=spf1 -all", missing include:amazonses.com',
  )
  expect(lines).toContain(
    'FAIL DKIM: no public key TXT on resend._domainkey.weak.example',
  )
  expect(lines).toContain(
    'FAIL DMARC policy: p=none; use p=reject so spoofed mail is refused',
  )
  expect(lines).toContain(
    'FAIL DMARC DKIM alignment: adkim=r (default); set adkim=s',
  )
  expect(lines).toContain(
    'FAIL DMARC SPF alignment: aspf=r (default); set aspf=s',
  )
  expect(lines).toContain('PASS DMARC reports: rua=mailto:dmarc@weak.example')
})

test("a subdomain is covered by its organization's DMARC record and reports stay in house", async () => {
  const { code, lines } = await check('mail.org.example')
  expect(code).toBe(0)
  expect(lines.filter((l) => l.startsWith('FAIL'))).toEqual([])
  expect(lines).toContain(
    'PASS DMARC: no record on _dmarc.mail.org.example; _dmarc.org.example TXT "v=DMARC1; p=quarantine; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc@reports.org.example" applies to its subdomains',
  )
  expect(lines).toContain('PASS DMARC policy: sp=reject')
  expect(lines.some((l) => l.includes('report authorization'))).toBe(false)
})

test('an MX tied with Resend at the lowest priority fails', async () => {
  const { code, lines } = await check('tie.example')
  expect(code).toBe(1)
  expect(lines).toContain(
    "FAIL Receiving MX: 10 mail.tie.example shares the lowest priority with inbound-smtp.us-east-1.amazonaws.com, so receivers split your mail between them; give Resend's MX the lowest priority on its own",
  )
})

test('a resolver URL with its own query string still works', async () => {
  const { code } = await check(
    'good.example',
    `${resolver}?ct=application/dns-json`,
  )
  expect(code).toBe(0)
})

test('a resolver that cannot be reached is an error, not a failed record', async () => {
  const { code, lines } = await check(
    'good.example',
    'http://127.0.0.1:9/dns-query',
  )
  expect(code).toBe(2)
  expect(lines.filter((l) => l.startsWith('FAIL'))).toEqual([])
  expect(lines).toContainEqual(
    expect.stringMatching(/^ERROR Receiving MX: could not look it up \(/),
  )
  expect(lines.at(-1)).toBe(
    'Some lookups could not run. Check the resolver and your network, then run again.',
  )
})

test('without a domain it prints usage and exits 2', async () => {
  const result = await run(process.execPath, ['scripts/check-email-dns.mjs'], {
    env: { ...process.env, MAIL_DOMAIN: '' },
  }).catch((e) => e)
  expect(result.code).toBe(2)
  expect(result.stderr).toContain('Usage')
})
