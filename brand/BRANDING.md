# BIM Open Bench branding

Decided 2026-10-11 by Christopher Diggins. BIM Open Bench is one of six
products in the BIM Open family; the family guide, with the fonts, the
neutrals, the status colours, and the rules every mark follows, is
`docs/BRANDING.md` in the `bim-open-toolkit` repository. This file holds
only what is the bench's own.

## The mark: Ranked Rows

![Ranked Rows](mark.svg)

A start line on the left; three rows run from it, each longer than the one
above, and the longest ends in the node disc: the same work, measured and
ranked, with the best result reaching the answer. The family's other marks
draw rows of equal length; these differ, which is what a result looks like.

`mark.svg` is a 24 by 24 viewBox, one path, one fill, so the path can be
pasted into code. `lockup.svg` sets the mark beside the wordmark.

Rules:

- One colour: ochre (`#8f6214`) on a light surface; white on ochre or on a
  dark surface. No gradients, no outline, no shadow.
- Sizes: 16 px (favicon), 22 px (beside the wordmark), 48 px (a page
  heading), 96 px and up (papers, slides). Below 16 px use the start line
  and the three rows without the disc.
- Clear space of half the mark's width on every side.
- Keep the rows growing downward. With the longest row on top the mark
  reads as the letter F at 16 px.

## Wordmark

Three words, **BIM Open Bench**, in Instrument Sans: "BIM Open" in weight
600 in the dim colour (`#5a606c`), then "Bench" in weight 700 in the text
colour (`#171a1f`), with a 4 px gap at 15 px. Where a person reads the
name, write the three words; `bim-open-bench` is a name for machines.

## Colours

| Token | Value | Use |
|---|---|---|
| Accent | `#8f6214` | The mark, links and buttons, bars in a results table |
| Accent soft | `#f5ecdc` | Selected row and hover |
| Text | `#171a1f` | Headings, body |
| Dim | `#5a606c` | Secondary text, tool versions, run metadata, the "BIM Open" half of the wordmark |
| Surface, background, border | `#ffffff`, `#f4f5f7`, `#e3e6ea` | As in the family guide |
| Status | green `#16a34a`, amber `#d97706`, red `#dc2626` | A check that passed, a partial result, a failure |

Ochre is 5.35:1 against white, the same as the Flow blue, so it can carry
link text. It is darker and browner than the amber status colour; keep
amber for results and ochre for the chrome, so a reader never takes a
brand bar for a warning.

A results page compares our tools with others. Every tool's row uses the
same colours; only the selected row takes the accent soft. No tool gets a
highlight for being ours.

## Type

Instrument Sans for the wordmark and headings, Public Sans for body text
and tables, Fira Code for numbers, versions, hashes, and commands. Results
tables at 12 to 13 px with numbers right-aligned, so columns of timings
line up digit by digit.
