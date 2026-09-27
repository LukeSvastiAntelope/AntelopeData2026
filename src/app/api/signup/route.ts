import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { signIn } from "@/auth";
import { ensurePrimaryOrgId } from "@/app/api/dashboard/persons/org";
import { openSql } from "@/app/utils/database/db";
import { parseUsHouseDistrict } from "@/lib/district-brief-public";
import { scheduleDistrictIntelGeneration } from "@/app/utils/services/district-intel-service";

/**
 * POST /api/signup
 * Creates the user, signs them in, optionally binds a district on their
 * campaign org and kicks District Intelligence Report generation async
 * ("fries in the bag" — does not block on external APIs).
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const displayName = String(body.displayName || "").trim();
    const districtRaw = body.districtCode
        ? String(body.districtCode).trim()
        : "";

    try {
        if (!password || password.length < 8) {
            return Response.json({ status: false, message: 'Password must be at least 8 characters long.' });
        }
        await UserRepo.registerPassword({ email, password, displayName });

        const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        // Async district report — never block signup on Census/FEC/etc.
        let districtKick: { started: boolean; districtKey: string } | null = null;
        try {
            const user = await UserRepo.getUserByEmail(email);
            if (user?.id) {
                const orgId = await ensurePrimaryOrgId(user.id);
                const parsed = districtRaw ? parseUsHouseDistrict(districtRaw) : null;
                if (parsed) {
                    const sql = await openSql();
                    await sql.execute(
                        `UPDATE organizations
                         SET district_code = ?, state = COALESCE(state, ?),
                             candidate_name = COALESCE(candidate_name, ?),
                             office_type = COALESCE(office_type, 'federal_house')
                         WHERE id = ?`,
                        [
                            parsed.label,
                            parsed.state,
                            displayName || null,
                            orgId,
                        ]
                    );
                    districtKick = scheduleDistrictIntelGeneration({
                        organizationId: orgId,
                        districtCode: parsed.label,
                        state: parsed.state,
                        districtNumber: parsed.districtNumber,
                    });
                }
            }
        } catch (err) {
            console.warn('[signup] district intel kick skipped', err);
        }

        if (result?.error) {
            console.log("Auto-login after registration failed:", result.error);
            return Response.json({
                status: true,
                message: 'Registration successful. Please login to your account.',
                requiresLogin: true,
                districtReportStarted: Boolean(districtKick?.started),
                districtCode: districtKick?.districtKey || null,
            });
        }

        return Response.json({
            status: true,
            message: districtKick?.started
                ? 'Registration successful. Your District Intelligence Report is being prepared.'
                : 'Registration successful. You are now logged in.',
            autoLoggedIn: true,
            districtReportStarted: Boolean(districtKick?.started),
            districtCode: districtKick?.districtKey || null,
        });
    } catch (err) {
        console.log("Error in signup: ", err);
        return Response.json({ status: false, message: `${err}` })
    }
}
