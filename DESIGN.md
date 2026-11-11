# Design: aquilabot/libs

This site uses the aquilabot.dev design system ("The Annotated Ledger") inside Starlight. It adds a light theme, which the portfolio does not have.

## Tokens

| Role | Dark | Light | Used for |
|---|---|---|---|
| `bg` | `#0e100f` | `#f7f8f5` | Page, header and sidebar ground |
| `surface` | `#141715` | `#eef0ec` | Inline code |
| `line` | `#242926` | `#dde1dc` | Every rule: sections, table rows, sidebar groups |
| `line-strong` | `#343b37` | `#c2c9c3` | Control edges: code frames, search, table head, asides |
| `text` | `#e6e9e5` | `#141815` | Headings, lead paragraph, links, current nav item |
| `muted` | `#a3aba5` | `#454d48` | Body copy, nav links at rest |
| `faint` | `#7e8781` | `#606963` | Labels, table heads, contents list, footer |
| `accent` | `#8fe3ad` | `#17643a` | Library names, list dashes, the current-page mark, focus ring, selection |
| `code-bg` | `#0a0c0b` | `#eff1ed` | Code block ground |

Type: Schibsted Grotesk Variable for words, JetBrains Mono Variable for code, library names and versions. Headings are 600 with negative tracking. Body is 1.0625rem at 1.6, held to a 42rem measure.

## Rules

- Green marks something you can act on or check: a library name, a link arrow, the current page, a string or number in code. It never fills an area and never colors a heading or a paragraph.
- Structure is 1px hairlines and space. No cards, no shadows, no filled callouts. An aside is a note under a hairline.
- Mono is for code, identifiers and versions. Prose is never mono.
- Tables are ruled lists: a faint header row, hairlines between rows, no zebra.
- The index is a ruled list with three columns: mono name, one sentence, facts. Below 62rem the facts move under the sentence. Below 47.5rem each row is one column.
- The table of contents sits in the right margin in label size, like the margin notes on aquilabot.dev.
- Code blocks use two custom Shiki themes built from the same grays and the one green: strings and numbers are green, keywords and punctuation step back, comments are `faint`.
- Focus ring: 2px `accent`, 3px offset. Text selection is `accent` on `accent-ink`.

## Contrast

Computed with the WCAG 2 formula. `faint` on `bg` is 5.16:1 dark and 5.33:1 light, and 5.0:1 or better on the code ground. `muted` on `bg` is 8.12:1 dark and 8.18:1 light. `accent` on `bg` is 12.51:1 dark and 6.75:1 light.
