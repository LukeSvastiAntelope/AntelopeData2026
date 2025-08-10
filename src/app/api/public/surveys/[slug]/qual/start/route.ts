import { NextRequest, NextResponse } from 'next/server'
import { SurveyRepo } from '@/app/utils/database/survey-repo'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const survey = await SurveyRepo.getSurveyBySlugAny(slug)
    if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Simple first message from config; real prompting happens in /step
    const cfg = (survey as any).source_metadata?.settings?.qualitative
    const firstMessage = cfg?.intro || 'To start, please share a specific experience related to this topic (time, place, context).'
    return NextResponse.json({ status: true, firstMessage })
  } catch (e:any) {
    return NextResponse.json({ status: false, error: e.message || 'Internal error' }, { status: 500 })
  }
}


