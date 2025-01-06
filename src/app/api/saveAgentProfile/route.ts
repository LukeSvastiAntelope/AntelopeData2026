import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token"
import { IFormDataAgentProfile } from "@/app/utils/interface";

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("avatar") as File;
        if (file) {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            await fs.writeFile(`./public/avatar/${file.name}`, buffer);
            revalidatePath("/");
        }

        const updateParams: Partial<IFormDataAgentProfile> = {
            id: parseInt(formData.get("id") as string),
            user_id: parseInt(formData.get("user_id") as string),
            name: formData.get("name") as string,
            description: formData.get("description") as string,
            maxBetSize: parseInt(formData.get("maxBetSize") as string),
            interests: formData.get("interests") as string,
            riskLevel: formData.get("riskLevel") as string,
            conservativeBetSize: parseInt(formData.get("conservativeBetSize") as string),
            moderateBetSize: parseInt(formData.get("moderateBetSize") as string),
            aggressiveBetSize: parseInt(formData.get("aggressiveBetSize") as string),
            principles: formData.get("principles") as string,
            image: file ? `/avatar/${file.name}` : formData.get("image") as string,
            maxTimelineLimit: parseInt(formData.get("maxTimelineLimit") as string),
            category: formData.get("category") as string
        };

        await UserRepo.updateAgent(jwtPayload.email as string, updateParams as IFormDataAgentProfile);
        return Response.json({ status: true, message: "update profile successfully" });
    } catch (error) {
        console.log("Error in saveAgentProfile: ", error);
        return Response.json({ status: false, message: error });
    }
};