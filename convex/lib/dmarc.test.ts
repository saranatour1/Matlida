import { afterEach, expect, test, vi } from 'vitest'
import { lookupDmarc, parseDmarc } from './dmarc'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('reads the policy, alignment and reports', () => {
  expect(
    parseDmarc([
      'v=spf1 -all',
      'v=DMARC1; p=Reject; adkim=s; aspf=r; fo=1; rua=mailto:r@example.com',
    ]),
  ).toEqual({
    problem: null,
    policy: 'reject',
    adkim: 's',
    aspf: 'r',
    reports: true,
  })
  expect(parseDmarc(['v=DMARC1; p=none'])).toMatchObject({
    policy: 'none',
    adkim: 'r',
    aspf: 'r',
    reports: false,
  })
})

test('no record, or more than one, is a problem', () => {
  expect(parseDmarc([]).problem).toBe('missing')
  expect(parseDmarc(['v=DMARC1; p=none', 'v=DMARC1; p=reject'])).toMatchObject({
    problem: 'several',
    policy: null,
  })
  expect(parseDmarc(['v=DMARC1; p=maybe']).policy).toBeNull()
})

test('looks up _dmarc over DNS-over-HTTPS and joins split strings', async () => {
  const fetchMock = vi.fn((url: string) => {
    expect(url).toBe(
      'https://cloudflare-dns.com/dns-query?name=_dmarc.mail.example.com&type=TXT',
    )
    return Promise.resolve(
      Response.json({
        Answer: [
          { type: 5, data: 'alias.example.com.' },
          {
            type: 16,
            data: '"v=DMARC1; p=quarantine; " "rua=mailto:r@example.com"',
          },
        ],
      }),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  expect(await lookupDmarc('mail.example.com')).toEqual([
    'v=DMARC1; p=quarantine; rua=mailto:r@example.com',
  ])
})
