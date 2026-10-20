/**
 * Commands every workspace has without saving them: `/name` followed by what
 * it's about, like `/posts our launch week`. A Library command with the same
 * name replaces one. Plain strings, so the browser lists them too.
 */
export const BUILT_IN_COMMANDS = [
  {
    name: 'create',
    description: 'Say what you want made, and it works out how',
    markdown:
      'Work out what the user wants made from what they wrote after /create, and make it with the right tool, without asking which: a plan (save_plan, or save_plan then run_plan if they want it done), posts, an email or a document (write the draft in your reply), research (research), a reminder or a message to someone (set_reminder, with save_contact first if needed), or a reusable command (save_command). If it could mean two very different things, ask one short question. Say in one line what you made.',
  },
  {
    name: 'plan',
    description: 'Make a plan and save it to the Library',
    markdown:
      'Make a plan for what the user wrote after /plan. If the goal is unclear, ask one short question first. Save it with save_plan as 3 to 8 concrete steps, then sum it up in two lines.',
  },
  {
    name: 'run',
    description: 'Make a plan and work through it step by step',
    markdown:
      'Make a plan for what the user wrote after /run and carry it out: save it with save_plan as 3 to 8 steps you can do yourself with your tools, then call run_plan with its planId. Tell the user to press Start on the card.',
  },
  {
    name: 'posts',
    description: 'Draft posts for X, Reddit and Discord',
    markdown:
      "Draft posts about what the user wrote after /posts, one for each of X, Reddit and Discord, under a heading each. X: at most 280 characters, or a short thread numbered 1/, 2/. Reddit: a title and a body in a plain, non-promotional tone, and a suggested subreddit. Discord: friendly, under 2000 characters, markdown allowed. Use web_search first if it needs current facts. Don't post anything; offer to adjust the tone or length.",
  },
  {
    name: 'email',
    description: 'Draft an email',
    markdown:
      'Draft an email from what the user wrote after /email: a subject line, then the body, short and in their voice. If who it is for or what it should say is missing, ask first. If they want it sent to a saved contact at a time, offer set_reminder with `to` and `say`.',
  },
  {
    name: 'doc',
    description: 'Draft a document in markdown',
    markdown:
      'Draft a document about what the user wrote after /doc, in markdown: a title, a two-line summary, then sections with headings. Use research or web_search when it needs facts, and name your sources at the end.',
  },
  {
    name: 'research',
    description: 'Research a topic in depth',
    markdown:
      'Research what the user wrote after /research with the research tool. Give the key findings first, then the details, then open questions and sources.',
  },
] as const
