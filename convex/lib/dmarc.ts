/** What a domain's DMARC record says, from the TXT records at `_dmarc.<domain>`. */
export type Dmarc = {
  /** `missing`: no DMARC record. `several`: more than one, which receivers treat as none. */
  problem: 'missing' | 'several' | null
  policy: 'none' | 'quarantine' | 'reject' | null
  /** DKIM and SPF alignment: strict (`s`) or relaxed (`r`, the default). */
  adkim: 's' | 'r'
  aspf: 's' | 'r'
  /** Whether daily reports go anywhere. */
  reports: boolean
}

/** Reads DMARC from the TXT records at `_dmarc.<domain>`. Pure, so it's tested on its own. */
export function parseDmarc(records: Array<string>): Dmarc {
  const dmarc = records.filter((r) => /^v=DMARC1\s*(;|$)/i.test(r.trim()))
  const tags = new Map(
    (dmarc.length === 1 ? dmarc[0] : '')
      .split(';')
      .map((part) => part.split('=').map((s) => s.trim()))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]),
  )
  const policy = tags.get('p')
  return {
    problem:
      dmarc.length === 0 ? 'missing' : dmarc.length > 1 ? 'several' : null,
    policy:
      policy === 'none' || policy === 'quarantine' || policy === 'reject'
        ? policy
        : null,
    adkim: tags.get('adkim') === 's' ? 's' : 'r',
    aspf: tags.get('aspf') === 's' ? 's' : 'r',
    reports: Boolean(tags.get('rua')),
  }
}

/** The TXT records at `_dmarc.<domain>`, over DNS-over-HTTPS. A record split into strings is joined. */
export async function lookupDmarc(domain: string) {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=_dmarc.${encodeURIComponent(domain)}&type=TXT`,
    { headers: { accept: 'application/dns-json' } },
  )
  if (!response.ok) throw new Error(`DNS lookup failed (${response.status}).`)
  const body = (await response.json()) as {
    Answer?: Array<{ type: number; data: string }>
  }
  return (body.Answer ?? [])
    .filter((a) => a.type === 16)
    .map((a) =>
      [...a.data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(''),
    )
}
