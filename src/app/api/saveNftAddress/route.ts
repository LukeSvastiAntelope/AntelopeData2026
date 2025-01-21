import { verifyConfirmationToken } from "@/app/utils/api/token";
import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    try {
        const { id, nft_address, ipfs_hash } = await req.json();
        await UserRepo.updateAgentNftAddress(id, nft_address, ipfs_hash);
        return Response.json({ status: true, message: 'Agent profile updated successfully' }, { status: 200 });
    } catch (error) {
        console.log(error);
        return Response.json({ status: false, message: 'Failed to update agent profile' }, { status: 500 });
    }
}