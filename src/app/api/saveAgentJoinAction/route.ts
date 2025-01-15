import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token"

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    const { name } = await req.json();
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    try {
        const description = `Agent ${name} just joined.`;
        const type = "agent_join";
        await UserRepo.createAgentJoinAction(jwtPayload.email as string, description, type);
        return Response.json({ status: true, message: "Agent join action created successfully" });
    } catch (error) {
        console.log("Error in saveAgentJoinAction: ", error);
        return Response.json({ status: false, message: error });
    }
};