import { NextRequest, NextResponse } from "next/server";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

const DEFAULT_COUNT = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userIdHeader = req.headers.get("x-user-id");
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = parseInt(userIdHeader, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ status: false, message: "Invalid user" }, { status: 401 });
    }

    const { id } = await params;
    const surveyId = parseInt(id, 10);
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ status: false, message: "Invalid survey ID" }, { status: 400 });
    }

    let bodyCount: number | undefined;
    try {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.count === "number") bodyCount = body.count;
      else if (body && typeof body.count === "string") bodyCount = parseInt(body.count, 10);
    } catch {
      bodyCount = undefined;
    }

    const count =
      bodyCount !== undefined && Number.isFinite(bodyCount) ? bodyCount : DEFAULT_COUNT;

    const { inserted } = await SurveyRepo.seedTestSurveyResponses(surveyId, userId, count);

    return NextResponse.json({
      status: true,
      inserted,
      message: `Added ${inserted} synthetic response(s).`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Survey not found or access denied") {
      return NextResponse.json({ status: false, message }, { status: 404 });
    }
    if (message === "Survey has no questions") {
      return NextResponse.json({ status: false, message }, { status: 400 });
    }
    console.error("Error seeding test survey responses:", error);
    return NextResponse.json(
      { status: false, message: "Failed to add test responses" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userIdHeader = req.headers.get("x-user-id");
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = parseInt(userIdHeader, 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ status: false, message: "Invalid user" }, { status: 401 });
    }

    const { id } = await params;
    const surveyId = parseInt(id, 10);
    if (!Number.isFinite(surveyId)) {
      return NextResponse.json({ status: false, message: "Invalid survey ID" }, { status: 400 });
    }

    const { deleted } = await SurveyRepo.deleteTestSurveyResponses(surveyId, userId);

    return NextResponse.json({
      status: true,
      deleted,
      message: deleted > 0
        ? `Removed ${deleted} synthetic response(s).`
        : "No synthetic responses found to remove.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Survey not found or access denied") {
      return NextResponse.json({ status: false, message }, { status: 404 });
    }
    console.error("Error deleting test survey responses:", error);
    return NextResponse.json(
      { status: false, message: "Failed to remove test responses" },
      { status: 500 }
    );
  }
}
