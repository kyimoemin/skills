---
description: Shape a feature idea from a product owner's POV — drive the product conversation (who it's for, what it implies, where the MVP line sits), then write a product brief the /architect skill consumes. No code, no tickets.
argument-hint: [feature idea]
---

# Shape

Run to turn a raw feature idea into a product brief. You are the product
owner's sparring partner: your job is to think about the *product*, not the
implementation. Stay codebase-blind — you may read the project README to
learn what the product is, nothing more. No source files, no tracker, no
tickets, no technical decisions; those belong to /architect.

1. **Start from the idea.** Use $ARGUMENTS if given. With no arguments
   and a vision doc present (`docs/product/vision.md`), propose the next
   feature from its build order that has no brief yet (in the project's
   briefs location — default `docs/product/briefs/`),
   and confirm before shaping. With neither, ask for the feature idea in
   one sentence. If someone brings a whole *app* idea and there's no
   vision doc, stop and point at /vision — which features exist at all is
   decided there, one level up.
2. **Think like a PO, out loud.** If a vision doc exists, read it first
   and stay inside its lines — its MVP cut and later/never calls are
   settled; scope beyond them is a flagged conversation ("this belongs in
   the vision — expand it?"), never a silent expansion. Then lay out what
   this feature *implies* beyond what was said: who actually needs it and for
   what job, the parts users will expect that weren't mentioned, the edge
   cases seen from the user's seat (empty states, first-run, failure,
   revocation — whatever fits), and where a sensible MVP line could sit.
   This is your value-add — surface the hidden scope, don't transcribe.
3. **Drive the dialogue.** Ask the questions a good PO would ask — a few at
   a time, sharpest first: the decisions that change what gets built (which
   user, which slice ships first, what's deliberately excluded). I'm the
   decision-maker; you make sure every product decision is made on purpose,
   not by default. Push back when an answer creates a scope or consistency
   problem, and say why. Stop asking when the brief below can be filled
   without guessing.
4. **Draft the brief.** Exactly these sections, all prose, zero technical
   content:
   - **Problem** — the user problem, one short paragraph.
   - **Users** — who it's for; who it's explicitly not for.
   - **Surface** — one line: `user-facing` (has screens; /design-ui runs
     next) or `headless` (no UI; straight to /architect). Downstream
     tooling reads this line rather than inferring from prose.
   - **User stories** — "As a …, I can …, so that …"; MVP stories only.
   - **In scope** — what ships in this slice.
   - **Out of scope** — what's deliberately excluded, each with a one-line
     why (v2, different problem, not worth it).
   - **Acceptance** — user-facing, observable behavior ("a user can …",
     "when X happens the user sees …"). No implementation language.
   - **Done-condition** — the single sentence that makes this feature
     "done"; /architect designs against this.
   - **Open product decisions** — only ones I explicitly deferred; empty is
     the goal, since anything left here blocks /architect.

   Draft it straight into the brief file (step 5 says where) — never
   paste the draft into chat, where the body would be paid twice, once
   shown and once written. Present the path plus a few-line recap of the
   decisions it encodes, and iterate in the file until I approve — I
   read it in my editor. An uncommitted file is cheap to change or
   discard; the gate that waits for my go-ahead is the commit, as ever.
5. **The file's location.** Discover the project's docs convention (a
   docs/ or product dir) before drafting; if there is none, write
   `docs/product/briefs/<feature>.md` — briefs live one level below the
   vision doc, so vision.md stays alone and findable at the top.
   Don't invent a deeper structure. If shaping changed the vision's
   feature map or build order (a feature pulled forward, split, or
   resequenced), offer to update vision.md to match — with approval,
   never silently — so the vision stays the authority a bare /shape
   proposes from. Do not commit without go-ahead.
6. **Report:** the brief's path, any open product decisions left, and the
   ready-to-run next command per the brief's Surface line:
   `/design-ui <path-to-brief>` when the
   feature is user-facing, `/architect <path-to-brief>` when
   it isn't (if the repo isn't bootstrapped yet,
   `/bootstrap docs/product/vision.md` comes first).
