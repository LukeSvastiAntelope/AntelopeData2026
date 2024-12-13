import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("avatar") as File;
        if (formData.get("avatar") != "undefined") {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            await fs.writeFile(`./public/uploads/${file.name}`, buffer);
            revalidatePath("/");
        }

        const updateParams = {
            name: formData.get("name"),
            description: formData.get("description"),
            maxBetSize: formData.get("maxBetSize"),
            interests: formData.get("interests"),
            riskLevel: formData.get("riskLevel"),
            conservativeBetSize: formData.get("conservativeBetSize"),
            moderateBetSize: formData.get("moderateBetSize"),
            aggressiveBetSize: formData.get("aggressiveBetSize"),
            principles: formData.get("principles"),
            image: formData.get("avatar") != "undefined" ? `/uploads/${file.name}` : formData.get("image"),
            maxTimelineLimit: formData.get("maxTimelineLimit"),
            category: formData.get("category")
        }

        await UserRepo.updateAgent(jwtPayload.email as string, updateParams);
        return Response.json({ status: true, message: "update profile successfully" });
    } catch (error: any) {
        console.log(error);
        return Response.json({ status: false, message: error.toString() });
    }
};