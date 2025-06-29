import { NextRequest, NextResponse } from "next/server";
import { CohortRepo } from "@/app/utils/database/cohort-repo";

// GET /api/cohorts - list cohorts visible to the current user
export async function GET(req: NextRequest) {
  try {
    // Middleware is expected to set these headers
    const userIdHeader = req.headers.get("x-user-id");
    const userRoleHeader = req.headers.get("x-user-role");

    const userId = userIdHeader ? parseInt(userIdHeader, 10) : null;
    const userRole = userRoleHeader === "admin" ? "admin" as const : "user" as const;

    const cohorts = await CohortRepo.listVisibleCohorts(userId, userRole);

    return NextResponse.json({ status: true, cohorts });
  } catch (error) {
    console.error("Error fetching cohorts:", error);
    return NextResponse.json(
      { status: false, message: "Failed to fetch cohorts" },
      { status: 500 }
    );
  }
}

// POST /api/cohorts - create a new cohort
export async function POST(req: NextRequest) {
  try {
    const { name, description, filter, visibility = 'private', surveyId } = await req.json();

    if (!name || !Array.isArray(filter) || filter.length === 0) {
      return NextResponse.json({ status: false, message: 'Name and filter are required' }, { status: 400 });
    }

    // In a real secure route we'd read from JWT; for now allow header override or default user 1
    const userIdHeader = req.headers.get('x-user-id');
    const createdBy = userIdHeader ? parseInt(userIdHeader, 10) : 1;

    const id = await CohortRepo.createCohort({ name, description, filter, visibility, createdBy, surveyId });

    return NextResponse.json({ status: true, id });
  } catch (error) {
    console.error('Error creating cohort:', error);
    return NextResponse.json({ status: false, message: 'Internal error' }, { status: 500 });
  }
} 