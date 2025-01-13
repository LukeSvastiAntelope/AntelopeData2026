import { verifyConfirmationToken } from "@/app/utils/api/token";
import { UserRepo } from "@/app/utils/database/user-repo";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ status: false, message: 'Invalid token' });
    }
    const { is_bet } = await req.json();
    const user = await UserRepo.updateBettingStatus(jwtPayload.email as number, is_bet);
    return Response.json({status: true, message: "Betting status updated successfully!", user: user});
}