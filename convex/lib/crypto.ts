import { env } from '../_generated/server'

const KEY_VERSION = 1

export type EncryptedSecret = {
  ciphertext: ArrayBuffer
  iv: ArrayBuffer
  keyVersion: number
}

async function secretsKey() {
  const raw = Uint8Array.from(atob(env.SECRETS_KEY), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Encrypts a user's secret with AES-256-GCM, bound to its owner so the
 * ciphertext can't be moved to another account. Call from actions only:
 * queries and mutations have deterministic randomness.
 */
export async function encryptSecret(
  plaintext: string,
  ownerId: string,
): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(ownerId) },
    await secretsKey(),
    new TextEncoder().encode(plaintext),
  )
  return { ciphertext, iv: iv.buffer, keyVersion: KEY_VERSION }
}

/** Decrypts a secret from `encryptSecret`. Keep the result inside the action. */
export async function decryptSecret(secret: EncryptedSecret, ownerId: string) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: secret.iv,
      additionalData: new TextEncoder().encode(ownerId),
    },
    await secretsKey(),
    secret.ciphertext,
  )
  return new TextDecoder().decode(plaintext)
}
