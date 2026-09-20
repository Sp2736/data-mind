TASK: Design and implement a completely new Executive Report PDF template
for DataMind — not a fix or reskin of the current one. Discard the old
"Section 1 / Section 2 / Section 3..." vertical-list structure entirely.
Build the new design described below, using the SAME underlying report
data object (dataset overview, schema_summary, insights, key_takeaways,
visualizations) — only the presentation changes.

=====================================================================
DESIGN DIRECTION
=====================================================================
Think "modern data-consultancy deliverable" (the kind of report a firm
like McKinsey/Palantir would hand a client), not "auto-generated app
export." Dense with signal, generous with whitespace, every page has a
clear visual hierarchy at a glance — nobody should have to read paragraph
one to know what a page is about.

Color system (define as CSS variables, used consistently):
  --ink:        #0F1115   (primary text)
  --ink-muted:  #5B6472   (secondary text)
  --accent:     #2D5BFF   (single accent — links, badges, chart accents)
  --accent-soft:#EEF2FF   (accent backgrounds/callouts)
  --line:       #E4E7EC   (hairline rules, table borders)
  --surface:    #FAFBFC   (card backgrounds)
  --good:       #16A34A / --warn: #D97706 / --bad: #DC2626 (status only)

Typography: one serif for display/headings (e.g. "Source Serif 4" or
"Newsreader") paired with one grotesque sans for body/data (e.g. "Inter"
or "IBM Plex Sans"). Embed both as web fonts in the PDF render — no
system-font fallback. Numerals in tables/stats use tabular-nums.

=====================================================================
PAGE-BY-PAGE STRUCTURE (this replaces the old outline entirely)
=====================================================================

PAGE 1 — COVER
- Full-bleed page. Top-left: small "DATAMIND" wordmark + "AUTONOMOUS
  ANALYTICS ENGINE" eyebrow label, tiny tracked-out caps.
- Vertically centered: dataset display name as large serif display type
  (e.g. 48pt), NOT the file path. Below it, one muted line: generation
  date + dataset ID as a small monospace tag (this is where the technical
  ID belongs — never in the headline).
- Bottom of page: a single-row stat strip, four numbers as large figures
  with small caption labels beneath — Records / Attributes / Research
  Questions / Insights Synthesized. No table, no borders — just numerals.
- A thin accent-colored rule spans the full page width, once, as the only
  color-block on the page.

PAGE 2 — AT A GLANCE (new page type, did not exist before)
- Left column (60%): Executive Summary as serif body text, in a
  callout card with a 3px left accent border and --accent-soft
  background, generous padding. Cap at ~150 words.
- Right column (40%): a vertical "Key Findings" rail — one compact
  card per insight, each showing only: category badge (pill), the
  research question as a one-line headline, and the single most
  important number from that finding pulled out as a large stat (e.g.
  "73.6" with tiny label "highest avg score — master's degree").
  This gives the reader every headline number before they've read a
  single paragraph. Clicking/scanning down this rail = a 10-second
  version of the whole report.
- This page has NO tables. It's the "if you only read one page" page.

PAGE 3 — DATASET & METHODOLOGY
- Two-column data table: Dataset Overview (Filename [human name only],
  Format, Records, Attributes, Domain, Questions Evaluated) — styled as
  a clean