/**
 * Ports the pstack Cursor plugin (MIT, https://github.com/cursor/plugins/tree/main/pstack)
 * into this repo's Claude Code setup: skills in .claude/skills, agents in .claude/agents.
 * Rerunnable. Usage: node scripts/port-pstack.mjs <path to cursor/plugins/pstack>
 */
import fs from 'node:fs'
import path from 'node:path'

const source = process.argv[2]
if (!source || !fs.existsSync(path.join(source, 'skills/poteto-mode/SKILL.md'))) {
  console.error('Usage: node scripts/port-pstack.mjs <path to cursor/plugins/pstack>')
  process.exit(1)
}

const SKILLS = '.claude/skills'
const AGENTS = '.claude/agents'
const MODELS = '.claude/skills/poteto-mode/models.md'
const GUIDE = 'https://github.com/cursor/plugins/blob/main/pstack'
/** Cursor-only, or already provided by Claude Code (a personal `unslop` skill wins over a project one). */
const SKIPPED = new Set(['setup-pstack', 'make-bot-ui', 'unslop'])

/** Specific rewrites, applied before the general rules. */
const EXACT = [
  [
    'Each reviewer gets `subagent_type: generalPurpose`, `readonly: true`, and `model` set to its configured entry',
    'Each reviewer gets `subagent_type: Explore` (read-only), with `model` and `effort` set from its configured entry',
  ],
  [
    "Families go by prefix: `claude-*`, and `grok-*` with `cursor-grok-*` and `composer-*`. A refused `composer-*` entry runs on Reviewer B's default. With no family match, use Reviewer A's default.",
    "Entries are `<model>/<effort>`, where the model is `opus`, `sonnet`, `haiku` or `fable`. With no match, use Reviewer A's default.",
  ],
  [
    'Every spawn is `generalPurpose` with `readonly: false` (agent mode). **Do not use readonly/Ask mode.** It strips MCP access, which',
    'Every spawn is `general-purpose`. **Do not use `Explore`.** Investigators edit nothing, but losing tools',
  ],
  [
    'Every spawn is a Task subagent with `subagent_type: generalPurpose` and `readonly: true`.',
    'Every spawn is an `Agent` call with `subagent_type: Explore` (read-only).',
  ],
  [
    'list the available MCPs from the Cursor environment. Use the available-tools map when present. Otherwise inspect the `mcps/` directory Cursor exposes for enabled MCP servers.',
    'list the MCP tools available in this session.',
  ],
  [
    'Agent-facing prose also follows the **create-skill** skill (Cursor\'s built-in for authoring SKILL.md files).',
    'Agent-facing prose also follows the **skill-creator** skill.',
  ],
  [
    '`cursor-team-kit` publishes `control-cli` (CLIs and TUIs) and `control-ui` (browser / Electron / web UIs).',
    'The `run` skill drives CLIs, TUIs, and browser, Electron or web UIs.',
  ],
  [
    'agent mode (readonly strips MCP)',
    '`general-purpose` unless the skill says otherwise',
  ],
  ['configurable via `/setup-pstack`.', `configured in \`${MODELS}\`.`],
  ['the `/setup-pstack` rule', `\`${MODELS}\``],
  ['The `/setup-pstack` budget sets', `The effort in \`${MODELS}\` sets`],
  ['the same slug without `-fast`', 'the same model'],
  [
    'Change only the effort level and whether the slug is fast, and keep the family the role names',
    'Change only the effort level, and keep the model the role names',
  ],
  [
    "Pick the wake mechanism using Cursor's `/loop` command (a built-in, not a pstack skill).",
    'Pick the wake mechanism using the `/loop` skill (a Claude Code built-in, not a pstack skill).',
  ],
  [
    'Use the **create-skill** skill (Cursor\'s built-in for authoring SKILL.md files).',
    'Use the **skill-creator** skill.',
  ],
  // agents/poteto-agent.md
  [
    'With no path, before any other work, search `~/.cursor/plugins/` for a file whose path ends in `skills/poteto-mode/SKILL.md`. If more than one file matches, use the copy whose `.cursor-plugin/plugin.json` has the highest `version`. Your skill catalog hides this skill, so a missing catalog entry does not mean pstack is absent. If no such file exists, stop and tell your parent.',
    'With no path, read `.claude/skills/poteto-mode/SKILL.md` from the repo root. If it does not exist, stop and tell your parent.',
  ],
  // poteto-help: setup, modes and "not in pstack" are Claude Code specific now.
  [
    'The links here point into the installed plugin, which the user may not be able to open, so give the user the file\'s public copy: `https://github.com/cursor/plugins/blob/main/pstack/` followed by its path.',
    `Skill links point into \`${SKILLS}/\`. Guide pages link to the upstream repo.`,
  ],
  [
    '- No `~/.cursor/rules/pstack-models.mdc` means `/setup-pstack` hasn\'t run for this user, so every role uses its default model.',
    `- \`${MODELS}\` sets the model and effort for every role. A missing line means that role uses its skill default.`,
  ],
  [
    "When the model rule is missing and it matters, ask whether the user wants to pick a model for each role and a reasoning budget now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per chat. If the need is also unclear, ask both questions together. Offer two choices:\n\n- Now: give them `/setup-pstack` to type, and answer their question too.\n- Later: answer their question, and add one line saying every role keeps its default model until they run `/setup-pstack`.",
    `When the question is about cost or which models run, point to \`${MODELS}\`. Each line is a role and a \`<model>/<effort>\` value.`,
  ],
  [
    '1. Install with `/add-plugin pstack` in chat, or from Customize in the sidebar.\n2. Run [`/setup-pstack`](../setup-pstack/SKILL.md). It asks for a reasoning budget, maps a model to each role, and writes a rule. The rule applies to new chats.\n3. Start',
    `1. pstack is already installed in this repo: skills in \`${SKILLS}/\`, agents in \`${AGENTS}/\`. \`scripts/port-pstack.mjs\` refreshes them from upstream.\n2. Optionally edit \`${MODELS}\` to change the model and effort per role.\n3. Start`,
  ],
  [
    'Installing changes nothing until the user invokes a skill. Only `/setup-pstack` loads from the user\'s words.',
    'Skills load when the user types them or when `/poteto-mode` runs them.',
  ],
  [
    'Rerun `/setup-pstack` and pick a smaller budget or cheaper models. A role set to `auto` or `inherit-parent` runs on the chat\'s model, which saves tokens when the chat runs on Auto or a cheaper model.',
    `Lower the effort or pick cheaper models in \`${MODELS}\`. A role set to \`inherit-parent\` runs on the chat's model.`,
  ],
  [
    'pstack is built for Cursor. Its skills use the Agent Skills format, so other tools can read them. But most workflow skills, including `/poteto-mode`, `/how`, `/why`, and `/teach`, spawn Cursor subagents with per-role models, and Custom Modes and `/loop` are Cursor features, so those parts may not work there.',
    'This is a Claude Code port of pstack: subagents are `Agent` calls with a `model` and `effort` per role, and `/loop` is a Claude Code skill.',
  ],
  [
    '- Enter on `/poteto-mode` attaches the skill to one message. It fades as the chat moves on.\n- Option+Enter on Mac or Alt+Enter on Windows, or Use as Mode from the skill entry, makes it a Custom Mode. It stays in context every turn until the user exits the mode, and it stays out of casual turns.\n- Cursor\'s docs list Custom Modes in the Agents Window and the CLI. Elsewhere, start each new task with `/poteto-mode`.\n\nLink [Cursor\'s skills docs](https://cursor.com/docs/skills) when this comes up.',
    '- `/poteto-mode` attaches the skill to one message, and it fades as the chat moves on. Start each new task with `/poteto-mode`.',
  ],
  ['| Pick a model for each role and a reasoning budget | [`/setup-pstack`](../setup-pstack/SKILL.md) |', `| Pick a model for each role and a reasoning budget | Edit \`${MODELS}\` |`],
  ['| Build a page whose buttons wake a Grok Bot over a webhook | [`/make-bot-ui`](../make-bot-ui/SKILL.md) |\n', ''],
  [
    '- `/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin.\n- `/loop` and `/create-skill` are Cursor built-ins.',
    '- `/simplify`, `/loop`, `run` and `skill-creator` are Claude Code built-ins that pstack uses.',
  ],
  [
    'Without `/poteto-mode`, a phrase such as "babysit this pr" can start Cursor\'s own skill for the same job instead. ',
    '',
  ],
  ["pstack has no planning skill. Cursor's Plan Mode works alongside it.", "pstack has no planning skill. Claude Code's plan mode works alongside it."],
  ['| The mode stopped applying after a few turns | It was started with Enter. Start it as a Custom Mode, or start each task with `/poteto-mode`. |', '| The mode stopped applying after a few turns | Start each task with `/poteto-mode`. |'],
  ['| A new model choice had no effect | The rule from `/setup-pstack` applies to new chats. Start one. |\n', ''],
  ['| A skill didn\'t load on its own | Only `/setup-pstack` loads from the user\'s words. The others load when the user types them or when `/poteto-mode` runs them, and it doesn\'t run every skill. |', '| A skill didn\'t load on its own | Skills load when the user types them or when `/poteto-mode` runs them, and it doesn\'t run every skill. |'],
  ['or run them as cloud agents, which each get their own machine.', 'with `isolation: "worktree"`.'],
]

/** General rules. */
const RULES = [
  [
    /Families go by prefix: `claude-\*`, and `grok-\*` with `cursor-grok-\*` and `composer-\*`\. A refused `composer-\*` entry runs on [^.]+\./g,
    'Entries are `<model>/<effort>`, where the model is `opus`, `sonnet`, `haiku` or `fable`.',
  ],
  [/\.cursor\/worktrees/g, '.claude/worktrees'],
  [/, or `~\/\.cursor\/plugins\/`/g, ''],
  [/`?~\/\.cursor\/rules\/pstack-models\.mdc`?/g, `\`${MODELS}\``],
  [/the `pstack-models\.mdc` rule/g, `\`${MODELS}\``],
  [/claude-opus-5-5-(max|xhigh|high|medium|low)(-fast)?/g, 'opus/$1'],
  [/grok-4\.7-(max|xhigh|high|medium|low)(-fast)?/g, 'sonnet/$1'],
  [/\bGrok\b/g, 'Sonnet'],
  [/subagent_type: generalPurpose/g, 'subagent_type: general-purpose'],
  [/`generalPurpose`/g, '`general-purpose`'],
  [/, agent mode \(`readonly: false`\)/g, ''],
  [/`environment: "cloud"`/g, '`isolation: "worktree"`'],
  [/\bthe Task tool\b/g, 'the `Agent` tool'],
  [/`Task`/g, '`Agent`'],
  [/\bTask (call|calls|subagent|spawn|spawns|response|tool|`model`)/g, '`Agent` $1'],
  [/\bAskQuestion\b/g, 'AskUserQuestion'],
  [/~\/\.cursor\/projects/g, '~/.claude/projects'],
  [/~\/\.cursor\/skills/g, '~/.claude/skills'],
  [/\.cursor\/skills/g, '.claude/skills'],
  [/`agent-transcripts\/` directory/g, 'transcript directory (`~/.claude/projects/<slug>/`)'],
  [/the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)/g, 'the `/simplify` skill'],
  [/`\/deslop` from `cursor-team-kit`/g, '`/simplify`'],
  [/`control-ui` or `control-cli` from `cursor-team-kit`/g, 'the `run` skill'],
  [/`control-(ui|cli)` from `cursor-team-kit`/g, 'the `run` skill'],
  [/ \(from `cursor-team-kit`\)/g, ''],
  [/Cursor's built-in `create-skill` skill/g, 'the `skill-creator` skill'],
  [/ This playbook replaces Cursor's built-in babysit skill[^.]*\./g, ''],
  [/\(\.\.\/\.\.\/docs\/guide\/([^)]+)\)/g, `(${GUIDE}/docs/guide/$1)`],
  [/\(\.\.\/\.\.\/README\.md\)/g, `(${GUIDE}/README.md)`],
  [/, and readonly strips MCPs/g, ''],
  [/`environment: "local"`/g, 'no `isolation`'],
  [/, and mention once that a Custom Mode keeps it on\./g, '.'],
  [/Cursor cloud agent/g, 'remote agent (`isolation: "remote"`)'],
  [/\bcloud agents\b/g, 'remote agents'],
  [/\bCloud agents\b/g, 'Remote agents'],
  [/\bcloud agent's status in the Cursor dashboard/g, "remote agent's status on claude.ai/code"],
  [/\bCursor's\b/g, "Claude Code's"],
  [/\bCursor\b/g, 'Claude Code'],
  [/\b([Aa]) `Agent`/g, '$1n `Agent`'],
]

/** Must not survive in any ported markdown file. */
const LEFTOVERS =
  /\.cursor|cursor-team-kit|grok|AskQuestion\b|generalPurpose|add-plugin|setup-pstack|make-bot-ui|readonly: (true|false)|\.\.\/\.\.\/docs|\bTask tool\b/i

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

function port(text) {
  let out = text
  for (const [from, to] of EXACT) out = out.split(from).join(to)
  for (const [pattern, to] of RULES) out = out.replace(pattern, to)
  return out
}

function editFrontmatter(file, edit) {
  const text = fs.readFileSync(file, 'utf8')
  const end = text.indexOf('\n---', 4)
  const lines = text.slice(4, end).split('\n')
  fs.writeFileSync(file, `---\n${edit(lines).join('\n')}${text.slice(end)}`)
}

const ported = []
for (const skill of fs.readdirSync(path.join(source, 'skills'))) {
  if (SKIPPED.has(skill)) continue
  const target = path.join(SKILLS, skill)
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(path.join(source, 'skills', skill), target, { recursive: true })
  ported.push(target)
}
fs.mkdirSync(AGENTS, { recursive: true })
for (const agent of fs.readdirSync(path.join(source, 'agents'))) {
  const target = path.join(AGENTS, agent)
  fs.copyFileSync(path.join(source, 'agents', agent), target)
  ported.push(target)
}
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(SKILLS, 'PSTACK-LICENSE'))

const files = ported.flatMap((p) => (fs.statSync(p).isDirectory() ? filesUnder(p) : [p]))
for (const file of files.filter((f) => /\.(md|sh|mjs|ts)$/.test(f))) {
  fs.writeFileSync(file, port(fs.readFileSync(file, 'utf8')))
}

editFrontmatter(path.join(SKILLS, 'poteto-mode/SKILL.md'), (lines) =>
  lines
    .filter((l) => !/^(icon|color):/.test(l))
    .map((l) => (l === 'name: Poteto Mode' ? 'name: poteto-mode' : l)),
)
editFrontmatter(path.join(SKILLS, 'typescript-best-practices/SKILL.md'), (lines) =>
  lines.filter((l) => !l.startsWith('disable-model-invocation:')),
)
for (const skill of ['swarm', 'arena']) {
  editFrontmatter(path.join(SKILLS, skill, 'SKILL.md'), (lines) => [...lines, 'argument-hint: "<task>"'])
}
editFrontmatter(path.join(AGENTS, 'poteto-agent.md'), (lines) =>
  lines.map((l) => (l === 'is_background: true' ? 'background: true' : l)),
)
editFrontmatter(path.join(AGENTS, 'comment-sicko.md'), (lines) => [...lines, 'tools: Read, Grep, Glob'])

fs.writeFileSync(
  MODELS,
  `# pstack models

The model and effort each pstack role uses, written \`<model>/<effort>\`. The model is an \`Agent\` tool model (\`opus\`, \`sonnet\`, \`haiku\`, \`fable\`). The effort is \`low\`, \`medium\`, \`high\`, \`xhigh\` or \`max\`. \`inherit-parent\` runs the role on the parent chat's model. A comma list is a panel and spawns one agent per entry. Delete a line to fall back to the skill's default.

feature, refactoring: sonnet/xhigh
bug-fix: sonnet/xhigh
perf-issue: sonnet/xhigh
hillclimb: sonnet/xhigh
judgment and prose: opus/xhigh
hardest tasks: opus/xhigh
how explorer: sonnet/xhigh
how explainer: opus/xhigh
why investigators: sonnet/xhigh
why synthesizer: opus/xhigh
reflect tooling: sonnet/xhigh
reflect judgment, divergent, synthesizer: opus/xhigh
arena runners: opus/xhigh, sonnet/xhigh
arena cross-judge pool: opus/xhigh, sonnet/xhigh
swarm workers: sonnet/xhigh
architect runners: opus/xhigh, sonnet/xhigh
interrogate reviewers: opus/xhigh, sonnet/xhigh
`,
)

const problems = []
for (const file of files.filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    if (LEFTOVERS.test(line)) problems.push(`${file}:${i + 1}: ${line.slice(0, 160)}`)
  })
  if (file.endsWith('SKILL.md') && !/^---\nname: [a-z0-9-]+\ndescription: .+[\s\S]*?\n---\n/.test(text)) {
    problems.push(`${file}: frontmatter needs a kebab-case name and a description`)
  }
}
if (problems.length) {
  console.error(`Leftover Cursor-specific text:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`Ported ${ported.length} skills and agents into ${SKILLS} and ${AGENTS}.`)
