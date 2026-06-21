import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const formData = await req.formData()

  const res = await fetch(`${process.env.BACKEND_URL}/etfs/${id}/holdings/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
