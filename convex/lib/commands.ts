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
    description: 'Draft posts in a few versions, as they would look',
    markdown:
      "Draft the post the user describes after /preview, for each platform they name, or for LinkedIn, X and Discord when they name none. Write three versions per platform, each with a different angle (like Punchy, Story, Question), within the platform's length and written the way people post there; for Discord, suggest a channel. Show them all with one preview_posts call. Then say in one line which you would pick. Nothing is posted.",
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
      "Draft posts about what the user wrote after /posts, one for each of X, Reddit and Discord, under a heading each. X: at most 280 characters, or a short thread numbered 1/, 2/. Reddit: a title and a body in a plain, non-promotional tone, and a suggested subreddit. Discord: friendly, under 2000 characters, markdown allowed. Use web_search first if it needs current facts. Show them all with one preview_posts call, two versions per platform, so the user can compare them as they would look. Don't post anything; offer to adjust the tone or length.",
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
    name: 'draw',
    description: 'Draw a diagram in Excalidraw',
    markdown:
      'Draw what the user describes after /draw with draw_diagram: pick the Mermaid kind that fits (a flowchart for steps and decisions, a sequenceDiagram for who talks to whom, a classDiagram for how things relate) and keep labels to a few words. If they gave nothing to go on, ask what to draw in one short question. After it shows, say in one line that they can edit it on the canvas and download it.',
  },
  {
    name: 'image',
    description: 'Make a picture',
    markdown:
      'Make the picture the user describes after /image with generate_image. Turn their words into a detailed prompt (subject, style, setting, light and mood), keeping anything they spelled out exactly, and pick the shape that suits it. If they gave nothing to go on, ask what to make in one short question. After it shows, offer one or two tweaks in a line.',
  },
  {
    name: 'video',
    description: 'Make a short video',
    markdown:
      'Make the video the user describes after /video with generate_video. Turn their words into a detailed prompt (subject, action, camera movement, setting, light and mood), keeping anything they spelled out exactly, and pick wide or tall. If they gave nothing to go on, ask what to make in one short question. Say it takes a few minutes and shows up in the chat when it is ready.',
  },
  {
    name: 'shop',
    description: 'Find things to buy, and buy them',
    markdown:
      "Find what the user wants after /shop with find_products, following their sizes and preferences in `notes`. If something you need is missing, like a size or a budget, ask in one short question first. Pick the three to six best options; say in two lines which you would choose and why. When they choose, find the right size or color with product_options and add it with add_to_cart. The cart has a Buy button per store that opens the store's checkout with their details filled in, and they pay there. Never say you bought or paid for anything.",
  },
  {
    name: 'gift',
    description: 'Find a gift for someone',
    markdown:
      'Find a gift for the person after /gift. If their interests or the budget are missing, ask in one short question. Search a few different kinds of gift with find_products, show the best six or fewer, and say in two lines why each fits. Add the one they pick with add_to_cart.',
  },
  {
    name: 'watch',
    description: 'Hear when a price drops',
    markdown:
      "Watch the price of what the user names after /watch. If you don't have its variantId yet, find it with find_products (and product_options for a size or color). If they gave no price, ask what they want to pay in one short question. Then call watch_price. Say in one line that you'll post here when it drops, or that it is already there if alreadyBelow is true.",
  },
  {
    name: 'cart',
    description: 'Your cart, ready to buy',
    markdown:
      "Show the user's cart with show_cart. Say in one line how many items from how many stores, and that Buy opens each store's checkout with their details filled in.",
  },
  {
    name: 'news',
    description: 'What happened around the world',
    markdown:
      'Get the user\'s news with get_news. If they named topics after /news, pass them for this time. If it returns needsSetup, or they wrote "setup" or want to change what they follow, call setup_news with any topics they mentioned and say in one line to pick what they follow and press Save. Otherwise sum up the biggest story in two lines; the card shows the rest with sources. Never make up a story or a link.',
  },
  {
    name: 'report',
    description: 'Write a report you can edit',
    markdown:
      'Write a report on what the user asks after /report. Research it with research or web_search, then save it with write_page (kind report): a short summary first, then sections with headings, and sources at the end. Say in one line what it covers; they can open the page to edit it, or ask you to keep it up to date with keep_page_updated.',
  },
  {
    name: 'memo',
    description: 'Write a memo you can edit',
    markdown:
      'Write a memo about what the user asks after /memo and save it with write_page (kind memo): To, From, Date and Subject lines, the point in the first paragraph, then the details and next steps. Ask who it is for in one short question if that is missing. Say in one line what it says.',
  },
  {
    name: 'dashboard',
    description: 'Build a dashboard that stays up to date',
    markdown:
      'Build a dashboard for what the user wants to track after /dashboard. Use their numbers or look them up with web_search; never make them up. Save it with write_page (kind dashboard): three to six metrics with label, value, suffix, change, context and a trend of recent values when you have them, and short notes in the markdown with sources. Then offer to keep it up to date every day with keep_page_updated.',
  },
  {
    name: 'today',
    description: 'Your day at a glance',
    markdown:
      'Call get_today and brief the user in two to four lines: first what needs them (messages waiting for their OK, tasks to start, emails to answer), then what is coming up, then their lists. The card shows the details, so pick what matters and end with one suggestion for what to do first.',
  },
  {
    name: 'dayplan',
    description: 'Plan your day in time blocks',
    markdown:
      'Plan the rest of the user\'s day after /dayplan. Call get_today for what is due, then lay out time blocks from now to the end of their day with show_timeline (when like "9:00–10:30", a short title, a detail if useful): fixed times they mention kept, the hardest work first, breaks included. Offer to set reminders for the key blocks with set_reminder.',
  },
  {
    name: 'trip',
    description: 'A day-by-day trip plan',
    markdown:
      'Plan the trip after /trip day by day, with morning, afternoon and evening. Check opening hours, travel times and prices with web_search where it matters; never make them up. Show it with show_timeline, grouped by day (like "Day 1 · Sat 14 Nov"). Offer /pack for a packing list.',
  },
  {
    name: 'split',
    description: 'Split a bill: who owes whom',
    markdown:
      'Split the costs the user describes after /split with split_costs: everyone involved, and each cost with who paid and who shares it (everyone unless they say otherwise). If who paid is unclear, ask in one short question. Never do the math yourself. Say in one line who pays whom; the card shows the rest.',
  },
  {
    name: 'meet',
    description: 'Find a time across time zones',
    markdown:
      "Find a time for the people and places after /meet with compare_times, using each place's IANA time zone (like Europe/London) and the time they suggest, or now. Say the best window in each place's local time in one or two lines. If no hour has everyone in working hours, say so and suggest the least bad one.",
  },
  {
    name: 'focus',
    description: 'Start a focus timer',
    markdown:
      'Start a focus timer for what the user says after /focus with start_timer, 25 minutes unless they give a time. Say in one line what to focus on, and offer a break reminder with set_reminder.',
  },
  {
    name: 'convert',
    description: 'Convert units, currencies and sizes',
    markdown:
      'Convert what the user asks after /convert: units, cooking measures, clothing sizes or currencies. For currencies, get the current rate with web_search and say its date and source. Answer in bold first, then the rate or formula in one line.',
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
      'Summarize what the user pasted or linked after /tldr with quick_summary. For a link, read it with web_search first and summarize what that found. Reply with the summary as it comes back, with no preamble.',
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
