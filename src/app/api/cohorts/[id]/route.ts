import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from '@/app/utils/auth/require-user';
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);
  const id = Number((await params).id);
  const body = await req.json();
  await CohortRepo.updateCohort(id, userId, body as { name?:string; description?:string; filter?:CohortFilterRule[]; visibility?: any});
  return NextResponse.json({ status:true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userId = Number(auth);
  const id = Number((await params).id);
  await CohortRepo.deleteCohort(id, userId);
  return NextResponse.json({ status:true });
}