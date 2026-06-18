import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SurveyRepo } from "@/app/utils/database/survey-repo";

export const runtime = 'nodejs';

// POST /api/public/surveys/[slug]/verify-password
// Body: { password: string } -> { ok: boolean }
// Validates a private survey's link password without ever exposing the hash.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const body = await req.json().catch(() => ({}));
        const password = typeof body?.password === 'string' ? body.password : '';

        // Look up the survey (active OR draft/scheduled preview) to read its hash.
        const survey: any =
            (await SurveyRepo.getSurveyBySlug(slug)) ||
            (await SurveyRepo.getSurveyBySlugAny(slug));

        if (!survey) {
            return NextResponse.json({ ok: false, error: 'Survey not found' }, { status: 404 });
        }

        const hash = survey.access_password;
        // No password set -> nothing to gate.
        if (!hash) {
            return NextResponse.json({ ok: true });
        }

        const ok = !!password && bcrypt.compareSync(password, String(hash));
        return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
    } catch (error) {
        console.error('Error in verify-password:', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
