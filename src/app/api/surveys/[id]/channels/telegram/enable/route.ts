import { NextRequest, NextResponse } from "next/server";
import { ChannelRepo } from "@/app/utils/database/channel-repo";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params
    const surveyId = parseInt(id, 10)
    if (Number.isNaN(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 })
    }

    const body = await req.json().catch(()=>({})) as any
    const config = body?.config || {}
    await ChannelRepo.enableSurveyChannel(surveyId, 'telegram', config)
    return NextResponse.json({ status: true })
  } catch (error) {
    console.error('Enable telegram channel error:', error)
    return NextResponse.json({ status: false, message: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params
    const surveyId = parseInt(id, 10)
    if (Number.isNaN(surveyId)) {
      return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 })
    }
    await ChannelRepo.setSurveyChannelStatus(surveyId, 'telegram', 'paused')
    return NextResponse.json({ status: true })
  } catch (error) {
    console.error('Disable telegram channel error:', error)
    return NextResponse.json({ status: false, message: 'Internal error' }, { status: 500 })
  }
}


