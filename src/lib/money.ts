/** An amount in `currency`, like $30.00. `minor` says it's in cents. */
export function money(amount: number, currency: string, minor = false) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(minor ? amount / 100 : amount)
}
