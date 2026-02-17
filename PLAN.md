# Improvement Plans

## Table of Contents

- [1. README Known Issues — Assessment & Plans](#1-readme-known-issues--assessment--plans)
- [2. @media print Support](#2-media-print-support)
- [3. Style Settings & Customization Opportunities](#3-style-settings--customization-opportunities)
- [4. Feature Opportunities (from open issues)](#4-feature-opportunities-from-open-issues)

---

## 1. README Known Issues — Assessment & Plans

### 1a. Incorrect title hierarchy (no issue #)

**Problem:** TOC renders incorrectly when headings skip levels (e.g., H1 directly to H3 with no H2).

**Root cause:** In `headings.ts:56-57`, `minLevel` is auto-computed as `Math.min(…levels)`. Indentation is calculated as `heading.level - minLevel` tabs. If a note goes H1 → H3, the H3 gets 2 tabs of indent instead of 1, creating a visually broken list with a missing parent.

**Fixability: YES — Medium effort**

**Plan:**
1. Add a `normalizeIndentation` pass after filtering headings. Track the "last seen level" and clamp each heading's effective indent to at most `lastLevel + 1`.
2. This produces a contiguous tree regardless of gaps in the source heading levels.
3. Alternatively, track `seenLevels` and map them to sequential indent depths (e.g., if only H1 and H3 exist, map H1→0, H3→1).
4. Add a new option `strictHierarchy: boolean` (default `false`) so users who want literal level mapping can keep the current behavior.
5. Tests: add cases for H1→H3, H2→H5, H1→H4→H2 sequences.

**Files to modify:** `src/headings.ts`, `src/defaults.ts`, `src/options.ts`

---

### 1b. HTML & Markdown stripped when `includeLinks: true` (#24, #27)

**Problem:** Headings like `## Some **bold** heading` lose formatting in the TOC because wikilink syntax `[[#link|text]]` doesn't render inner markdown.

**Root cause:** `markdown.ts:30-42` — when `includeLinks` is true, `stripMarkdown()` and `stripHtml()` are called on the display text. This is intentional because wikilink text segments don't render nested markdown. The link part also strips wikilinks and tags to remain clickable.

**Fixability: PARTIAL — Hard, constrained by Obsidian**

The fundamental issue is that Obsidian's `[[#link|text]]` wikilink syntax does not render markdown inside the text portion. This is an Obsidian rendering limitation.

**Plan (workaround approach):**
1. Investigate using HTML anchor tags (`<a>`) instead of wikilinks for the TOC links. Obsidian's `MarkdownRenderer.renderMarkdown()` renders the TOC into an HTML element, so we could generate markdown with embedded HTML anchors: `<a href="#heading">**bold** heading</a>`.
2. Test whether Obsidian resolves `#heading` anchors in `<a>` tags within rendered codeblocks (it may not — needs verification in a live vault).
3. If HTML anchors work, add a new option `linkStyle: 'wikilink' | 'html'` (default `'wikilink'` for backward compatibility).
4. If HTML anchors also don't work, document this as a permanent Obsidian limitation and close.
5. Alternative: offer a `preserveFormatting: true` option that keeps markdown in the text but disables clickable links (middle ground between `includeLinks: true` and `false`).

**Files to modify:** `src/markdown.ts`, `src/defaults.ts`, `src/options.ts`

---

### 1c. LaTeX equations not rendered with links (#13)

**Problem:** Headings containing `$E=mc^2$` or `$$...$$` get mangled when `includeLinks: true` because the stripping pipeline destroys LaTeX syntax.

**Root cause:** Same as 1b — `stripMarkdown()` removes `*`, backticks, etc. and LaTeX contains characters that get caught in these replacements. Additionally, wikilink text doesn't render LaTeX.

**Fixability: PARTIAL — Same constraint as 1b**

**Plan:**
1. As part of the `stripMarkdown()` function, detect and preserve LaTeX delimiters (`$...$` and `$$...$$`) by temporarily replacing them with placeholders before stripping, then restoring them after.
2. However, even if preserved in the text, wikilinks won't render LaTeX — so this only helps if the HTML anchor approach from 1b works.
3. If neither approach works, add a `excludeLatex` pattern or document that users should use `includeLinks: false` for LaTeX-heavy documents.

**Files to modify:** `src/markdown.ts`

---

### 1d. Duplicate heading titles break links (#57)

**Problem:** If a note has two `## Methods` headings, both TOC links point to the first one.

**Root cause:** Obsidian resolves `[[#Methods]]` to the first heading with that text. There's no built-in mechanism in wikilinks to target the Nth occurrence.

**Fixability: PARTIAL — Medium effort**

**Plan:**
1. Detect duplicate headings during TOC generation by tracking seen heading texts.
2. For duplicates, Obsidian may support `[[#Methods 1]]` or similar disambiguation (needs live vault testing to determine exact behavior).
3. If Obsidian doesn't support disambiguation in wikilinks, consider generating HTML anchors with unique IDs (ties into the HTML anchor work from 1b).
4. At minimum, display a subtle indicator in the TOC when duplicates are detected (e.g., append a counter or parent context).
5. Add a `disambiguateDuplicates: boolean` option.

**Files to modify:** `src/headings.ts`, `src/markdown.ts`

---

### 1e. TOC is not foldable (#23)

**Problem:** Users can't collapse/expand sections of the TOC.

**Root cause:** The TOC renders as a flat markdown list inside a codeblock-replaced element. Obsidian's folding works on real document headings, not rendered codeblock content.

**Fixability: YES — Medium effort**

**Plan:**
1. Instead of generating flat markdown and passing it to `MarkdownRenderer.renderMarkdown()`, generate the HTML list directly in `main.ts:render()`.
2. Use `<details>` / `<summary>` HTML elements for each TOC entry that has children.
3. This gives native browser-level fold/unfold without any Obsidian API dependency.
4. Add a `foldable: boolean` option (default `false` for backward compatibility).
5. When `foldable: true`, render as:
   ```html
   <details open>
     <summary>Heading 1</summary>
     <ul>
       <li>Subheading 1.1</li>
       <li><details open><summary>Subheading 1.2</summary>
         <ul><li>Sub-subheading 1.2.1</li></ul>
       </details></li>
     </ul>
   </details>
   ```
6. Add an option `defaultFolded: boolean` (default `false`) to control whether sections start collapsed.

**Files to modify:** `src/main.ts` (new HTML renderer path), `src/defaults.ts`, `src/options.ts`

---

### 1f. Codeblock-based TOC doesn't export / publish (#10, #31, #12)

**Problem:** Since the TOC lives in a codeblock, it's invisible in Obsidian Publish, PDF exports, and other export tools. PDF links also don't work.

**Root cause:** Codeblock processors only run in Obsidian's live preview/reading mode. Export tools see raw codeblock text. PDF anchor links are an Obsidian core limitation.

**Fixability: PARTIAL for export, NO for PDF links**

**Plan:**
1. **Export command:** Add a command "Copy TOC as Markdown" that writes the generated TOC markdown to the clipboard. Users can paste it manually for export-friendly documents.
2. **Publish workaround:** Investigate Obsidian's `registerMarkdownPostProcessor` which may fire during Publish rendering (needs verification).
3. **@media print:** See Section 2 below — CSS print styles can ensure the TOC renders properly when printing from Obsidian.
4. **PDF links:** This is an Obsidian core limitation (`[[#anchor]]` links aren't supported in PDF export). No fix possible at the plugin level. Monitor Obsidian updates.

**Files to modify:** `src/main.ts` (new command)

---

## 2. @media print Support

### Problem

When users print from Obsidian (Ctrl+P / Cmd+P) or export to PDF via the native print dialog, the TOC may not render well. The codeblock-rendered content might have odd spacing, missing styles, or broken layout in print contexts.

### Current State

The plugin ships **zero CSS** — it relies entirely on Obsidian's theme CSS. This means print behavior is fully theme-dependent and uncontrolled.

### Plan

#### 2a. Add a `styles.css` file (Obsidian plugin convention)

Obsidian automatically loads a `styles.css` file from the plugin directory. This is the standard way for plugins to inject styles.

1. Create `styles.css` in the project root.
2. Scope all styles under a container class to avoid conflicts. The rendered TOC element lives inside the codeblock container — add a wrapper class like `.automatic-toc` in the `render()` method.

#### 2b. Print-specific styles

```css
/* Print media query for TOC */
@media print {
  .automatic-toc {
    /* Ensure TOC appears in print */
    display: block !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .automatic-toc ul,
  .automatic-toc ol {
    /* Prevent list from splitting across pages */
    break-inside: avoid;
  }

  .automatic-toc a {
    /* Show links as plain text in print (clickable links are useless on paper) */
    color: inherit !important;
    text-decoration: none !important;
  }

  /* Optional: show page numbers if CSS target-counter is supported */
  /* This is aspirational — browser support is limited */
}
```

#### 2c. Screen styles (baseline)

```css
.automatic-toc {
  /* Reasonable defaults that work across themes */
  padding: 0;
  margin: 0;
}

.automatic-toc ul,
.automatic-toc ol {
  padding-left: 1.5em;
}
```

#### 2d. Add wrapper class in render()

In `main.ts:render()`, wrap the rendered content:
```typescript
this.element.classList.add('automatic-toc')
```

#### 2e. Option to hide TOC in print

Add `hideInPrint: boolean` option (default `false`). When enabled:
```css
@media print {
  .automatic-toc.hide-in-print {
    display: none !important;
  }
}
```

**Files to create:** `styles.css`
**Files to modify:** `src/main.ts`, `src/defaults.ts`, `src/options.ts`

---

## 3. Style Settings & Customization Opportunities

### 3a. Integration with the Style Settings plugin

The [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) community plugin is widely used and allows plugin authors to expose CSS variables that users can tweak from a GUI — no CSS knowledge required.

**Plan:**
1. Define CSS custom properties (variables) in `styles.css` with sensible defaults.
2. Add a Style Settings annotation block at the top of `styles.css`:

```css
/* @settings
name: Automatic Table of Contents
id: automatic-table-of-contents
settings:
  -
    id: toc-font-size
    title: TOC font size
    type: variable-text
    default: inherit
  -
    id: toc-indent-size
    title: Indent size
    type: variable-text
    default: 1.5em
  -
    id: toc-line-height
    title: Line height
    type: variable-text
    default: 1.6
  -
    id: toc-link-color
    title: Link color
    type: variable-themed-color
    format: hex
    default-light: '#705dcf'
    default-dark: '#7f6df2'
  -
    id: toc-bullet-style
    title: Bullet character
    description: CSS list-style-type value (disc, circle, square, none, etc.)
    type: variable-text
    default: disc
  -
    id: toc-border-left
    title: Left border
    description: CSS border shorthand (e.g., "2px solid gray" or "none")
    type: variable-text
    default: none
  -
    id: toc-background
    title: Background color
    type: variable-themed-color
    format: hex
    default-light: '#00000000'
    default-dark: '#00000000'
  -
    id: toc-padding
    title: Container padding
    type: variable-text
    default: 0
*/
```

3. Use these variables in the CSS:

```css
.automatic-toc {
  font-size: var(--toc-font-size, inherit);
  line-height: var(--toc-line-height, 1.6);
  background: var(--toc-background, transparent);
  padding: var(--toc-padding, 0);
  border-left: var(--toc-border-left, none);
}

.automatic-toc ul,
.automatic-toc ol {
  padding-left: var(--toc-indent-size, 1.5em);
}

.automatic-toc ul {
  list-style-type: var(--toc-bullet-style, disc);
}

.automatic-toc a {
  color: var(--toc-link-color);
}
```

**This gives users who install Style Settings a full GUI for TOC appearance with zero code changes.**

### 3b. New codeblock options for visual customization

Beyond CSS, some visual options make sense as codeblock options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `numbered` | boolean | false | Alias: use `style: nestedOrderedList` (simpler name) |
| `separator` | string | `\|` | Separator character for `inlineFirstLevel` style |
| `indent` | number | 1 | Tab multiplier for nesting depth |
| `startCollapsed` | boolean | false | Used with foldable TOC (Section 1e) |

### 3c. Additional style options worth considering

| Style | Description |
|-------|-------------|
| `flat` | No nesting, all headings at same indent, level indicated by prefix (e.g., "1.2.3 Heading") |
| `numberedHierarchy` | Hierarchical numbering like "1.", "1.1.", "1.1.1." |
| `compact` | Reduced spacing, smaller font, designed as a sidebar-style TOC |

**Files to create:** `styles.css`
**Files to modify:** `src/main.ts`, `src/defaults.ts`, `src/options.ts`, `src/headings.ts`, `src/settings.ts`

---

## 4. Feature Opportunities (from open issues)

### High value / Likely fixable

| Issue | Title | Effort | Notes |
|-------|-------|--------|-------|
| **#76** | `include` only works on highest-level headers | Low | Bug in `headings.ts` — the `unallowedLevel` logic incorrectly skips children when `include` doesn't match a parent. Fix: only apply `unallowedLevel` tracking when using `exclude`, not `include`. |
| **#82** | Hide bullet points / numbers | Low | Add `listStyle: 'bullet' \| 'numbered' \| 'none'` option, or simpler: CSS `list-style-type: none` via the style settings work (Section 3a). |
| **#54** | Renaming file temporarily breaks TOC | Low | The `sourcePath` is set at construction time in `Renderer` and never updated. Listen to the `rename` event on the vault and update `this.sourcePath`. |
| **#84** | TOC pertaining to a specific header | Medium | Add `startAfter: string` and `endBefore: string` options to scope TOC to a section. Filter headings by their position in the document (using `HeadingCache.position`). |
| **#37** / **#78** | Set starting point of TOC / Start from below | Medium | Same solution as #84 — positional filtering. Could also use `startAfterLine: number` or `startAfterHeading: /regex/`. |

### Medium value / Moderate effort

| Issue | Title | Effort | Notes |
|-------|-------|--------|-------|
| **#22** | Manual update option | Medium | Add `autoUpdate: boolean` option (default `true`). When `false`, only render on load and provide a command "Refresh table of contents" that triggers re-render. Helps with large documents (150+ headings). |
| **#77** | Shortcut to return to TOC | Medium | Add a "Back to TOC" floating button or inject an anchor at the TOC position. Could use Obsidian's `view.scroll()` API. Alternatively, add a tiny invisible anchor that other plugins can link to. |
| **#4** | TOC of another document | Hard | Would require reading another file's metadata cache. New syntax: `file: path/to/note.md`. Use `app.metadataCache.getCache(filePath)` with a different path. Cross-file links would need full path resolution. |
| **#48** | Include embedded markdown headings | Hard | Obsidian's metadata cache only includes headings from the current file, not transcluded/embedded content. Would need to recursively resolve `![[embeds]]` and merge heading caches. |

### External / Won't fix

| Issue | Title | Notes |
|-------|-------|-------|
| **#58** | Incompatible with Auto Link Title | Plugin conflict — Auto Link Title modifies heading text during editing, which triggers metadata cache updates. Likely needs coordination with the other plugin author or a debounce mechanism. |
| **#36** | Invalid regular expression error | Already has workaround in the error handling. Users hit this when typing incomplete regex. Could improve UX by showing a friendlier error message specifically for regex parsing failures. |

---

## Summary: Priority Ordering

### Quick wins (Low effort, high impact)
1. **#76 fix** — `include` filter bug
2. **#82** — hide bullets via CSS / option
3. **#54** — file rename fix
4. **Wrapper class** — add `.automatic-toc` class to rendered element (enables all CSS work)

### Medium-term (enables multiple improvements)
5. **`styles.css`** — baseline CSS + `@media print` support
6. **Style Settings integration** — CSS variables with annotation block
7. **Heading hierarchy normalization** (1a) — fix the gap-in-levels issue
8. **Section-scoped TOC** (#84, #37, #78) — `startAfter` / `endBefore` options

### Longer-term (more complex, higher risk)
9. **Foldable TOC** (1e) — HTML `<details>` renderer path
10. **HTML anchor links** (1b, 1c) — alternative link rendering for formatting preservation
11. **Manual update mode** (#22) — performance improvement for large docs
12. **Cross-file TOC** (#4) — new use case entirely
