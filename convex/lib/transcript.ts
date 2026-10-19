/** A call's transcript as plain text: who said what, when, and how long each reply took. */
export function formatTranscript({
  name,
  when,
  call,
  lines,
}: {
  /** The assistant's name. */
  name: string
  /** When the call started, already formatted for the reader. */
  when: string
  call: {
    _id: string
    _creationTime: number
    endedAt?: number
    threadId?: string
  }
  lines: Array<{
    who: 'you' | 'them'
    text: string
    ms?: number
    firstMs?: number
    cutOff?: boolean
    _creationTime: number
  }>
}) {
  const start = call._creationTime
  const end = call.endedAt ?? lines.at(-1)?._creationTime ?? start
  const head = [
    `Call with ${name}, ${when} (${clock(end - start)} long)`,
    `Call ${call._id}${call.threadId ? `, chat ${call.threadId}` : ''}`,
    '',
  ]
  const body = lines.map((line) => {
    const who = line.who === 'you' ? 'You' : name
    const took =
      line.firstMs !== undefined && line.ms !== undefined
        ? `, first words in ${seconds(line.firstMs)}, all of it in ${seconds(line.ms)}`
        : line.ms === undefined
          ? ''
          : `, replied in ${seconds(line.ms)}`
    const cut = line.cutOff ? ' (you cut in)' : ''
    return `[${clock(line._creationTime - start)}] ${who}${took}: ${line.text}${cut}`
  })
  return [...head, ...(body.length ? body : ['Nothing was said.'])].join('\n')
}

/** "4.3 s". */
function seconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`
}

/** "1:05" for 65 seconds. */
function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
