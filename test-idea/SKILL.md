---
description: Test a business or product idea against a panel of simulated customers (synthetic customer research) — builds 5 varied personas, interviews each in its own subagent so they can't anchor on each other, then reports objections, price signals, confusion, and what to verify with real people. Use when I ask to test, validate, or pressure-test an idea, pitch, or price with fake/test/simulated customers, or name /test-idea.
---

# Test an idea with simulated customers

Simulated customers find weak spots — unclear pitch, unexpected objections,
wrong target, price friction. They **cannot** prove demand: they have no real
money or real behaviour, and AI personas skew agreeable. Every report says this
once and ends with what to check with real people. Never present a simulated
"yes" as validation.

Write everything for the user in short, plain English (or the language they
wrote in).

## 1. Get the brief

Need four things. Take what's already in the conversation; ask once, in a
single message, for whatever is missing:

1. **Idea** — what it is, what problem it solves
2. **Target customer** — who, even a rough guess
3. **Price** — or "not decided"
4. **Main question** — demand, price, a feature, the pitch/name?

In the same message, ask for the market (country/city) — it changes budgets
and alternatives. If the user skips it, don't guess: keep personas
location-neutral and say so in the report.

## 2. Build the panel

Five personas, deliberately spread — not five versions of the ideal buyer:

| Slot | Who |
|---|---|
| Ideal | Fits the target exactly, feels the problem often |
| Budget | Has the problem, money is tight |
| Satisfied | Already uses a workaround or competitor and is fine with it |
| Skeptic | Has been burned by similar products; distrusts claims |
| Edge | Adjacent to the target — a gatekeeper, buyer-for-someone-else, or a segment the user hasn't considered |

Each persona gets: name, age, location, job/situation, income band, **how they
handle the problem today and what it costs them** (money or time), one thing
they care about most, and one concrete reason they might say no. At least two
personas should lean toward no. Show the panel to the user as a compact table,
then carry on — don't wait for approval unless the brief was very thin.

## 3. Interview each persona — one subagent each

Use fresh `general-purpose` agents — never `fork`, which would inherit this
conversation and the user's hopes for the idea. Put the persona's name in each
agent's description (e.g. `persona Maya`) and keep the returned agent IDs, so
follow-ups can reach them via SendMessage. A prompt contains only the persona
card and its script — never other personas, and never your own opinion of the
idea. No tools are needed; tell the agent to answer from the persona alone.

Two rounds, so the problem questions are answered before the persona knows
the idea exists (otherwise Part A answers bend toward the pitch):

**Round 1** — dispatch all five in **one message** (parallel), with Part A only:

> You are role-playing **<persona card>**. Stay in character. Answer as this
> person really would — busy, self-interested, not polite for politeness' sake.
> Saying no, being confused, or not caring is a valid answer. Don't invent
> enthusiasm. Answer each question in 1–4 sentences, in first person. Use no
> tools.
>
> **Part A:**
> 1. Tell me about the last time you dealt with <problem>. What happened?
> 2. How do you handle it today? What does that cost you, in money or time?
> 3. What have you tried that didn't work?
> 4. How much does this problem actually bother you, 1–10, and why?

**Round 2** — when all five have answered, SendMessage each the rest, again
in one message:

> Still in character. Here's a new product:
>
> **Part B — the pitch:** <one-paragraph pitch built from the brief, with price>
> 5. In your own words, what is this?
> 6. First reaction — honest.
> 7. What would stop you from using it?
> 8. What would it have to do for you to switch from what you do now?
>
> **Part C — price:**
> 9. At what price is it so cheap you'd doubt it? A bargain? Getting
>    expensive? Too expensive to consider?
> 10. At <price>, would you buy it, try it, or skip it? *(Drop Q10 if the
>     price isn't decided; Q9 then gives the price range.)*
>
> **Part D — commitment:** 11. If it were available today, would you
> <smallest real commitment: sign up for the waitlist / pre-pay / book a
> demo>? Yes or no, and why.
>
> End with one line: `VERDICT: buy | try | skip — <one-sentence reason>`.

## 4. Report

In chat, in this order:

1. **One-line caveat** — simulated, finds weak spots, doesn't prove demand.
2. **Panel results** — table: persona · verdict · price band (bargain →
   too expensive) · top objection.
3. **Patterns** — what came up in 2+ interviews: shared objections, the
   alternative people are happy with, misunderstandings of the pitch
   (compare answers to Q5 with what the idea actually is).
4. **Problem strength** — did Part A show the problem hurts, or is it a
   nice-to-have? Quote one line.
5. **Riskiest assumption** — the single belief the idea depends on that
   this panel cast doubt on.
6. **Test with real people** — 3 concrete next steps (who to talk to, how
   many, where to find them) plus 3–5 interview questions about past
   behaviour (Mom Test style), not "would you buy this?".
7. **TLDR** — 1–2 lines.

Then offer, in one line: ask any persona a follow-up, re-run with a changed
price or pitch, or save the report to a file.

## Follow-ups

- "Ask <persona> …" → SendMessage to that persona's agent; relay the answer.
- Changed price/pitch → fresh agents with the same persona cards: Round 1's
  answers can be passed in as "what you said earlier", then Parts B–D with the
  new pitch. Show before/after verdicts side by side.
- Never re-roll a persona because its answer was negative.
