import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
    const { username, password } = await req.json();
    try {
        const result = await UserRepo.authenticate({username, password});
        return Response.json({status: true, message: "User Logined successfully!", token: result.token, user: result.user})
    } catch (err) {
        console.log(err);
        return Response.json({status: false, message: err instanceof Error ? err.message : 'Internal server error'})
    }
}