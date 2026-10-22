/** How the app shows a number it called: its last 4 digits, like "…0123". */
export const maskNumber = (to: string) => `…${to.slice(-4)}`

/** A number in international format, like +14155550123. */
export const PHONE_NUMBER = /^\+[1-9]\d{6,14}$/

/**
 * Whether `to` is a number the user typed in `text`, so a number read from
 * an email or a web page is never called. A number typed with + (or 00) has
 * to match exactly. One typed locally, like "0791 234 567" (8 digits or more
 * after the 0), has to match the end of `to`, since its country code is the
 * model's guess.
 */
export const typedBy = (text: string, to: string) => {
  const want = to.replace(/\D/g, '')
  return (text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? []).some((typed) => {
    const digits = typed.replace(/\D/g, '')
    if (typed.startsWith('+')) return digits === want
    const national = digits.replace(/^0+/, '')
    return national.length >= 8 && want.endsWith(national)
  })
}
