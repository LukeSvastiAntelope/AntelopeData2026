import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

// GET /api/public/surveys - list all published and active surveys (id & title)
export async function GET(req: NextRequest) {
  try {
    const surveys = await SurveyRepo.getAllSurveys();
    const available = surveys.filter((s:any)=> s.status === 'published' || s.status === 'active').map((s:any)=>({ id:s.id, title:s.title, slug:s.slug }));
    return NextResponse.json({ status:true, surveys: available });
  } catch (err) {
    console.error('Error listing surveys', err);
    return NextResponse.json({ status:false, message:'Internal error' }, { status:500 });
  }
} 