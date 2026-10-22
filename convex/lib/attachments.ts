import type { FilePart, ImagePart, ModelMessage, TextPart } from 'ai'

/** Attachments a message can carry: pictures and PDFs, 5 at most, 10 MB each. */
export const MAX_FILES = 5
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ATTACHABLE = 'image/*,application/pdf'

/**
 * Pictures and PDFs only. They're also never markdown or audio, which the
 * hourly `commands.sweepFiles` deletes when no command points to them.
 */
export const attachable = (type?: string) =>
  !!type && (type.startsWith('image/') || type === 'application/pdf')

const noteFor = (part: FilePart | ImagePart): TextPart => ({
  type: 'text',
  text:
    part.type === 'file'
      ? `[${part.filename ?? part.mediaType} attached earlier]`
      : '[picture attached earlier]',
})

/**
 * A message with its pictures and files left as notes. Older messages go to
 * the model this way: each step of each reply would download and encode them
 * again, and a 10 MB PDF pushes a reply past the 64 MB a Convex action gets.
 */
export const withoutAttachments = (message: ModelMessage): ModelMessage => {
  if (typeof message.content === 'string') return message
  if (message.role === 'user') {
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === 'text' ? part : noteFor(part),
      ),
    }
  }
  if (message.role === 'assistant') {
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === 'file' ? noteFor(part) : part,
      ),
    }
  }
  return message
}
