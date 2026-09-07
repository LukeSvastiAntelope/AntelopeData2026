import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function POST(req: NextRequest) {
    try {
        const { token, newPassword } = await req.json();
        
        if (!token) {
            return Response.json({ 
                status: false, 
                message: 'Verification token is required' 
            });
        }

        const jwtPayload = await verifyConfirmationToken(token);
        if (!jwtPayload) {
            return Response.json({ 
                status: false, 
                message: 'Invalid verification token' 
            });
        }

        const user = await UserRepo.getUserByEmail(jwtPayload.email as string);
        if (!user) {
            return Response.json({
                status: false,
                message: 'User not found'
            })
        }
        await UserRepo.updatePassword(user.id, newPassword);

        return Response.json({ 
            status: true, 
            message: 'Password reset successfully' 
        });
    } catch (err) {
        console.error("Error in verify: ", err);
        return Response.json({ 
            status: false, 
            message: err instanceof Error ? err.message : 'Verification failed' 
        });
    }
}