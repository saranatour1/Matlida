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
import { emailPollsTable, emailsTable } from './models/emails/table'
import { judgmentsTable } from './models/judgments/table'
import { mailboxesTable } from './models/mailboxes/table'
import { projectsTable } from './models/projects/table'
import { newsSettingsTable } from './models/news/table'
import { pagesTable } from './models/pages/table'
import { plansTable } from './models/plans/table'
import { remindersTable } from './models/reminders/table'
import { tasksTable } from './models/tasks/table'
import {
  phoneLinksTable,
  photonMessagesTable,
  receivedTextsTable,
} from './models/texts/table'
import { usageTable } from './models/usage/table'
import { userActivityTable, usersTable } from './models/users/table'
import { videosTable } from './models/videos/table'

export default defineSchema({
  users: usersTable,
  userActivity: userActivityTable,
  projects: projectsTable,
  bots: botsTable,
  commands: commandsTable,
  comments: commentsTable,
  contacts: contactsTable,
  phoneLinks: phoneLinksTable,
  photonMessages: photonMessagesTable,
  receivedTexts: receivedTextsTable,
  mailboxes: mailboxesTable,
  emails: emailsTable,
  emailPolls: emailPollsTable,
  plans: plansTable,
  pages: pagesTable,
  newsSettings: newsSettingsTable,
  usage: usageTable,
  judgments: judgmentsTable,
  reminders: remindersTable,
  tasks: tasksTable,
  calls: callsTable,
  callLines: callLinesTable,
  liveTurns: liveTurnsTable,
  videos: videosTable,
})
