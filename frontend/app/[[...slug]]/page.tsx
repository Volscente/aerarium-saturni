import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents } from '../../mdx-components'
import { notFound } from 'next/navigation'

export const generateStaticParams = generateStaticParamsFor('slug')

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  try {
    const { metadata } = await importPage(params.slug)
    return metadata
  } catch {
    return {}
  }
}

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  let result
  try {
    result = await importPage(params.slug)
  } catch {
    notFound()
  }
  const { default: MDXContent, toc, metadata, sourceCode } = result
  const { wrapper: Wrapper } = useMDXComponents()

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
