import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { CheckCircle2Icon, CircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Doc } from '@convex/_generated/dataModel'
import type { ChatUIMessage } from '~/components/chat-message'
import { api } from '~/lib/api'
import { CopyButton } from '~/components/copy-button'
import { EmailAddress } from '~/components/email-address'
import { Button } from '~/components/ui/button'
import { useProject } from '~/hooks/use-project'
import { attempt } from '~/lib/attempt'

type Topic = 'email' | 'telegram' | 'texts' | 'calls' | 'phone'

/**
 * A setup guide in the chat, from `show_setup`: each way to reach the
 * assistants as steps to click through, ticked off as they're done. It reads
 * the live state, so it updates as you go.
 */
export function SetupPart({
  part,
}: {
  part: Extract<ChatUIMessage['parts'][number], { type: 'tool-show_setup' }>
}) {
  const project = useProject()
  const channels = useQuery(
    api.channels.list,
    project ? { projectId: project._id } : 'skip',
  )
  if (part.state !== 'output-available' || !project || !channels) return null
  const status = (id: string) => channels.find((c) => c.id === id)
  const linked = (...ids: Array<string>) =>
    ids.some((id) => status(id)?.status === 'connected')
  const show = (topic: Topic) =>
    part.output.topic === 'all' || part.output.topic === topic
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
      {show('email') && (
        <Section title="Email" done={linked('email')} setup={status('email')}>
          <p>
            Claim your address, then email {project.name} from the address you
            sign in with.
          </p>
          <EmailAddress project={project} />
        </Section>
      )}
      {show('telegram') && (
        <Section
          title="Telegram"
          done={linked('telegram')}
          setup={status('telegram')}
        >
          <p>1. Open your {project.name} bot on Telegram.</p>
          <p>2. Get a code, and send it to the bot:</p>
          <LinkCode project={project} />
        </Section>
      )}
      {show('texts') && (
        <Section
          title="Texts: iMessage, SMS or WhatsApp"
          done={linked('imessage', 'whatsapp')}
          setup={status('imessage')}
        >
          <p>
            1. Get a code. 2. From your phone, text it to your Photon number in
            Messages or WhatsApp. Phones without iMessage get SMS.
          </p>
          <LinkCode project={project} />
        </Section>
      )}
      {show('calls') && (
        // Calls have nothing to finish, so they always show how.
        <Section title="Calls in the app" done={false}>
          <p>
            Press the waveform button next to Send to talk with {project.name}{' '}
            hands-free, and allow the microphone when your browser asks.
          </p>
        </Section>
      )}
      {show('phone') && (
        <Section title="Phone calls" done={false} setup={status('phone')}>
          <p>
            1. Phone calls cost money, so they&rsquo;re off until your account
            is added to the <code>no-calls</code> feature flag's rule in
            Cloudflare Flagship. Ask whoever runs this app to add your user id:
          </p>
          <UserId />
          <p>
            2. Then ask in the chat: &ldquo;call +14155550123 and tell them
            dinner is at 8&rdquo;, with the number in the same message. Or open
            Contacts and press Call.
          </p>
        </Section>
      )}
    </div>
  )
}

/** One way to reach the assistants: its steps, or what the deployment still needs. */
function Section({
  title,
  done,
  setup,
  children,
}: {
  title: string
  done: boolean
  /** Its status, when it can need deployment setup first. */
  setup?: { status: string; detail: string }
  children: ReactNode
}) {
  const Icon = done ? CheckCircle2Icon : CircleIcon
  return (
    <section className="flex gap-2">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${done ? 'text-emerald-500' : 'text-muted-foreground'}`}
        aria-label={done ? 'Done' : 'Not done yet'}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{title}</p>
        {setup?.status === 'needs_setup' ? (
          <p className="text-muted-foreground">
            Not available yet: {setup.detail}
          </p>
        ) : setup?.status === 'coming_soon' ? (
          <p className="text-muted-foreground">Coming soon.</p>
        ) : done ? (
          <p className="text-muted-foreground">Done.</p>
        ) : (
          <div className="flex flex-col gap-1 text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}

/** Your user id, which the no-calls flag's rule lists, to copy and send on. */
function UserId() {
  const user = useQuery(api.users.current)
  if (!user) return null
  return (
    <p className="flex items-center gap-1">
      <code className="text-foreground">{user._id}</code>
      <CopyButton compact text={user._id} label="Copy your user id" />
    </p>
  )
}

/** A code that links a Telegram, iMessage, SMS or WhatsApp chat, valid for 10 minutes. */
function LinkCode({ project }: { project: Doc<'projects'> }) {
  const links = useQuery(api.texts.links, { projectId: project._id })
  const startLink = useMutation(api.texts.startLink)
  const [busy, startTransition] = React.useTransition()
  const pending = links?.find((l) => l.status === 'pending')
  return pending?.code ? (
    <p>
      Send:{' '}
      <code className="font-semibold text-foreground">link {pending.code}</code>
    </p>
  ) : (
    <Button
      size="sm"
      variant="outline"
      className="self-start"
      disabled={busy}
      onClick={() =>
        startTransition(() => attempt(startLink({ projectId: project._id })))
      }
    >
      Get a code
    </Button>
  )
}
