import { defineSchema } from 'convex/server'
import { botsTable } from './models/bots/table'
import {
  callLinesTable,
  callsTable,
  liveTurnsTable,
} from './models/calls/table'
import { commandsTable } from './models/commands/table'
import { commentsTable } from './models/comments/table'
import { contactsTable } from './models/contacts/table'
import { emailsTable } from './models/emails/table'
import { mailboxesTable } from './models/mailboxes/table'
import { projectsTable } from './models/projects/table'
import { newsSettingsTable } from './models/news/table'
import { pagesTable } from './models/pages/table'
import { plansTable } from './models/plans/table'
import { remindersTable } from './models/reminders/table'
import {
  cartItemsTable,
  priceWatchesTable,
  shoppingDetailsTable,
} from './models/shopping/table'
import { tasksTable } from './models/tasks/table'
import {
  phoneLinksTable,
  photonMessagesTable,
  receivedTextsTable,
  telegramPollsTable,
} from './models/texts/table'
import { threadsTable } from './models/threads/table'
import { usageTable } from './models/usage/table'
import { voiceClipsTable } from './models/voiceClips/table'
import { usersTable } from './models/users/table'

export default defineSchema({
  users: usersTable,
  projects: projectsTable,
  threads: threadsTable,
  bots: botsTable,
  commands: commandsTable,
  comments: commentsTable,
  contacts: contactsTable,
  phoneLinks: phoneLinksTable,
  photonMessages: photonMessagesTable,
  receivedTexts: receivedTextsTable,
  telegramPolls: telegramPollsTable,
  mailboxes: mailboxesTable,
  emails: emailsTable,
  plans: plansTable,
  pages: pagesTable,
  newsSettings: newsSettingsTable,
  usage: usageTable,
  voiceClips: voiceClipsTable,
  reminders: remindersTable,
  shoppingDetails: shoppingDetailsTable,
  cartItems: cartItemsTable,
  priceWatches: priceWatchesTable,
  tasks: tasksTable,
  calls: callsTable,
  callLines: callLinesTable,
  liveTurns: liveTurnsTable,
})
