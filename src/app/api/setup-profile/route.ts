import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        
        if (!session?.user?.id) {
            return Response.json({ status: false, message: 'Not authenticated' });
        }

        const { displayName } = await req.json();
        
        // Update user's display name and mark as no longer first login
        await UserRepo.updateUserDisplayName(parseInt(session.user.id), displayName);
        
        return Response.json({ 
            status: true, 
            message: 'Profile updated successfully' 
        });
        
    } catch (error) {
        console.error('Setup profile error:', error);
        return Response.json({ 
            status: false, 
            message: error instanceof Error ? error.message : 'Internal server error' 
        });
    }
} 