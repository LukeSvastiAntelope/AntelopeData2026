import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function POST(req: NextRequest) {
    const { telegram_id, username, first_name, last_name } = await req.json();
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }
        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        if (!agent) {
            return Response.json({ error: 'Agent not found' }, { status: 404 });
        }
        if (agent.platform_id) {
            return Response.json({ error: 'Telegram already connected' }, { status: 400 });
        }
        await UserRepo.connectTelegram(jwtPayload.email as string, telegram_id.toString(), username, first_name, last_name);
        return Response.json({status: true, message: "Telegram connected successfully!"})
    } catch (err) {
        console.log(err);
        return Response.json({status: false, message: err instanceof Error ? err.message : 'Internal server error'})
    }
}