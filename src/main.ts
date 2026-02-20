import type {
  App,
  CachedMetadata,
  Editor,
  HeadingCache,
  MarkdownFileInfo,
  TAbstractFile,
  TFile,
} from 'obsidian'
import type { TableOfContentsOptions } from './defaults.js'
import { type FilteredHeading, getFilteredHeadings, getMarkdownFromHeadings } from './headings.js'
import { getFormattedMarkdownHeading } from './markdown.js'
import { MarkdownRenderChild, MarkdownRenderer, Plugin } from './obsidian.js'
import { getOptionsDocs, type PluginSettings, parseOptionsFromSourceText } from './options.js'
import { DEFAULT_SETTINGS, SettingsTab } from './settings.js'

const codeblockId = 'table-of-contents'
const codeblockIdShort = 'toc'

interface ProcessorContext {
  sourcePath: string
  addChild: (child: any) => void
}

class ObsidianAutomaticTableOfContents extends Plugin {
  settings!: PluginSettings

  async onload(): Promise<void> {
    await this.loadSettings()

    const handler = (sourceText: string, element: HTMLElement, context: ProcessorContext) => {
      context.addChild(
        new Renderer(this.app, element, context.sourcePath, sourceText, this.settings),
      )
    }
    this.registerMarkdownCodeBlockProcessor(codeblockId, handler)
    this.registerMarkdownCodeBlockProcessor(codeblockIdShort, handler)
    this.addCommand({
      id: 'insert-automatic-table-of-contents',
      name: 'Insert table of contents',
      editorCallback: onInsertToc,
    })
    this.addCommand({
      id: 'insert-automatic-table-of-contents-docs',
      name: 'Insert table of contents (with available options)',
      editorCallback: onInsertTocWithDocs,
    })
    this.addSettingTab(new SettingsTab(this.app, this))
  }

  onunload(): void {
    // Cleanup is handled automatically by registerMarkdownCodeBlockProcessor,
    // registerEvent, and addCommand
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }
}

function onInsertToc(editor: Editor, _view: MarkdownFileInfo): void {
  const markdown = `\`\`\`${codeblockId}\n\`\`\``
  editor.replaceRange(markdown, editor.getCursor())
}

function onInsertTocWithDocs(editor: Editor, _view: MarkdownFileInfo): void {
  const markdown = [`\`\`\`${codeblockId}\n${getOptionsDocs()}\n\`\`\``]
  editor.replaceRange(markdown.join('\n'), editor.getCursor())
}

class Renderer extends MarkdownRenderChild {
  app: App
  element: HTMLElement
  sourcePath: string
  sourceText: string
  pluginSettings: PluginSettings

  constructor(
    app: App,
    element: HTMLElement,
    sourcePath: string,
    sourceText: string,
    pluginSettings: PluginSettings,
  ) {
    super(element)
    this.app = app
    this.element = element
    this.sourcePath = sourcePath
    this.sourceText = sourceText
    this.pluginSettings = pluginSettings
  }

  // Render on load
  onload(): void {
    this.render()
    this.registerEvent(
      this.app.metadataCache.on('changed', (file: TFile) => {
        // Only re-render if the current file has changed
        if (file.path === this.sourcePath) {
          this.onMetadataChange()
        }
      }),
    )
    // Update sourcePath when file is renamed (#54)
    this.registerEvent(
      this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
        if (oldPath === this.sourcePath) {
          this.sourcePath = file.path
          this.render()
        }
      }),
    )
  }

  // Render on file change
  onMetadataChange(): void {
    this.render()
  }

  render(): void {
    try {
      const options = parseOptionsFromSourceText(this.sourceText, this.pluginSettings)
      if (options.debugInConsole) debug('Options', options)

      const metadata: CachedMetadata | null = this.app.metadataCache.getCache(this.sourcePath)
      const headings: HeadingCache[] = metadata?.headings ? metadata.headings : []
      if (options.debugInConsole) debug('Headings', headings)

      ;(this.element as any).empty()
      this.element.classList.add('automatic-toc')

      if (options.foldable && options.style !== 'inlineFirstLevel') {
        const filtered = getFilteredHeadings(headings, options)
        if (options.debugInConsole) debug('Filtered headings', filtered)
        if (filtered.length === 0) {
          if (options.hideWhenEmpty) return
          const msg = document.createElement('em')
          msg.textContent = 'Table of contents: no headings found'
          if (options.title) {
            const titleEl = document.createElement('div')
            MarkdownRenderer.renderMarkdown(options.title, titleEl, this.sourcePath, this)
            this.element.appendChild(titleEl)
          }
          this.element.appendChild(msg)
          return
        }
        if (options.title) {
          const titleEl = document.createElement('div')
          MarkdownRenderer.renderMarkdown(options.title, titleEl, this.sourcePath, this)
          this.element.appendChild(titleEl)
        }
        const isOrdered = options.style === 'nestedOrderedList'
        renderFoldableList(this.element, filtered, options, isOrdered)
      } else {
        const markdown = getMarkdownFromHeadings(headings, options)
        if (options.debugInConsole) debug('Markdown', markdown)
        MarkdownRenderer.renderMarkdown(markdown, this.element, this.sourcePath, this)
      }
    } catch (error) {
      debug('Error', error)
      const message = error instanceof Error ? error.message : String(error)
      const readableError = `_💥 Could not render table of contents (${message})_`
      MarkdownRenderer.renderMarkdown(readableError, this.element, this.sourcePath, this)
    }
  }
}

function renderFoldableList(
  container: HTMLElement,
  items: FilteredHeading[],
  options: TableOfContentsOptions,
  isOrdered: boolean,
): void {
  // Build a tree structure from the flat list
  interface TreeNode {
    text: string
    children: TreeNode[]
  }

  function buildTree(flat: FilteredHeading[]): TreeNode[] {
    const roots: TreeNode[] = []
    const stack: { node: TreeNode; depth: number }[] = []

    for (const item of flat) {
      const text = getFormattedMarkdownHeading(item.heading.heading, options)
      const node: TreeNode = { text, children: [] }

      // Pop stack until we find a parent (depth < current)
      while (
        stack.length > 0 &&
        (stack[stack.length - 1] as { node: TreeNode; depth: number }).depth >= item.depth
      ) {
        stack.pop()
      }

      if (stack.length === 0) {
        roots.push(node)
      } else {
        ;(stack[stack.length - 1] as { node: TreeNode; depth: number }).node.children.push(node)
      }
      stack.push({ node, depth: item.depth })
    }
    return roots
  }

  function renderNodes(parent: HTMLElement, nodes: TreeNode[]): void {
    const list = document.createElement(isOrdered ? 'ol' : 'ul')
    for (const node of nodes) {
      const li = document.createElement('li')
      if (node.children.length > 0) {
        const details = document.createElement('details')
        details.setAttribute('open', '')
        const summary = document.createElement('summary')
        // Render wikilink-style text as HTML via innerHTML for link support
        summary.innerHTML = wikitextToHtml(node.text)
        details.appendChild(summary)
        renderNodes(details, node.children)
        li.appendChild(details)
      } else {
        li.innerHTML = wikitextToHtml(node.text)
      }
      list.appendChild(li)
    }
    parent.appendChild(list)
  }

  const tree = buildTree(items)
  renderNodes(container, tree)
}

function wikitextToHtml(text: string): string {
  // Convert [[#link|display]] wikilinks to <a> tags for the foldable renderer
  return text.replace(
    /\[\[#([^\]|]+)\|([^\]]+)\]\]/g,
    (_match, link, display) =>
      `<a class="internal-link" data-href="#${escapeHtml(link)}">${escapeHtml(display)}</a>`,
  )
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function debug(type: string, data: unknown): void {
  console.log(
    ...[
      `%cAutomatic Table Of Contents %c${type}:\n`,
      'color: orange; font-weight: bold',
      'font-weight: bold',
      data,
    ],
  )
}

export default ObsidianAutomaticTableOfContents
