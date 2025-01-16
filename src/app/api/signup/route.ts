import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import fetch from 'node-fetch';

export async function POST(req: NextRequest) {
    const { username, password } = await req.json();
    try {
        const {token, chatId} = await UserRepo.registerPassword({ username, password });
        const confirmationLink = `${process.env.NEXT_PUBLIC_APP_URL}/verify?token=${token}`;
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramMessage = encodeURIComponent(`Your confirmation link is: \n${confirmationLink}`);
        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage?chat_id=${chatId}&text=${telegramMessage}`);
        if (!response.ok) {
            throw new Error('Failed to send message');
        }
        return Response.json({ status: true, message: 'Registration successful. Please check your telegram to verify your account.' });
    } catch (err) {
        console.log("Error in signup: ", err);
        return Response.json({ status: false, message: `${err}` })
    }
}