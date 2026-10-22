import { afterEach, expect, test, vi } from 'vitest'
import { audioChat, audioVoiceFor, pcmToWav } from '../../lib/audio'

vi.mock('convex/server', () => ({
  getServiceToken: () => Promise.resolve('token'),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A gateway stream, split mid-line the way the network splits it. */
const stream = (events: Array<unknown>) => {
  const text = `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) {
        controller.enqueue(bytes.subarray(i, i + 7))
      }
      controller.close()
    },
  })
}

test('audio chat streams the spoken answer and its words, then the usage', async () => {
  const pcm = (n: number) => btoa(String.fromCharCode(...new Array(n).fill(1)))
  const fetch = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(
        stream([
          { choices: [{ delta: { audio: { transcript: 'Paris ' } } }] },
          { choices: [{ delta: { audio: { data: pcm(4) } } }] },
          {
            choices: [
              { delta: { audio: { transcript: 'it is.', data: pcm(2) } } },
            ],
          },
          {
            choices: [],
            usage: { prompt_tokens: 70, completion_tokens: 50, cost: 0.0002 },
          },
        ]),
      ),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const heard: Array<[number, string]> = []
  const result = await audioChat(
    {
      instructions: 'Be brief.',
      history: [{ role: 'user', content: 'Hi' }],
      audio: 'UklGRg==',
      format: 'wav',
      voice: 'marin',
    },
    (chunk, transcript) => {
      heard.push([chunk.length, transcript])
    },
  )
  expect(heard).toEqual([
    [4, 'Paris '],
    [2, 'Paris it is.'],
  ])
  expect(result).toEqual({
    transcript: 'Paris it is.',
    inputTokens: 70,
    outputTokens: 50,
    cost: 0.0002,
  })
  const body = JSON.parse(fetch.mock.calls[0][1]?.body as string) as {
    modalities: Array<string>
    audio: unknown
    messages: Array<{ role: string; content: unknown }>
  }
  expect(body.modalities).toEqual(['text', 'audio'])
  expect(body.audio).toEqual({ voice: 'marin', format: 'pcm16' })
  expect(body.messages.map((m) => m.role)).toEqual(['system', 'user', 'user'])
  expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: 'Bearer token',
  })
})

test('a gateway error says what went wrong', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response('{"error":"bad model"}', { status: 400 })),
  )
  await expect(
    audioChat(
      {
        instructions: '',
        history: [],
        audio: '',
        format: 'wav',
        voice: 'marin',
      },
      () => undefined,
    ),
  ).rejects.toThrow('Audio chat 400: {"error":"bad model"}')
})

test('the spoken answer is wrapped as a 24 kHz WAV, and voices stay put', () => {
  const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]))
  const view = new DataView(wav.buffer)
  expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
  expect(view.getUint32(24, true)).toBe(24_000)
  expect(view.getUint32(40, true)).toBe(4)
  expect([...wav.subarray(44)]).toEqual([1, 2, 3, 4])
  expect(audioVoiceFor('Matilda')).toBe('marin')
  expect(audioVoiceFor('Demi')).toBe(audioVoiceFor('Demi'))
  expect(audioVoiceFor('Demi')).not.toBe('marin')
})
