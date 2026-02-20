import type { HeadingCache } from 'obsidian'
import type { TableOfContentsOptions } from './defaults.js'
import { getFormattedMarkdownHeading, isHeadingAllowed } from './markdown.js'

/**
 * Generate a table of contents markdown from a list of headings
 * @param headings - Array of heading objects from Obsidian's metadata cache
 * @param options - Configuration options for the table of contents
 * @returns Formatted markdown string for the table of contents
 */
export function getMarkdownFromHeadings(
  headings: HeadingCache[],
  options: TableOfContentsOptions,
): string {
  const markdownHandlersByStyle = {
    nestedList: getMarkdownNestedListFromHeadings,
    nestedOrderedList: getMarkdownNestedOrderedListFromHeadings,
    inlineFirstLevel: getMarkdownInlineFirstLevelFromHeadings,
  }
  let titleMarkdown = ''
  if (options.title && options.title.length > 0) {
    const titleSeparator = options.style === 'inlineFirstLevel' ? ' ' : '\n'
    titleMarkdown += `${options.title}${titleSeparator}`
  }
  const markdownHeadings = markdownHandlersByStyle[options.style](headings, options)
  if (markdownHeadings === null) {
    if (options.hideWhenEmpty) {
      return ''
    }
    return `${titleMarkdown}_Table of contents: no headings found_`
  }
  return titleMarkdown + markdownHeadings
}

function getMarkdownNestedListFromHeadings(
  headings: HeadingCache[],
  options: TableOfContentsOptions,
): string | null {
  return getMarkdownListFromHeadings(headings, false, options)
}

function getMarkdownNestedOrderedListFromHeadings(
  headings: HeadingCache[],
  options: TableOfContentsOptions,
): string | null {
  return getMarkdownListFromHeadings(headings, true, options)
}

export interface FilteredHeading {
  heading: HeadingCache
  depth: number
}

/**
 * Filter headings by options and compute normalized depths
 * Shared by both markdown and foldable HTML renderers
 */
export function getFilteredHeadings(
  headings: HeadingCache[],
  options: TableOfContentsOptions,
): FilteredHeading[] {
  const minLevel =
    options.minLevel > 0 ? options.minLevel : Math.min(...headings.map((heading) => heading.level))
  const filteredHeadings: HeadingCache[] = []
  let unallowedLevel = 0
  for (const heading of headings) {
    if (unallowedLevel > 0 && heading.level > unallowedLevel) continue
    if (heading.level <= unallowedLevel) {
      unallowedLevel = 0
    }
    if (!isHeadingAllowed(heading.heading, options)) {
      // Only cascade exclusion to children when using exclude filter
      // With include filter, each heading should be evaluated independently (#76)
      if (options.exclude) {
        unallowedLevel = heading.level
      }
      continue
    }
    if (heading.level < minLevel) continue
    if (options.maxLevel > 0 && heading.level > options.maxLevel) continue
    if (heading.heading.length === 0) continue
    filteredHeadings.push(heading)
  }
  const depths = computeNormalizedDepths(filteredHeadings)
  return filteredHeadings.map((heading, i) => ({ heading, depth: depths[i] as number }))
}

function getMarkdownListFromHeadings(
  headings: HeadingCache[],
  isOrdered: boolean,
  options: TableOfContentsOptions,
): string | null {
  const prefix = isOrdered ? '1.' : '-'
  const filtered = getFilteredHeadings(headings, options)
  const lines = filtered.map(({ heading, depth }) => {
    return `${'\t'.repeat(depth)}${prefix} ${getFormattedMarkdownHeading(heading.heading, options)}`
  })
  return lines.length > 0 ? lines.join('\n') : null
}

function computeNormalizedDepths(headings: HeadingCache[]): number[] {
  const depths: number[] = []
  const levelStack: number[] = []
  for (const heading of headings) {
    while (
      levelStack.length > 0 &&
      (levelStack[levelStack.length - 1] as number) >= heading.level
    ) {
      levelStack.pop()
    }
    levelStack.push(heading.level)
    depths.push(levelStack.length - 1)
  }
  return depths
}

function getMarkdownInlineFirstLevelFromHeadings(
  headings: HeadingCache[],
  options: TableOfContentsOptions,
): string | null {
  const minLevel =
    options.minLevel > 0 ? options.minLevel : Math.min(...headings.map((heading) => heading.level))
  const items = headings
    .filter((heading) => heading.level === minLevel)
    .filter((heading) => heading.heading.length > 0)
    .filter((heading) => isHeadingAllowed(heading.heading, options))
    .map((heading) => {
      return getFormattedMarkdownHeading(heading.heading, options)
    })
  return items.length > 0 ? items.join(' | ') : null
}
