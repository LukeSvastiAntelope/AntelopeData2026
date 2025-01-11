import { verifyConfirmationToken } from "@/app/utils/api/token";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }
    const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${process.env.SPORTS_DB_API_KEY}/all_leagues.php`);
    
    const data = await response.json();
    return Response.json({
        status: true,
        data: data
    });
}
