---
description: Turn a raw app idea into a product vision — PO dialogue one level above /shape: who it's for, what job it does, the full feature map with an MVP cut and build order. Writes docs/product/vision.md, the durable feature queue /shape pulls from. Runs once per app.
argument-hint: [app idea]
disable-model-invocation: true
---

# Vision

Run once, at the very start of an app, to decide what the product *is*
before any feature gets shaped. You are the product owner's sparring
partner at app altitude: /shape asks "what exactly is this feature?" —
you ask "which features exist at all?". Stay codebase-blind and fully
non-technical: no stack talk, no tickets; stacks belong to /bootstrap,
feature depth to /shape.

**Guard — one vision per app:** if a vision doc already exists
(`docs/product/vision.md` or the project's equivalent), stop and say so.
Direction changes are edits to that doc, made deliberately — not a re-run
of this skill. This is an artifact you consult, not a ritual you repeat.

1. **Start from the idea.** Use $ARGUMENTS if given, else ask for the app
   idea in a sentence ("I want a todo app").
2. **Think like a PO, out loud.** Before asking anything, lay out what
   this app *implies*: who would actually use it and for what job, the
   features the idea silently assumes (a todo app implies done-states,
   editing, persistence), the features users will expect but the idea
   didn't mention (reminders? recurring tasks? sharing?), and where a
   sensible MVP cut could sit. Surface the whole candidate map — your
   value is the features they didn't say.
3. **Drive the dialogue.** Ask the app-level questions a good PO would —
   a few at a time, sharpest first: which user is primary, which job is
   the core loop, which candidate features are in v1, which are
   deliberately later, which are never. I'm the decision-maker; make
   every feature's in/later/never a decision, not a default. Push back
   when a cut makes the MVP incoherent (a todo app whose v1 can't mark
   things done), and say why. Stop when the doc below fills without
   guessing.
4. **Draft the vision.** Exactly these sections, all prose, zero
   technical content:
   - **Product** — what this app is and the job it does, one paragraph.
   - **Users** — who it's for; who it's explicitly not for.
   - **Feature map** — every feature, one line each: name + what it
     covers. This is the complete candidate set, including later/never.
   - **MVP** — which features make v1 and the one-line why the cut is
     coherent (the smallest set where the core loop works).
   - **Later / Never** — the rest, each with a one-line why (v2, niche,
     different product).
   - **Build order** — the MVP features in rough sequence, core loop
     first. /shape pulls from this order; /bootstrap reads the map to
     steer the stack.

   Show it to me and iterate until I approve.
5. **Write the file** to `docs/product/vision.md` — including when
   there's no repo at all yet; write it in the working directory and
   /bootstrap inits the repo around it. Do not commit without go-ahead.
6. **Report:** the doc's path, the MVP feature list in build order, and
   the ready-to-run next command — `/bootstrap docs/product/vision.md`
   when there's no project yet, else `/shape <first unshaped feature>`.
