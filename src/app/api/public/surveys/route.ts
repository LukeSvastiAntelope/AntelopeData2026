import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/public/surveys - list all published surveys (id & title)
export async function GET(req: NextRequest) {
  try {
    const surveys = await SurveyRepo.getAllSurveys();
    const published = surveys.filter((s:any)=> s.status === 'published').map((s:any)=>({ id:s.id, title:s.title }));
    return NextResponse.json({ status:true, surveys: published });
  } catch (err) {
    console.error('Error listing surveys', err);
    return NextResponse.json({ status:false, message:'Internal error' }, { status:500 });
  }
} 