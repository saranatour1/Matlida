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
      'Work out what the user wants made from what they wrote after /create, and make it with the right tool, without asking which: a plan (save_plan, or save_plan then run_plan if they want it done), a list to tick off (add_to_list), posts, an email or a document (write the draft in your reply), research (research), a reminder or a message to someone (set_reminder, with save_contact first if needed), or a reusable command (save_command). If it could mean two very different things, ask one short question. Say in one line what you made.',
  },
  {
    name: 'chart',
    description: 'Show numbers as a chart',
    markdown:
      'Show what the user asked for after /chart as a chart with show_chart. Use their numbers, or look them up with web_search and name the source; never make numbers up. Pick the kind: line for change over time, bar to compare, area for totals over time, pie for parts of a whole. Add one or two lines on what it shows.',
  },
  {
    name: 'preview',
    description: 'Draft a post and preview it as it would look',
    markdown:
      'Draft the post the user describes after /preview and show it with preview_post on each platform they name, or LinkedIn when they name none. Keep within each platform’s length, and write it the way people post there. Nothing is posted; offer to adjust it.',
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
      "Draft posts about what the user wrote after /posts, one for each of X, Reddit and Discord, under a heading each. X: at most 280 characters, or a short thread numbered 1/, 2/. Reddit: a title and a body in a plain, non-promotional tone, and a suggested subreddit. Discord: friendly, under 2000 characters, markdown allowed. Use web_search first if it needs current facts. Show each one with preview_post so the user sees it as it would look. Don't post anything; offer to adjust the tone or length.",
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
    name: 'decide',
    description: 'Pick between options, with Jev',
    markdown:
      'Decide what the user asks after /decide with the decide tool. List every option they give (if they give none, ask for them in one short question), and put what matters from the chat in the context: their goals, limits and preferences. Say the pick and why in one or two lines. If the pick’s probability is under 0.5, say it’s close and name the runner-up.',
  },
  {
    name: 'todo',
    description: 'Add to your to-do list',
    markdown:
      'Add what the user lists after /todo to their "To-do" list with add_to_list, one item each, short and starting with a verb. If they wrote nothing after /todo, call add_to_list with no items to show the list. Then say in one line what you added; the card shows the list.',
  },
  {
    name: 'shopping',
    description: 'Add to your shopping list, by aisle',
    markdown:
      'Add what the user needs after /shopping to their "Shopping list" with add_to_list. Put each item in a section by aisle: Produce, Dairy & eggs, Meat & fish, Bakery, Pantry, Frozen, Drinks, Household, Other. Merge duplicates, and keep quantities in the item ("2 lemons"). With nothing after /shopping, show the list. Say in one line what you added.',
  },
  {
    name: 'meals',
    description: 'Plan meals and the groceries for them',
    markdown:
      'Plan the meals the user asks for after /meals (5 dinners unless they say otherwise), fitting their tastes, diet, budget and time from the chat. Show the plan with show_table (columns: Day, Meal, Time, Notes). Then add the groceries for all of it to their "Shopping list" with add_to_list, by aisle, merging duplicates and skipping staples like salt and oil. Say in one line what you added.',
  },
  {
    name: 'recipe',
    description: 'A recipe from what you have or want',
    markdown:
      'Suggest one recipe for what the user has or wants after /recipe, fitting any diet or time limit they give, and show it with show_recipe with an amount for each ingredient. Say in one line why it fits. The card lets them change the servings and add the ingredients to their Shopping list.',
  },
  {
    name: 'pack',
    description: 'A packing list for a trip',
    markdown:
      'Make a packing list for the trip after /pack. If you know where and when, check the weather with web_search. Start a list named "Packing: <place>" with add_to_list, with sections Clothes, Toiletries, Documents & money, Tech, Health, Other, sized to the trip length. Say in one line what the weather looks like.',
  },
  {
    name: 'rewrite',
    description: 'Rewrite text: clearer, shorter, friendlier',
    markdown:
      'Rewrite the text the user pasted after /rewrite, keeping its meaning and facts; add nothing. Show up to three versions with show_drafts, labelled by what changed (like Clearer, Shorter, Friendlier, More formal), with the tone they asked for first. Say in one line what you changed.',
  },
  {
    name: 'reply',
    description: 'Draft replies to a message',
    markdown:
      'Draft a reply to the message the user pasted or points to after /reply. If they point to an email or a text, find it with find_emails or find_texts first. Show two or three short versions with show_drafts, labelled by stance (like Yes, No thanks, Ask for more time), with `to` set, in the language and tone of the original.',
  },
  {
    name: 'translate',
    description: 'Translate text, ready to copy',
    markdown:
      'Translate the text after /translate into the language the user names, or into English if they name none (and into the language of the chat if it is already English). Keep names, numbers and formatting. Show it with show_drafts, labelled by language, and add a more casual version if the text is chatty.',
  },
  {
    name: 'tldr',
    description: 'Summarize text or a link',
    markdown:
      'Summarize what the user pasted or linked after /tldr; read a link with web_search. Reply with a one-line TL;DR in bold, then at most five key points, then any dates, numbers or action items. No preamble.',
  },
  {
    name: 'compare',
    description: 'Compare options side by side',
    markdown:
      'Compare the options the user names after /compare on the three to five things that matter most for their use. Look up current facts and prices with web_search; never make them up. Show it with show_table: options as rows, criteria as columns, the best fit highlighted, sources in the note. Then say which fits best and why in two lines, and offer /decide if it is close.',
  },
  {
    name: 'workout',
    description: 'A weekly workout plan',
    markdown:
      'Make a weekly workout plan for the goal after /workout. If their level or time per session is missing, ask in one short question. Show it with show_table (columns: Day, Workout, Duration, Notes), with rest days, building up gradually. Suggest checking with a doctor first if they mention an injury or health condition.',
  },
  {
    name: 'explain',
    description: 'Explain something simply',
    markdown:
      'Explain what the user asks after /explain as if they are new to it: a one-sentence answer first, then a plain explanation with one everyday example, then one short question to check it landed. Define any jargon you use.',
  },
  {
    name: 'research',
    description: 'Research a topic in depth',
    markdown:
      'Research what the user wrote after /research with the research tool. Give the key findings first, then the details, then open questions and sources.',
  },
] as const
