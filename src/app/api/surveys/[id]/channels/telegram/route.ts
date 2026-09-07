import { NextRequest, NextResponse } from "next/server"
import { ChannelRepo } from "@/app/utils/database/channel-repo"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
		const surveyId = parseInt(id, 10)
		if (Number.isNaN(surveyId)) {
			return NextResponse.json({ status: false, message: 'Invalid survey id' }, { status: 400 })
		}

		const channel = await ChannelRepo.getSurveyChannelConfig(surveyId, 'telegram')
		return NextResponse.json({ status: true, channel })
	} catch (error) {
		console.error('Get telegram channel config error:', error)
		return NextResponse.json({ status: false, message: 'Internal error' }, { status: 500 })
	}
}


