import { NextRequest, NextResponse } from 'next/server'
import { buildPublicDistrictBrief } from '@/lib/district-brief-public'

export async function GET(req: NextRequest) {
  const districtCode = req.nextUrl.searchParams.get('districtCode') || ''
  const result = await buildPublicDistrictBrief(districtCode)
  if (!result.ok) {
    return NextResponse.json({ status: false, message: result.error }, { status: result.status })
  }
  return NextResponse.json({ status: true, brief: result.data })
}
