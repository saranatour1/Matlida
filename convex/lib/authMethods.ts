/** Every way to sign in. A deployment can turn some off with AUTH_METHODS. */
export const AUTH_METHODS = ['email', 'google', 'github'] as const

export type AuthMethod = (typeof AUTH_METHODS)[number]

/**
 * The sign-in methods `setting` (AUTH_METHODS, a comma list like `github`)
 * turns on. Unset or empty means all of them. An unknown name throws, so a
 * typo stops the deploy instead of quietly locking everyone out.
 */
export const enabledMethods = (setting?: string): Array<AuthMethod> => {
  const asked = (setting ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  if (asked.length === 0) return [...AUTH_METHODS]
  const unknown = asked.filter(
    (name) => !(AUTH_METHODS as ReadonlyArray<string>).includes(name),
  )
  if (unknown.length) {
    throw new Error(
      `AUTH_METHODS has unknown sign-in methods: ${unknown.join(', ')}. Use ${AUTH_METHODS.join(', ')}.`,
    )
  }
  return AUTH_METHODS.filter((method) => asked.includes(method))
}
