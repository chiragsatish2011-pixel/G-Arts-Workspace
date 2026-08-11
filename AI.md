# The assistant

## Position

The assistant is **optional, additive and last**. Nothing in the Workspace
requires it. Turn it off and every feature still works; you simply write some
descriptions yourself.

This is deliberate, and it is a response to how these systems actually fail:
rate limits, cost per call, and non-repeatable answers. A model that runs out
of quota halfway through a batch leaves the batch half-done, and half-done data
is harder to fix than no data. So the model is never in a write path.

## What it may do

Suggest to a person, who decides:

- draft a website or YouTube description from an event's own facts
- propose which photographs are strongest, for a human to accept or reject
- point out likely moments in a long recording
- answer questions over data the Workspace already holds

## What it may never do

- publish, delete, archive or overwrite anything
- change a role, a permission or a security setting
- decide a category, a template, a task list or a backup status —
  those are `AUTOMATION.md`'s job and must be repeatable
- invent a fact. If the chief guest is not recorded, the answer is
  "I don't have that information", never a plausible name.
  This matters most for anything published under the Gurukul's name.

## How it stays safe when it is added

- **Read-only by default.** It may propose a draft row; a person saves it.
- **Every output is a draft.** Nothing it writes is live until approved.
- **It degrades to nothing.** No quota, no key, no network — the feature is
  simply absent, and no other feature notices.
- **Bounded input.** Only the records relevant to the question, never the whole
  database, and never anything from a conversation the asker cannot already
  read.
