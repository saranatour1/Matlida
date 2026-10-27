import { useMutation } from 'convex/react'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '~/lib/api'

/**
 * Uploads a file to Convex storage in one call, returning its storage id.
 * `url` is an upload URL fetched ahead of time, which saves a round trip.
 */
export const useUpload = () => {
  const uploadUrl = useMutation(api.chat.voiceUploadUrl)
  return async (file: Blob, url?: Promise<string>) => {
    const res = await fetch(await (url ?? uploadUrl()), {
      method: 'POST',
      // A type always, so the hourly sweep of untyped leftovers never takes it.
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error('The upload failed. Try again.')
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> }
    return storageId
  }
}
