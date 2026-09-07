import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
    const { agent, principles } = await req.json();
    await UserRepo.updateAgent(agent.user_id, {...agent, principles: JSON.stringify(principles) });
    return Response.json({ status: true });
}
