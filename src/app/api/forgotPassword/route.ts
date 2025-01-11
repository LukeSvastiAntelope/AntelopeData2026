import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import fetch from 'node-fetch';
import { generateConfirmationToken } from "@/app/utils/api/token";

export async function POST(req: NextRequest) {
    const { username } = await req.json();
    try {
        const user = await UserRepo.getUserByUsername(username);
        if (!user) {
            return Response.json({ status: false, message: 'User not found' });
        }
        const token = await generateConfirmationToken(username);
        const confirmationLink = `${process.env.NEXT_PUBLIC_APP_URL}/resetPassword?token=${token}`;
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramMessage = encodeURIComponent(`Your confirmation link is: \n${confirmationLink}`);
        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage?chat_id=${user.telegram_id}&text=${telegramMessage}`);
        if (!response.ok) {
            throw new Error('Failed to send message');
        }
        return Response.json({ status: true, message: 'Registration successful. Please check your telegram to verify your account.' });
    } catch (err) {
        console.log("Error in signup: ", err);
        return Response.json({ status: false, message: err })
    }
}