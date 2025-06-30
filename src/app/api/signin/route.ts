import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
    const { email, password } = await req.json();
    try {
        const result = await UserRepo.authenticate({email, password});
        return Response.json({status: true, message: "User logged in successfully!", token: result.token, user: result.user})
    } catch (err) {
        console.log(err);
        return Response.json({status: false, message: err instanceof Error ? err.message : 'Internal server error'})
    }
}