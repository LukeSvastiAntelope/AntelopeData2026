import { NextRequest, NextResponse } from 'next/server';
import { UserRepo } from '@/app/utils/database/user-repo';
import { verifyConfirmationToken } from '@/app/utils/api/token'; // For JWT verification
import { getToken } from 'next-auth/jwt'; // To get session details

// Helper function to check admin role (adjust based on your actual user/session structure)
async function isAdmin(req: NextRequest): Promise<boolean> {
    // Option 1: If using next-auth with JWT and role is in the token
    const token = await getToken({ req, secret: process.env.AUTH_SECRET });
    if (token && token.role === 'admin') {
        return true;
    }

    // Option 2: If you have a custom JWT verification that returns user details including role
    // This assumes verifyConfirmationToken can be adapted or you have another method
    // For this example, let's assume the token from Authorization header is a custom one
    // and verifyConfirmationToken decodes it to include role.
    const authHeader = req.headers.get('Authorization');
    const customToken = authHeader?.split(' ')[1];

    if (customToken) {
        try {
            const decoded = await verifyConfirmationToken(customToken); // Assuming this decodes to { email: string, role: string, ... }
            if (decoded && decoded.role === 'admin') {
                return true;
            }
        } catch (error) {
            console.error("Admin check: Invalid custom token", error);
            return false;
        }
    }
    
    return false;
}


export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    try {
        // 1. Authenticate and Authorize: Check if the user is an admin
        const isAdminUser = await isAdmin(req);
        if (!isAdminUser) {
            return NextResponse.json({ status: false, message: 'Unauthorized: Admin access required.' }, { status: 403 });
        }

        const userIdString = (await params).userId;
        if (!userIdString) {
            return NextResponse.json({ status: false, message: 'User ID is required.' }, { status: 400 });
        }

        const userId = parseInt(userIdString, 10);
        if (isNaN(userId)) {
            return NextResponse.json({ status: false, message: 'Invalid User ID format.' }, { status: 400 });
        }
        
        // 2. Perform Deletion using UserRepo
        //    We need to define `deleteUserById` in UserRepo
        //    This assumes a hard delete. Consider soft delete or cascading implications.
        const deleteResult = await UserRepo.deleteUserById(userId);

        if (deleteResult.success) {
            return NextResponse.json({ status: true, message: 'User deleted successfully.' });
        } else {
            // If deleteResult contains a specific message for failure (e.g., user not found)
            return NextResponse.json({ status: false, message: deleteResult.message || 'Failed to delete user.' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('Error in deleteUser API:', error);
        // Check if the error is due to foreign key constraints
        if (error.message && (error.message.includes('foreign key constraint fails') || error.message.includes('FOREIGN KEY constraint failed'))) {
             return NextResponse.json({ 
                status: false, 
                message: 'Cannot delete user: This user has associated records (e.g., agents, predictions, bets) that must be handled or removed first.' 
            }, { status: 409 }); // 409 Conflict
        }
        return NextResponse.json({ status: false, message: error.message || 'An unexpected error occurred.' }, { status: 500 });
    }
} 