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

## Open questions

- Calls to your real phone, rather than the app: no provider is picked
  (not Twilio). The ring only reaches an open Matilda tab.
- The 0.3 and 0.7 thresholds are starting points. Adjust them once dev's logs
  show real answers.

## Next steps

- [x] PR 1: answer in the call bar, snooze, Jev on missed or declined calls, saved time zone
- [x] PR 2: once vs recurring (`scheduler` vs `@convex-dev/crons`), Jev pause and stop, and pause/resume/stop in the Library
- [ ] PR 3: check-in calls on an hourly cron, with `shouldCallNow` and the daily limit
- [ ] PR 4: "what can you do" as command pills (`show_commands`)
- [ ] PR 5: attachments through the agent component's file storage, with paste and drop
- [ ] PR 6: edit and retry (`deleteMessageRange`, then reply again)
- [ ] PR 7: study component (`convex/components/study/`): cards, quizzes, spaced review, and review calls
