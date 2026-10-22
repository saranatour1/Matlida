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
