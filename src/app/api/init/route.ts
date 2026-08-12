import { NextResponse } from 'next/server'
import { initAdmin } from '@/app/actions/initAdmin'

export async function GET() {
  const result = await initAdmin()
  return NextResponse.json(result)
}