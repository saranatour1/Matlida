import * as React from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Dmarc } from '../../convex/lib/dmarc'
import { Button } from '~/components/ui/button'

/** What the mail domain's DMARC record means, and whether it needs fixing. */
function describe(domain: string, dmarc: Dmarc): { text: string; ok: boolean } {
  if (dmarc.problem === 'missing') {
    return {
      text: `No record, so anyone can send mail as ${domain}. Add a _dmarc TXT record (see the setup guide).`,
      ok: false,
    }
  }
  if (dmarc.problem === 'several' || !dmarc.policy) {
    return {
      text: 'The record is unreadable or there are several, so receivers ignore it. Keep exactly one.',
      ok: false,
    }
  }
  if (dmarc.aspf === 's') {
    return {
      text: "aspf=s fails Photon's bounce. return path. Use aspf=r.",
      ok: false,
    }
  }
  const reports = dmarc.reports ? '' : ' Add rua= to get reports.'
  return dmarc.policy === 'none'
    ? {
        text: `p=none: monitoring only. Move to quarantine, then reject, once reports look clean.${reports}`,
        ok: true,
      }
    : {
        text: `p=${dmarc.policy}: mail forging ${domain} is ${dmarc.policy === 'reject' ? 'refused' : 'sent to spam'}.${reports}`,
        ok: true,
      }
}

/** The mail domain's DMARC on Connections' Email row, checked daily or on Check now. */
export function DomainHealth() {
  const health = useQuery(api.api.mailboxes.domainHealth, {})
  const check = useAction(api.api.mailboxes.checkDomainNow)
  const [isChecking, startChecking] = React.useTransition()
  if (!health) return null
  const { text, ok } = health.checkedAt
    ? describe(health.domain, health)
    : { text: 'Not checked yet.', ok: true }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className={ok ? 'text-muted-foreground' : 'text-destructive'}>
        <span className="font-medium">DMARC</span> · {text}
      </span>
      <Button
        size="xs"
        variant="outline"
        disabled={isChecking}
        onClick={() =>
          startChecking(async () => {
            await check({})
          })
        }
      >
        {isChecking ? 'Checking…' : 'Check now'}
      </Button>
      {health.checkedAt && (
        <span className="text-muted-foreground">
          Checked{' '}
          {new Date(health.checkedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      )}
    </div>
  )
}
