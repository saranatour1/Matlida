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
//
// Exit codes: 0 when every required record is in place, 1 when one fails,
// 2 when a lookup couldn't run (resolver or network trouble) or no domain
// was given.

const args = process.argv.slice(2)
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => splitOnce(a.slice(2), '='))
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

/** `key=value` split at the first `=` only, so values may contain `=`. */
function splitOnce(text, separator) {
  const at = text.indexOf(separator)
  return at === -1 ? [text] : [text.slice(0, at), text.slice(at + 1)]
}

/**
 * The organizational domain, which DMARC falls back to and compares report
 * addresses by: the registrable part, such as example.com for
 * mail.example.com or example.co.uk for mail.example.co.uk. Approximates the
 * public suffix list with the common two-label suffixes.
 */
function organizationalDomain(name) {
  const labels = name.split('.')
  if (labels.length <= 2) return name
  const [tld, second] = [labels.at(-1), labels.at(-2)]
  const twoLabelSuffix =
    /^(co|com|net|org|gov|edu|ac|ne|or|mil)$/.test(second) && tld.length === 2
  return labels.slice(twoLabelSuffix ? -3 : -2).join('.')
}

/** One DoH lookup. Returns the record data strings, or throws on a resolver error. */
async function lookup(name, type) {
  const url = new URL(resolver)
  url.searchParams.set('name', name)
  url.searchParams.set('type', type)
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
      .map((part) => splitOnce(part, '=').map((s) => s.trim()))
      .map(([key, value]) => [key.toLowerCase(), value ?? '']),
  )
}

/** The DMARC records among TXT data. */
function dmarcRecords(data) {
  return txt(data).filter((r) => r.toLowerCase().startsWith('v=dmarc1'))
}

const isResendInbound = (host) =>
  /^inbound-smtp\.[a-z0-9-]+\.amazonaws\.com$/.test(host)

let failed = false
let errored = false
function report(level, check, detail) {
  if (level === 'FAIL') failed = true
  if (level === 'ERROR') errored = true
  console.log(`${level.padEnd(4)} ${check}: ${detail}`)
}

/** Runs one check; a resolver or network error is reported apart from a bad record. */
async function check(name, run) {
  try {
    await run()
  } catch (error) {
    report(
      'ERROR',
      name,
      `could not look it up (${error instanceof Error ? error.message : String(error)})`,
    )
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
  const lowest = records.filter((m) => m.priority === records[0].priority)
  const resend = lowest.find((m) => isResendInbound(m.host))
  const others = lowest.filter((m) => !isResendInbound(m.host))
  if (resend && others.length === 0)
    return report(
      'PASS',
      'Receiving MX',
      `${resend.priority} ${resend.host} has the lowest priority`,
    )
  if (resend)
    return report(
      'FAIL',
      'Receiving MX',
      `${others.map((m) => `${m.priority} ${m.host}`).join(', ')} shares the lowest priority with ${resend.host}, so receivers split your mail between them; give Resend's MX the lowest priority on its own`,
    )
  const [first] = records
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
  const organization = organizationalDomain(domain)
  let records = dmarcRecords(await lookup(host, 'TXT'))
  let inherited = false
  if (records.length === 0 && organization !== domain) {
    // Receivers fall back to the organizational domain's record, whose sp=
    // tag (or p= without one) covers subdomains.
    records = dmarcRecords(await lookup(`_dmarc.${organization}`, 'TXT'))
    inherited = records.length > 0
  }
  if (records.length === 0)
    return report('FAIL', 'DMARC', `no v=DMARC1 TXT on ${host}`)
  if (records.length > 1)
    return report(
      'FAIL',
      'DMARC',
      `${records.length} DMARC records on ${inherited ? `_dmarc.${organization}` : host}; there must be exactly one`,
    )
  const t = tags(records[0])
  report(
    'PASS',
    'DMARC',
    inherited
      ? `no record on ${host}; _dmarc.${organization} TXT "${records[0]}" applies to its subdomains`
      : `${host} TXT "${records[0]}"`,
  )
  const policy = ((inherited ? (t.sp ?? t.p) : t.p) ?? 'none').toLowerCase()
  const policyTag = inherited && t.sp ? 'sp' : 'p'
  report(
    policy === 'reject' ? 'PASS' : 'FAIL',
    'DMARC policy',
    policy === 'reject'
      ? `${policyTag}=reject`
      : `${policyTag}=${policy}; use ${policyTag}=reject so spoofed mail is refused`,
  )
  for (const [tag, name] of [
    ['adkim', 'DMARC DKIM alignment'],
    ['aspf', 'DMARC SPF alignment'],
  ]) {
    const strict = (t[tag] ?? 'r').toLowerCase() === 's'
    report(
      strict ? 'PASS' : 'FAIL',
      name,
      strict ? `${tag}=s` : `${tag}=${t[tag] ?? 'r (default)'}; set ${tag}=s`,
    )
  }
  const rua = t.rua ?? ''
  if (/^mailto:[^\s@,]+@[^\s@,]+/i.test(rua)) {
    report('PASS', 'DMARC reports', `rua=${rua}`)
    const reportDomain = rua.split('@')[1]?.split(/[,!]/)[0]?.toLowerCase()
    // Reports to another organization need that organization's consent
    // record. Any address in your own organization needs nothing.
    if (reportDomain && organizationalDomain(reportDomain) !== organization) {
      const authorization = dmarcRecords(
        await lookup(`${domain}._report._dmarc.${reportDomain}`, 'TXT'),
      )
      if (authorization.length > 0) {
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
  errored
    ? '\nSome lookups could not run. Check the resolver and your network, then run again.'
    : failed
      ? '\nSome checks failed. See docs/setup/channels.md.'
      : '\nAll required records are in place.',
)
process.exit(errored ? 2 : failed ? 1 : 0)
