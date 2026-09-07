import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function POST(req: NextRequest) {
    const { currentPassword, newPassword } = await req.json();
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }
        await UserRepo.changePassword(jwtPayload.email as string, currentPassword, newPassword);
        return Response.json({status: true, message: "Password changed successfully!"})
    } catch (err) {
        console.log(err);
        return Response.json({status: false, message: err instanceof Error ? err.message : 'Internal server error'})
    }
}