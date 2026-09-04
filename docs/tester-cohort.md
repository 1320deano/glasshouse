# The tester cohort (Phase 4 exit test)

Ten semi-technical builders, five days. The test passes when 7 of 10 still have the tab open on day five and 3 or more
say "I'd pay". Everything below is built; this is how to run it.

## Who to recruit

People who run Claude Code, Codex or Cursor on their own app and do not read the code it writes. Founders, designers who
ship, operators with a side project. Not developers: they have free dashboards and will judge it as one.

Ten confirmed, so aim for fifteen asks. One line: "I built a second-monitor tab that tells you what your AI coding agents
are doing in plain English. Five days, one command to install, I'd like to watch what breaks."

## Set-up (once)

1. Deploy the hosted Room (`docs/what-christopher-needs-to-do.md`, Phase 4 section).
2. Set `GLASSHOUSE_INVITE_ONLY=1` and add each tester's email on `/admin`.
3. Warn each tester the sign-in email may land in spam. Send them `/signin`.
4. When they have signed in, set them to Pro on `/admin` for the test (Stripe is off during the test).
5. Ask them to run the connect command from `/connect` in their project folder, then to start their agent as usual.

## Each day

- Open `/admin`. "Active in the last 5 days" is the day-five number. "Last opened" is the tab test; "last agent
  activity" says whether they used an agent at all (no activity means nothing to watch, which is a different problem).
- Read "What broke". A tester who wrote nothing and went quiet is the one to ring.
- Watch AI cost per Pro person; the brief's ceiling is £5 a month.

## Day five

Ask each tester three questions, by message, not a form:

1. Is the tab still open? (Check it against "last opened" on the dashboard; people are kind.)
2. What did it show you that you would have missed? (If they cannot name one, the onboarding failed for them.)
3. Would you pay £15 a month for it? Why or why not?

Write the answers into `docs/tester-results.md`. Fix the three worst things from "What broke" before launch. Then decide
the launch date and record the demo (`docs/demo-script.md`).
