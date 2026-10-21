const QUARTERS = ['', '¼', '½', '¾']

/**
 * A recipe amount the way a cook reads it: quarters under 10 ("1½", "¾"),
 * whole numbers from 10, and two decimals for pinches under ⅕.
 */
export function formatAmount(amount: number) {
  if (amount >= 10) return String(Math.round(amount))
  if (amount < 0.2) return String(Number(amount.toFixed(2)))
  const quarters = Math.round(amount * 4)
  const whole = Math.floor(quarters / 4)
  const part = QUARTERS[quarters % 4]
  return whole ? `${whole}${part}` : part
}
