# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dual audience, both confirmed as real (not sequential):
- **Luca (the author)**, writing an academic thesis, using PapérDex himself to build literature reviews across multiple sources and to demonstrate the tool's mechanism as part of the thesis.
- **Other researchers/students** doing literature reviews, who may use PapérDex independently or collaborate inside a shared "Ricerca" (the team/invite feature exists specifically for this). The product is built for both from the start, not for Luca alone with multi-user support bolted on later.

## Product Purpose

PapérDex aggregates and compares academic articles from five heterogeneous sources — arXiv, Crossref, DBLP, OpenAlex, and Semantic Scholar — in a single search, so a literature review doesn't require jumping between engines with different query syntaxes and result shapes. Work is organized into **Ricerche** (research projects): each bundles a quick search, saved queries, a history of what was added and when, cross-source duplicate review, team collaboration, and a list of saved/exportable articles.

A **quick search** without login also exists (`/ricerca/articoli`, `PublicSearchPage`/`QuickSearchPage`) for a one-off search with no ability to save results into a Ricerca.

## Positioning

Unlike querying each source engine separately, PapérDex normalizes all five sources' results into one standard `Article` model, then applies real filtering (keyword AND/OR groups, author, venue, date, exclusions) **after** fetching, uniformly across sources — rather than trying to replicate each source's own query capabilities. This is a deliberate architectural choice (see `docs/decisioni-implementative.md`): adapters send minimal, high-recall queries; a shared internal filtering layer does the real work. On top of that, PapérDex also helps resolve cross-source duplicates and fill in missing metadata (via Zotero enrichment) — a mechanism a single-source search engine has no reason to build.

## Operating Context

- Academic literature-review workflow, typically solo or in a small team sharing one Ricerca.
- Auth: email+password, with email confirmation and password-reset flows; sessions expire and prompt re-login.
- Each Ricerca has an owner and participants (invited via `inviti`), with role-gated actions (e.g. only the owner can remove saved articles).
- Search has an adaptive **depth** control (bassa/media/alta) instead of a numeric result count, because the system can promise "how much effort to spend," not an exact result count — depth maps internally to a target count + extra-pages ceiling per source.
- Users hold personal API keys in their profile (`ApiKeysPage`) used for enrichment/source access.
- Dark mode is already implemented throughout (Tailwind `dark:` variants on every page/component) and must keep working after the redesign.

## Capabilities and Constraints

- 5 source adapters, each normalizing to a common `Article` schema; no per-source UI differences the user should have to learn.
- Filtering is internal/post-fetch, not per-source query hacking — a foundational, already-settled backend decision, not up for revisiting in a frontend redesign.
- Cross-source deduplication exists as a review step (`DuplicateGroupReview`, `SessionDuplicatesPage`) but full automatic merge/conflict-resolution is a planned thesis feature, not yet built — don't design as if it's finished.
- Terminology is fixed and intentional, used everywhere in UI copy: **"Ricerca"/"Ricerche"** = a research project (not "progetto"); **"Query salvate"** = saved queries (not "ricerche salvate" — this was explicitly renamed once already); **"Cronologia"** = the history of additions to a Ricerca.
- Still mid-thesis: backend work is still in progress; no production deployment, no existing screenshots in the thesis document to stay pixel-compatible with. There is time to do the redesign properly — no imminent deadline.

## Brand Commitments

- Name **"PapérDex"** and the Pokédex pun (tagline "Gotta find 'em all") are confirmed **binding** — not a placeholder, keep them.
- The current execution (violet accent, "Luckiest Guy" stroked display font on the homepage title) is the first attempt at expressing that identity, not a locked visual system — the redesign should express the same playful-but-serious pun with more craft, not discard it and not leave it as-is by default.
- Tone: playful identity wrapped around a serious research tool — the joke is in the name/tagline, the actual workflow (search, filtering, dedup, team) should read as a precise, trustworthy instrument.

## Evidence on Hand

- No real user testimonials, usage data, or external press — none should be fabricated.
- Primary evidence is the existing codebase and `docs/decisioni-implementative.md` (backend/architecture decision log, also written to support the thesis write-up).
- No existing screenshots elsewhere that constrain visual changes.

## Product Principles

1. One search instead of five — collapse the literature-review workflow into a single aggregated search surface, hiding per-source quirks.
2. Normalize behind the scenes, keep the query simple — internal complexity (depth targets, pagination, filtering) stays invisible; the user-facing query model stays minimal.
3. Organize by Ricerca, not by query — saved queries, history, dedup, and team all nest under a named, shareable research project.
4. Playful identity, serious tool — the Pokédex pun stays and should feel crafted; the actual workflows should read as precise and trustworthy.
5. Design for both audiences at once — Luca's own daily use and a future other-researcher/team user, not a solo-use prototype that happens to have a team tab.

## Accessibility & Inclusion

No project-specific requirement established beyond the existing dark-mode support, which must be preserved and extended consistently across the redesign.
