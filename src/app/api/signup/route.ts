import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { signIn } from "@/auth";

export async function POST(req: NextRequest) {
    const { email, password, displayName } = await req.json();
    try {
        // Create the user in the database
        await UserRepo.registerPassword({ email, password, displayName });
        
        // Automatically sign in the new user
        const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });
        
        if (result?.error) {
            console.log("Auto-login after registration failed:", result.error);
            return Response.json({ 
                status: true, 
                message: 'Registration successful. Please login to your account.',
                requiresLogin: true 
            });
        }
        
        return Response.json({ 
            status: true, 
            message: 'Registration successful. You are now logged in.',
            autoLoggedIn: true 
        });
    } catch (err) {
        console.log("Error in signup: ", err);
        return Response.json({ status: false, message: `${err}` })
    }
}