// Headless browser for verify.sh drive, where the desktop browser pane isn't available. See SKILL.md.
// Usage: verify.sh drive <feature> <verb> <arg> [<verb> <arg> ...]
//   goto <path or URL>   fill <label>=<value>   click <button or link name>
//   wait <text>          url <pathname>         snap <step>
// Each call opens a fresh tab, so start with goto. After the steps, it prints the URL and ARIA tree.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const [feature, ...steps] = process.argv.slice(2)
const run = realpathSync('test-results/verify/latest')
const dir = `${run}/${feature}`
mkdirSync(dir, { recursive: true })

// One profile per run keeps cookies and localStorage between calls, so an emailed link opens in the browser that asked for it.
const context = await chromium.launchPersistentContext(`${run}/browser`, { executablePath: process.env.CHROME })
const page = context.pages()[0] ?? (await context.newPage())
const aria = async () => `# ${feature} ${page.url()}\n${await page.locator('body').ariaSnapshot()}\n`
const name = (n) => ({ name: n, exact: true })

const verbs = {
  goto: (to) => page.goto(new URL(to, 'http://localhost:3100').href),
  fill: (pair) => {
    const i = pair.indexOf('=')
    return page.getByLabel(pair.slice(0, i), { exact: true }).fill(pair.slice(i + 1))
  },
  click: (n) => page.getByRole('button', name(n)).or(page.getByRole('link', name(n))).click(),
  wait: (text) => page.getByText(text).first().waitFor(),
  url: (path) => page.waitForURL((u) => u.pathname === path),
  snap: async (step) => {
    writeFileSync(`${dir}/${step}.aria.txt`, await aria())
    await page.screenshot({ path: `${dir}/${step}.png`, fullPage: true })
  },
}

let failed = false
try {
  for (let i = 0; i < steps.length; i += 2) {
    const [verb, arg] = steps.slice(i, i + 2)
    if (!verbs[verb] || arg === undefined) throw new Error(`bad step: ${verb} ${arg ?? ''}`)
    await verbs[verb](arg)
  }
} catch (e) {
  console.error(e.message)
  failed = true
}
console.log(await aria().catch((e) => e.message))
await context.close()
process.exit(failed ? 1 : 0)
