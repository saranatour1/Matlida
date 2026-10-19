#!/usr/bin/env node
// Checks the DNS records email needs for MAIL_DOMAIN: Resend's receiving MX,
// the SPF and DKIM records Resend verifies, a strict DMARC policy, and the
// optional MTA-STS and TLS-RPT records. Reads public DNS over HTTPS only, so
// it needs no credentials and prints no secrets.
//
//   node scripts/check-email-dns.mjs mail.example.com
//   MAIL_DOMAIN=mail.example.com node scripts/check-email-dns.mjs
//
// Options: --return-path=<label> when Resend's return path isn't "send",
// --resolver=google to use Google's resolver instead of Cloudflare's, or
// --resolver=<url> for any resolver that speaks the DNS JSON format.

const args = process.argv.slice(2)
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => a.slice(2).split('=', 2))
    .map(([key, value]) => [key, value ?? true]),
)
const domain = (
  args.find((a) => !a.startsWith('--')) ??
  process.env.MAIL_DOMAIN ??
  ''
)
  .trim()
  .toLowerCase()
  .replace(/\.$/, '')
if (!domain) {
  console.error('Usage: node scripts/check-email-dns.mjs <MAIL_DOMAIN>')
  process.exit(2)
}
const returnPath = flags['return-path'] ?? 'send'
const resolver =
  flags.resolver === 'google'
    ? 'https://dns.google/resolve'
    : typeof flags.resolver === 'string' && flags.resolver.includes('://')
      ? flags.resolver
      : 'https://cloudflare-dns.com/dns-query'

/** One DoH lookup. Returns the record data strings, or throws on a resolver error. */
async function lookup(name, type) {
  const url = `${resolver}?name=${encodeURIComponent(name)}&type=${type}`
  const response = await fetch(url, {
    headers: { accept: 'application/dns-json' },
  })
  if (!response.ok)
    throw new Error(
      `${resolver} answered ${response.status} for ${name} ${type}`,
    )
  const body = await response.json()
  if (body.Status !== 0 && body.Status !== 3) {
    throw new Error(`DNS status ${body.Status} for ${name} ${type}`)
  }
  return (body.Answer ?? [])
    .filter((a) => a.type === (type === 'TXT' ? 16 : 15))
    .map((a) => a.data)
}

/** TXT data arrives as one or more quoted strings; join them into the record's text. */
function txt(data) {
  return data
    .map(
      (d) =>
        d
          .match(/"((?:[^"\\]|\\.)*)"/g)
          ?.map((s) => s.slice(1, -1).replace(/\\"/g, '"'))
          .join('') ?? d,
    )
    .map((s) => s.trim())
}

/** MX data is "<priority> <host>". */
function mx(data) {
  return data
    .map((d) => d.trim().split(/\s+/))
    .filter((parts) => parts.length === 2)
    .map(([priority, host]) => ({
      priority: Number(priority),
      host: host.toLowerCase().replace(/\.$/, ''),
    }))
    .sort((a, b) => a.priority - b.priority)
}

/** The tags of a DMARC-style record ("v=DMARC1; p=reject; ...") by name. */
function tags(record) {
  return Object.fromEntries(
    record
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split('=', 2).map((s) => s.trim()))
      .map(([key, value]) => [key.toLowerCase(), value ?? '']),
  )
}

let failed = false
function report(level, check, detail) {
  if (level === 'FAIL') failed = true
  console.log(`${level.padEnd(4)} ${check}: ${detail}`)
}

async function check(name, run) {
  try {
    await run()
  } catch (error) {
    report('FAIL', name, error instanceof Error ? error.message : String(error))
  }
}

console.log(`Checking ${domain} through ${resolver}\n`)

await check('Receiving MX', async () => {
  const records = mx(await lookup(domain, 'MX'))
  if (records.length === 0)
    return report(
      'FAIL',
      'Receiving MX',
      `no MX record on ${domain}; add Resend's inbound MX`,
    )
  const [first] = records
  const isResend = /^inbound-smtp\.[a-z0-9-]+\.amazonaws\.com$/.test(first.host)
  if (isResend)
    return report(
      'PASS',
      'Receiving MX',
      `${first.priority} ${first.host} has the lowest priority`,
    )
  report(
    'FAIL',
    'Receiving MX',
    `lowest priority is ${first.priority} ${first.host}, not Resend's inbound-smtp.<region>.amazonaws.com; Resend only receives when its MX has the lowest priority`,
  )
})

await check('Sending SPF', async () => {
  const host = `${returnPath}.${domain}`
  const records = txt(await lookup(host, 'TXT')).filter((r) =>
    r.toLowerCase().startsWith('v=spf1'),
  )
  if (records.length === 0)
    return report('FAIL', 'Sending SPF', `no v=spf1 TXT on ${host}`)
  if (records.length > 1)
    return report(
      'FAIL',
      'Sending SPF',
      `${records.length} SPF records on ${host}; there must be exactly one`,
    )
  const [record] = records
  if (!/include:amazonses\.com/i.test(record))
    return report(
      'FAIL',
      'Sending SPF',
      `${host} TXT is "${record}", missing include:amazonses.com`,
    )
  report('PASS', 'Sending SPF', `${host} TXT "${record}"`)
  const feedback = mx(await lookup(host, 'MX'))
  if (
    feedback.some((m) =>
      /^feedback-smtp\.[a-z0-9-]+\.amazonses\.com$/.test(m.host),
    )
  ) {
    report(
      'PASS',
      'Return-path MX',
      `${host} MX ${feedback.map((m) => `${m.priority} ${m.host}`).join(', ')}`,
    )
  } else {
    report(
      'FAIL',
      'Return-path MX',
      `no feedback-smtp.<region>.amazonses.com MX on ${host}`,
    )
  }
})

await check('DKIM', async () => {
  const host = `resend._domainkey.${domain}`
  const records = txt(await lookup(host, 'TXT'))
  const key = records.find((r) => /(^|;)\s*p=[A-Za-z0-9+/=]+/.test(r))
  if (!key) return report('FAIL', 'DKIM', `no public key TXT on ${host}`)
  report('PASS', 'DKIM', `${host} has a public key (${key.length} characters)`)
})

await check('DMARC', async () => {
  const host = `_dmarc.${domain}`
  const records = txt(await lookup(host, 'TXT')).filter((r) =>
    r.toLowerCase().startsWith('v=dmarc1'),
  )
  if (records.length === 0)
    return report('FAIL', 'DMARC', `no v=DMARC1 TXT on ${host}`)
  if (records.length > 1)
    return report(
      'FAIL',
      'DMARC',
      `${records.length} DMARC records on ${host}; there must be exactly one`,
    )
  const t = tags(records[0])
  report('PASS', 'DMARC', `${host} TXT "${records[0]}"`)
  const policy = (t.p ?? 'none').toLowerCase()
  report(
    policy === 'reject' ? 'PASS' : 'FAIL',
    'DMARC policy',
    policy === 'reject'
      ? 'p=reject'
      : `p=${policy}; use p=reject so spoofed mail is refused`,
  )
  report(
    (t.adkim ?? 'r').toLowerCase() === 's' ? 'PASS' : 'FAIL',
    'DMARC DKIM alignment',
    `adkim=${t.adkim ?? 'r (default)'}; set adkim=s`,
  )
  report(
    (t.aspf ?? 'r').toLowerCase() === 's' ? 'PASS' : 'FAIL',
    'DMARC SPF alignment',
    `aspf=${t.aspf ?? 'r (default)'}; set aspf=s`,
  )
  const rua = t.rua ?? ''
  if (/^mailto:[^\s@,]+@[^\s@,]+/i.test(rua)) {
    report('PASS', 'DMARC reports', `rua=${rua}`)
    const reportDomain = rua.split('@')[1]?.split(/[,!]/)[0]?.toLowerCase()
    if (
      reportDomain &&
      reportDomain !== domain &&
      !domain.endsWith(`.${reportDomain}`)
    ) {
      const authorization = txt(
        await lookup(`${domain}._report._dmarc.${reportDomain}`, 'TXT'),
      )
      if (authorization.some((r) => r.toLowerCase().startsWith('v=dmarc1'))) {
        report(
          'PASS',
          'DMARC report authorization',
          `${reportDomain} accepts reports for ${domain}`,
        )
      } else {
        report(
          'FAIL',
          'DMARC report authorization',
          `add TXT ${domain}._report._dmarc.${reportDomain} "v=DMARC1" so ${reportDomain} accepts reports for ${domain}`,
        )
      }
    }
  } else {
    report('FAIL', 'DMARC reports', 'no rua=mailto:… address; set one you read')
  }
})

await check('MTA-STS', async () => {
  const records = txt(await lookup(`_mta-sts.${domain}`, 'TXT')).filter((r) =>
    r.toLowerCase().startsWith('v=stsv1'),
  )
  if (records.length === 0)
    return report('INFO', 'MTA-STS', 'not set (optional)')
  report(
    'PASS',
    'MTA-STS',
    `_mta-sts.${domain} TXT "${records[0]}"; the policy must be served at https://mta-sts.${domain}/.well-known/mta-sts.txt`,
  )
})

await check('TLS-RPT', async () => {
  const records = txt(await lookup(`_smtp._tls.${domain}`, 'TXT')).filter((r) =>
    r.toLowerCase().startsWith('v=tlsrptv1'),
  )
  if (records.length === 0)
    return report('INFO', 'TLS-RPT', 'not set (optional)')
  report('PASS', 'TLS-RPT', `_smtp._tls.${domain} TXT "${records[0]}"`)
})

console.log(
  failed
    ? '\nSome checks failed. See docs/setup/channels.md.'
    : '\nAll required records are in place.',
)
process.exit(failed ? 1 : 0)
