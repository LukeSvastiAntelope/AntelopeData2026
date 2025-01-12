import { NextRequest } from "next/server";
import { format } from 'date-fns';
import { UserRepo } from "@/app/utils/database/user-repo";
import { verifyConfirmationToken } from "@/app/utils/api/token";
import { getJson } from "serpapi";
import { CreatePredictionInput } from "@/app/utils/interface";

function escapeMarkdown(text: string) {
    const escapeChars = [
        '_',
        '*',
        '[',
        ']',
        '(',
        ')',
        '~',
        '`',
        '>',
        '#',
        '+',
        '-',
        '=',
        '|',
        '{',
        '}',
        '!',
    ]; // Removed '.'
    escapeChars.forEach((char) => {
        const regExp = new RegExp(`\\${char}`, 'g');
        text = text.replace(regExp, `\\${char}`);
    });
    return text;
}

function generateDeepLink(botUsername: string, predictionId: number) {
    return `https://t.me/${botUsername}?start=bet_${predictionId}`;
}

export async function POST(req: NextRequest) {
    const prediction = await req.json();
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
        return Response.json({ status: false, message: 'Invalid token' });
    }

    try {
        const data = {
            creator_id: jwtPayload.email as number,
            description: prediction.description || '',
            source: prediction.source || '',
            source_url: "",
            created_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            status: "open",
            bet_amount: prediction.bet_amount || 0,
            creator_choice: prediction.choice || '',
            event_id: 0,
            league_id: 0,
            strThumb: "",
            team_a: "",
            team_b: "",
            str_thumb: "",
            predicted_outcome: "",
            agent_id: 0,
            source_type: "dynamic",
            bet_type: "dynamic",
            resolution_date: prediction.resolutionDate
                ? format(new Date(prediction.resolutionDate), 'yyyy-MM-dd HH:mm:ss')
                : format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        }

        if (prediction.source === "sportDB") {
            data.event_id = prediction.matchId;
            data.league_id = prediction.leagueId;
            data.team_a = prediction.homeTeam;
            data.team_b = prediction.awayTeam;
            data.str_thumb = prediction.strThumb;
            data.predicted_outcome = prediction.choice;
        } else {
            data.source_url = prediction.sourceUrl;

            const result = await getJson({
                engine: "google_images",
                q: prediction.description,
                api_key: process.env.SERPAPI_API_KEY,
                safe: "active",
                num: 5
            });

            data.str_thumb = result.images_results[0].original || "";
        }

        if (data.source === "custom" && (!data.description || !data.source || !data.source_url || !data.resolution_date || !data.bet_amount || !data.creator_choice)) {
            return Response.json({ status: false, message: 'All fields are required' });

        } else if (data.source !== "custom" && (!data.event_id || !data.team_a || !data.team_b || !data.resolution_date || !data.bet_amount || !data.creator_choice || !data.league_id || !data.str_thumb || !data.description)) {
            return Response.json({ status: false, message: 'All fields are required' });
        }
        const user = await UserRepo.getUserById(data.creator_id.toString());
        const insertId = await UserRepo.createPrediction(data as CreatePredictionInput);
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChannelId = process.env.TELEGRAM_CHANNEL_ID;
        let telegramMessage = "";
        if (data.source === "sportDB") {
            telegramMessage = encodeURIComponent(`🔮 *New Game Prediction Created!*\n\n` +
                `🏟️ *${escapeMarkdown(data.description)}*\n` +
                `*Predicted Outcome*: \`${escapeMarkdown(data.creator_choice)}\`\n` +
                `*Created by*: \`${escapeMarkdown(user.username)}\`\n` +
                `*Resolution Date*: \`${data.resolution_date}\`\n`);
        } else {
            telegramMessage = encodeURIComponent(
                `🔮 *New Prediction Created!*\n\n` +
                `*${escapeMarkdown(data.description)}*\n` +
                `*By*: \`${escapeMarkdown(user.username)}\`\n` +
                `*Source*: ${data.source}\n` +
                `*Bet Amount*: \`${data.bet_amount}\` credits\n` +
                `*Creator's Choice*: *${data.creator_choice.toUpperCase()}*\n` +
                `*Resolution Date*: ${data.resolution_date}`
            );
        }

        const betLink = generateDeepLink(process.env.TELEGRAM_BOT_USERNAME as string, insertId);

        // Define the inline keyboard with the "Bet" button
        const inlineKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🎲 Bet',
                            url: betLink, // Opens the bot with /start=bet_predictionId
                        },
                    ],
                ],
            },
        };
        if (data.str_thumb) {
            const encodedThumb = encodeURIComponent(data.str_thumb);
            if (!telegramChannelId) throw new Error('Telegram channel ID not configured');
            const params = new URLSearchParams({
                chat_id: telegramChannelId,
                photo: encodedThumb,
                caption: telegramMessage,
                parse_mode: 'MarkdownV2',
                reply_markup: JSON.stringify(inlineKeyboard)
            });

            const response = await fetch(
                `https://api.telegram.org/bot${telegramBotToken}/sendPhoto?${params.toString()}`
            );
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Telegram API Error:", errorData);
                throw new Error(`Failed to send message: ${errorData.description}`);
            }
        } else {
            if (!telegramChannelId) throw new Error('Telegram channel ID not configured');
            const params = new URLSearchParams({
                chat_id: telegramChannelId,
                text: telegramMessage,
                parse_mode: 'MarkdownV2',
                reply_markup: JSON.stringify(inlineKeyboard)
            });

            const response = await fetch(
                `https://api.telegram.org/bot${telegramBotToken}/sendMessage?${params.toString()}`
            );
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Telegram API Error:", errorData);
                throw new Error(`Failed to send message: ${errorData.description}`);
            }
        }
        return Response.json({ status: true, message: 'Prediction created successfully' });
    } catch (error) {
        console.error("Error in createPrediction: ", error);
        return Response.json({ status: false, message: 'Failed to create prediction' });
    }
}