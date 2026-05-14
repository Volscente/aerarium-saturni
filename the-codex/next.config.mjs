import nextra from 'nextra'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { visit } from 'unist-util-visit'

// Inline version of rehype/katexOverflow.ts — wraps .katex-display divs in
// overflow-x-auto scroll containers. The canonical TypeScript implementation
// lives in rehype/katexOverflow.ts for type-checking and documentation.
function katexOverflow() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index == null) return
      const classNames = Array.isArray(node.properties?.className)
        ? node.properties.className.map(String)
        : []
      if (!classNames.includes('katex-display')) return
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['overflow-x-auto'] },
        children: [node],
      }
    })
  }
}

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme/config',
  mdxOptions: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex, katexOverflow],
  },
})

export default withNextra({
  output: 'standalone',
  // basePath: '/wiki',  // Uncomment to enable path-based routing topology
})
