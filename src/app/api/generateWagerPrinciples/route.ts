import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
    return new OpenAI({ apiKey });
}

export async function POST(req: NextRequest) {
    try {
        const { 
            name, 
            description, 
            category, 
            sport_preference, 
            riskLevel 
        } = await req.json();

        if (!name || !description || !category) {
            return NextResponse.json(
                { error: "Missing required fields: name, description, or category." },
                { status: 400 }
            );
        }

        let principlesContext = `Agent Name: ${name}\nAgent Description: ${description}\nPrimary Category: ${category}`;
        if (category === "Sports" && sport_preference) {
            principlesContext += `\nSpecific Sport: ${sport_preference}`;
        }
        if (riskLevel) {
            principlesContext += `\nDefault Risk Level: ${riskLevel}`;
        }

        const prompt = `Based on the following Antelope agent profile, generate exactly 3 concise and actionable wager principles that will guide its betting decisions in a prediction market:

${principlesContext}

Each principle should be on a new line, starting with a number (e.g., "1. ..."). The principles should be distinct and reflect the agent's characteristics. Focus on providing practical guidance for making bets.

Example Format:
1. Focus bets on [Specific Area based on Category/Sport] where specialized knowledge offers an edge.
2. Adjust bet sizes according to the [Risk Level] approach, favoring smaller, exploratory bets for higher risk scenarios.
3. Prioritize predictions with clear, verifiable outcomes and avoid overly speculative markets unless a strong analytical basis exists.`;

        const completion = await getOpenAIClient().chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o", // Or your preferred model, e.g., gpt-3.5-turbo
            temperature: 0.7,
            max_tokens: 200,
            n: 1,
        });

        let generatedPrinciples = completion.choices[0]?.message?.content?.trim();

        if (!generatedPrinciples) {
            // Fallback principles if API fails or returns empty
            generatedPrinciples = `1. Analyze market trends thoroughly before placing a bet.\n2. Manage bankroll effectively by not overcommitting to a single prediction.\n3. Continuously learn and adapt strategies based on past performance.`;
            console.warn("OpenAI principles generation failed or returned empty, using fallback.");
        }

        return NextResponse.json({ principles: generatedPrinciples });

    } catch (error) {
        console.error("Error generating wager principles:", error);
        // Generic fallback in case of errors
        const fallbackPrinciples = `1. Make data-driven decisions.\n2. Diversify bets across different opportunities.\n3. Review and refine betting approach regularly.`;
        return NextResponse.json(
            { principles: fallbackPrinciples, error: "Failed to generate principles, used fallback." },
            { status: 500 }
        );
    }
} 