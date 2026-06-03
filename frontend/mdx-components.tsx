import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'
import { CodeBlock } from './theme/components/CodeBlock'

export function useMDXComponents(components?: Record<string, React.ComponentType>) {
  return getDocsMDXComponents({ ...components, pre: CodeBlock })
}
