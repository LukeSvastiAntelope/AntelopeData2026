import { NextRequest } from "next/server";
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
        const agent = await UserRepo.getAgentByUserId(jwtPayload.email as string);
        const formData = await req.formData();
        const file = formData.get("avatar") as File;
        let imageUrl = "";
        if (file) {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            
            const formData = new FormData();
            const fileName = `image_${Date.now()}.${file.name.split('.').pop()}`; // Use original file extension
            formData.append("file", new Blob([buffer], { type: file.type }), fileName);

            const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.PINATA_JWT}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to upload image to Pinata');
            }

            const result = await response.json();
            // Update the image URL to use the IPFS hash
            imageUrl = `https://${process.env.PINATA_GATEWAY}/ipfs/${result.IpfsHash}`;
        }

        const updateParams: Partial<IFormDataAgentProfile> = {
            id: agent.id,
            user_id: agent.user_id,
            name: formData.get("name") ? formData.get("name") as string : agent.name,
            description: formData.get("description") ? formData.get("description") as string : agent.description,
            maxBetSize: formData.get("maxBetSize") ? parseInt(formData.get("maxBetSize") as string) : agent.maxBetSize,
            interests: formData.get("interests") ? formData.get("interests") as string : agent.interests as string,
            riskLevel: formData.get("riskLevel") ? formData.get("riskLevel") as string : agent.riskLevel,
            conservativeBetSize: formData.get("conservativeBetSize") ? parseInt(formData.get("conservativeBetSize") as string) : agent.conservativeBetSize,
            moderateBetSize: formData.get("moderateBetSize") ? parseInt(formData.get("moderateBetSize") as string) : agent.moderateBetSize,
            aggressiveBetSize: formData.get("aggressiveBetSize") ? parseInt(formData.get("aggressiveBetSize") as string) : agent.aggressiveBetSize,
            principles: formData.get("principles") ? formData.get("principles") as string : agent.principles as string,
            image: file ? imageUrl : formData.get("image") ? formData.get("image") as string : agent.image,
            maxTimelineLimit: formData.get("maxTimelineLimit") ? parseInt(formData.get("maxTimelineLimit") as string) : agent.maxTimelineLimit,
            category: formData.get("category") ? formData.get("category") as string : agent.category
        };

        await UserRepo.updateAgent(jwtPayload.email as string, updateParams as IFormDataAgentProfile);
        return Response.json({ status: true, message: "update profile successfully" });
    } catch (error) {
        console.log("Error in saveAgentProfile: ", error);
        return Response.json({ status: false, message: error });
    }
};