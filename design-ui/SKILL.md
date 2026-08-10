---
description: Decide how the product looks and behaves on screen — establish the app's design language once, then design each feature's screens from its brief. Writes the UI docs implementers follow; runs between /shape and /architect. No code, no data models.
argument-hint: [path to product brief]
allowed-tools: Bash(git *)
---

# Design UI

Run to decide look, layout, and interaction for anything user-facing. You
are the product's designer, not its engineer: no source files, no component
code, no data models, no storage — those belong to /architect and the
implementers. Read only the vision doc, the brief, and existing UI docs.
If the frontend-design skill is available, load it before proposing
anything — it's the taste; these docs are the record.

1. **Pick the level.** If `docs/design/ui/design-language.md` doesn't
   exist, establish it first (steps 2–3); when $ARGUMENTS names a brief,
   continue into that feature's screens (steps 4–5) in the same run. If
   the language doc exists, go straight to the feature screens — and with
   no brief given, ask which feature to design.
2. **Design language — the app-wide decisions, made once.** Read the
   vision doc for who this is for and what the product's character should
   be, then drive the dialogue a few decisions at a time, sharpest first:
   overall direction (propose 2–3 distinct options, not one), palette and
   how state is signaled (error, success, pending), typography and
   spacing scale, and the component idioms every feature reuses —
   buttons, inputs, dialogs, toasts, empty states, microcopy tone. Every
   later screen inherits these; anything left vague here gets invented
   differently by each implementer.
3. **Draft the language doc** at `docs/design/ui/design-language.md` —
   decisions and the why, concrete enough that two implementers working
   blind produce screens that look related. Draft it in the file, never
   as a chat paste (the body would be paid twice); present the path plus
   a few-line recap of the decisions, and iterate in the file until I
   approve — the commit in step 6 is the gate that waits for me.
   Implementers follow this doc by standing rule; it is the contract.
4. **Feature screens.** Read the brief and treat its decisions as
   settled — scope questions go back to /shape, not here. For each user
   story, design the screens and states it needs: layout, what's
   prominent, every state the acceptance criteria imply (empty, error,
   in-progress, confirmation), and the interactions between them. Stay
   inside the design language; when a feature genuinely needs a new
   idiom, that's a flagged language-doc update ("add it for everyone?"),
   never a one-off. Draft these straight into the feature doc (step 5)
   the same way — path plus decision recap in chat, the doc body only in
   the file, iterating there until I approve.
5. **The feature doc** lives at `docs/design/ui/<feature>.md`, mirroring
   the brief's basename. /architect links it from the tickets that build
   these screens.
6. **Commit** what this run wrote (`chore: add <feature> UI design` or
   `chore: add design language`) on my go-ahead — stage only your own
   files, never `add -A`. Do not push without go-ahead.
7. **Report:** the doc paths and the ready-to-run next command:
   `/architect <path-to-brief>` — or, if the feature's tickets are
   already filed, where the screens doc applies.
