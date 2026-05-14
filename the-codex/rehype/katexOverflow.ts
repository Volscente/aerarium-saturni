import { visit } from 'unist-util-visit'
import type { Root, Element } from 'hast'

/** Unified/rehype plugin that wraps every `.katex-display` div produced by
 *  rehype-katex in a scroll-container div.
 *
 *  Returns a rehype transformer function. Mutates the hast tree in place.
 *
 *  How it works:
 *    Visits every `element` node where node.properties.className includes
 *    'katex-display', wraps it in a new <div class="overflow-x-auto"> parent,
 *    and splices the wrapper into the parent's children array.
 */
export default function katexOverflow() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (!parent || index == null) return

      const classNames = Array.isArray(node.properties?.className)
        ? (node.properties.className as (string | number)[]).map(String)
        : []

      if (!classNames.includes('katex-display')) return

      const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['overflow-x-auto'] },
        children: [node],
      }

      ;(parent.children as Element[])[index] = wrapper
    })
  }
}
