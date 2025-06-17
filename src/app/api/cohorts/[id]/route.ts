import { NextRequest, NextResponse } from "next/server";
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userIdHeader = req.headers.get('x-user-id');
  if (!userIdHeader) return NextResponse.json({ status:false, message:'Unauthorized'},{ status:401});
  const userId = Number(userIdHeader);
  const id = Number((await params).id);
  const body = await req.json();
  await CohortRepo.updateCohort(id, userId, body as { name?:string; description?:string; filter?:CohortFilterRule[]; visibility?: any});
  return NextResponse.json({ status:true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userIdHeader = req.headers.get('x-user-id');
  if (!userIdHeader) return NextResponse.json({ status:false, message:'Unauthorized'},{ status:401});
  const userId = Number(userIdHeader);
  const id = Number((await params).id);
  await CohortRepo.deleteCohort(id, userId);
  return NextResponse.json({ status:true });
}