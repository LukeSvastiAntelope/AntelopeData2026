import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
    const { username, password } = await req.json();
    try {
        await UserRepo.registerPassword({ username, password });
        return Response.json({ status: true, message: 'Registration successful. Please login to your account.' });
    } catch (err) {
        console.log("Error in signup: ", err);
        return Response.json({ status: false, message: `${err}` })
    }
}