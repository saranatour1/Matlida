# Matilda calls you: reminders, check-ins and study

Asked for on 2026-10-22: Matilda should call with reminders through the
call bar under the chat input, and know when to snooze you, call again or
call just to chat. Reminders should know whether they happen once or keep
recurring, and when to pause or stop. Also asked for: command pills for
"what can you do", attachments, edit and retry, and flash cards and quizzes.
This file holds what was found, what each Jev judgment does, the limits
code puts on them, and the next steps. Each PR in the stack updates it.

## Findings (before PR 1)

- A call reminder rang once in the app for 30 seconds (`reminders.ring`).
  Missed, it texted you when texting was linked and posted in the chat.
  Declined, it posted in the chat. Nothing ever called again.
- Answering opened the call in a side panel (`CallPanel`), separate from
  the call bar under the chat input (`VoiceBar`). Since #113 removed the
  header call button, the side panel was only used for answered reminders.
- Reminders happen once: `scheduler.runAt` on `dueAt`. "Every weekday at 9"
  can't be set.
- The server didn't know your time zone outside a single reply (the browser
  sends it with each message), so nothing could keep calls to your daytime.
- Jev (`convex/lib/decide.ts`) already answers `decide`, `needs_follow_up`
  and `problem_check`, through `metered`, so its cost counts against your
  AI budget.

## Jev judgments

| Judgment | Where | Question | Answers | What code does with it |
| --- | --- | --- | --- | --- |
| `afterMissedCall` (PR 1) | `reminders.miss` | You didn't pick up (or declined). Given the reminder, calls so far, your local time and the last 6 chat turns, what next? | `call_again_soon`, `call_again_later`, `text_instead`, `leave_in_chat` | Soon is 10 min and later is 1 h, moved to 9am if it lands outside 9am–9pm. Text only when texting is linked, otherwise it's left in the chat. The 3rd miss stops without asking. If Jev fails or you're over budget, it's left in the chat. |
| `howOften` (PR 2) | `set_reminder` | Once, or recurring, and how often? | `once`, `daily`, `weekdays`, `weekly`, `monthly`, `custom` | Once uses `scheduler.runAt`. Recurring registers a cron with the crons component. |
| `checkRecurring` (PR 2) | before each recurring fire | Is it still needed? Deliver, skip, pause, or reach you another way? | `still_needed` (Noul) plus a choice | Under 0.3 it stops and says so. The channel only changes at 0.7 or above. |
| `shouldCallNow` (PR 3) | hourly check-in | Is now a good time to call to chat, given open work, what's owed, and when you last talked? | Noul | At 0.7 or above it calls, within the daily limit below. |

Each judgment is one `experimental_decide` call, about $0.005, metered.

## Limits code enforces, whatever Jev says

- At most 3 calls per reminder (`MAX_CALLS`).
- Call-agains only between 9am and 9pm in your time zone (`inDaytime`). A
  reminder you set for 7am still rings at 7am.
- Snooze is yours: it always rings again in 10 minutes and doesn't ask Jev.
- Check-in calls (PR 3): at most 3 a day, none within 2 hours of another
  call, only if you've chatted in the last 7 days, and a switch to turn them off.

## Recurring reminders (PR 2)

- `set_reminder` asks Jev (`howOften`) whether the request repeats. If the
  assistant already passed `cron`, it's custom and Jev isn't asked. If Jev
  fails, it's once. Messages to contacts are always once.
- Once: `scheduler.runAt`, as before. Recurring: a cron from
  `@convex-dev/crons`, named `reminder:<id>`, with the spec built from the
  first time's hour and minute (`cronFor`) and the owner's IANA zone as its
  `tz`, so daylight saving keeps it at 9am.
- When it's sent, a recurring reminder goes back to `scheduled` and its
  missed-call count resets. Jev's `checkRecurring` runs when the cron fires,
  not on call-agains.
- Pause deletes the cron and Resume registers it again, so a paused
  reminder costs nothing. Stop is Cancel. Jev's own stop or pause posts why
  in the chat.
- Dates are done with luxon (rule in AGENTS.md). PR 1's `inDaytime` moved to
  it, which also makes it right across daylight saving.

## Check-in calls (PR 3)

- Hourly cron `check in` → `checkIns.run`. Candidates (`checkIns.candidates`):
  people who messaged an assistant in the last 7 days but not in the last
  hour (`users.lastChat`, written at most every 10 minutes), with check-ins
  on, in their 9am–9pm, and with no call with that assistant or check-in in
  2 hours. It looks at the 100 most recent chatters each hour.
- For each, one Jev call (`shouldCallNow`) over the last 10 turns and open
  work: is a call welcome now, and about which recent request or running
  work? At 0.7 or above, it inserts a call reminder with `kind: 'checkin'`
  and rings through the same path as a reminder. The opening is "Hi, it's
  Matilda. Checking in about: …".
- Limit: `checkInCall`, 3 a day per user, counted per UTC day. A fixed window
  without `start` begins at a random time and let a 4th call through in the
  tests, so it's pinned to `start: 0`.
- A missed check-in is left in the chat. Jev isn't asked to call again.
- Off switch: "Let assistants call to check in" on Settings → Account.
- Cost: up to 12 Jev calls a day per active person, about $0.06.

## Study (PR 7)

- Component `study`: `decks` (title, topic, format cards or quiz) and
  `items` (card, choice or short answer, plus an SM-2-style schedule: `due`,
  `interval`, `ease`, `reps`). `nextReview`: again comes back in 10 minutes
  and starts over, good goes 1 day, then 6, then by ease, hard grows more
  slowly and easy faster. Dates are done with luxon.
- `make_study_set` (tool), `/study` and `/quiz` (commands), and the
  Library's New deck form all call `makeDeck`. It writes the items with
  `generateObject` on the chat model, metered against your budget, and
  turns a broken choice question into a short-answer one.
- Short answers are graded by Jev (`gradeAnswer`, right at 0.5): different
  wording is fine, partly right isn't. Right counts as good, wrong as again.
- Review calls: check-ins pass the number of due cards to `shouldCallNow`,
  which can choose `review`. That call opens with up to 5 due questions.

## Open questions

- Calls to your real phone: an assistant can phone a number you type
  (`call_phone`, through ElevenLabs and the Photon number, see
  `docs/setup/channels.md`). Reminders still ring only an open Matilda tab.
- The thresholds (`JEV_THRESHOLDS` in `convex/lib/decide.ts`: 0.3 to stop a
  recurring reminder, 0.7 to switch its channel, 0.7 for a check-in call,
  0.5 for a right answer) are starting points. On 2026-10-22 dev had no
  answers to tune them from: 4 reminders, no check-ins, no recurring ones,
  and Jev's answers weren't kept. Every answer is now kept in `judgments`.
  Check `pnpm exec convex run api/judgments:summary '{"kind":"check_in"}'`
  (or `recurring`, `after_missed_call`, `answer`) after a few weeks, then
  move a threshold where the outcomes say it's wrong.

## Next steps

- [x] PR 1: answer in the call bar, snooze, Jev on missed or declined calls, saved time zone
- [x] PR 2: once vs recurring (`scheduler` vs `@convex-dev/crons`), Jev pause and stop, and pause/resume/stop in the Library
- [x] PR 3: check-in calls on an hourly cron, with `shouldCallNow` and the daily limit
- [x] PR 4: "what can you do" as command pills (`show_commands`)
- [x] PR 5: attachments through the agent component's file storage, with paste and drop
- [x] PR 6: edit and retry (`deleteByOrder`, then reply again)
- [x] PR 7: study component (`convex/components/study/`): cards, quizzes, spaced review, and review calls

### Follow-ups, not started

- Grade study cards by voice on a review call. The call opens with the
  questions and the chat has them, but answers given on the call aren't
  recorded yet. A `grade_study_item` tool that knows the item ids would do it.
- Attach markdown, text and audio files. The hourly `commands.sweepFiles`
  would delete them today, so it first needs to skip files the agent
  component's `files` table references.
- Check live which gateway models read PDF attachments.
- Phone calls for reminders and check-ins, through `callPhone`, to a number
  you save in Settings.
