/** A number in international format, like +14155550123. */
export const PHONE_NUMBER = /^\+[1-9]\d{6,14}$/

/**
 * Whether `to` is a number the user typed in `text`. The model may rewrite
 * "0791 234 567" as +962791234567, so the last 7 digits have to match, and
 * a number read from an email or a web page never does.
 */
export const typedBy = (text: string, to: string) =>
  text.replace(/\D/g, '').includes(to.replace(/\D/g, '').slice(-7))
