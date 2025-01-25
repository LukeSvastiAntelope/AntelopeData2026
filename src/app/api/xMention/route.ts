import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";

/**
 * This is a placeholder route to handle "X.com mention" webhooks or
 * streaming events via a POST request from your X integration.
 * In real usage, you'd configure your X webhook to send mention events here.
 */
export async function POST(req: NextRequest) {
  try {
    // See how X's data arrives. For demonstration, we assume a JSON body with relevant fields.
    // The actual shape depends on X's callback structure.
    const body = await req.json();
    const text: string = body?.tweet?.text || "";
    const userId: string = body?.tweet?.user_id_str || "";
    const handle: string = body?.tweet?.user_screen_name || "";

    // Check if this mention references @antelopehq
    // Or in real usage, parse the 'entities.user_mentions' field from X data.
    if (!text.toLowerCase().includes("@antelopehq")) {
      return NextResponse.json({ status: false, message: "No mention of @antelopehq found." });
    }

    // Attempt to parse statement, resolution date, bet side, stake
    const { statement, resolutionDate, betSide, stake } = parsePredictionTweet(text);

    // If we're missing any critical details, respond with an error or skip creation
    if (!statement || !resolutionDate || !betSide || !stake) {
      return NextResponse.json({
        status: false,
        message: "Could not parse prediction info from the tweet."
      });
    }

    // Construct a token or re-use any existing user token. Here, we skip real auth for demo.
    // Typically we'd have the user authenticate, but for a public mention scenario, you'd
    // need a default or fallback user in your system, or match on X handle -> user record.

    const token = "FAKE_JWT_TOKEN_FOR_DEMO"; 
    // We pass it as 'Authorization' header to match how createPrediction expects a Bearer token
    const headers: HeadersInit = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    // Build the payload to create a new prediction
    const payload = {
      // Let's say we map X handle to user since we need user_id from the token internally
      description: statement,
      source: "xMention",
      resolutionDate: format(new Date(resolutionDate), "yyyy-MM-dd HH:mm:ss"),
      bet_amount: stake,
      choice: betSide
    };

    // Use fetch to call our existing createPrediction route
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/createPrediction`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data.status) {
      return NextResponse.json({
        status: false,
        message: `Failed to create prediction: ${data.message}`
      });
    }

    // If successful, you might want to do something like reply to the user on X
    // For example, we might have a separate utility function to post a tweet.
    // We'll just respond with success here.
    return NextResponse.json({
      status: true,
      message: `Prediction created for user @${handle}`
    });

  } catch (err) {
    console.error("Error in xMention route:", err);
    return NextResponse.json({
      status: false,
      message: "An error occurred processing the mention"
    });
  }
}

/**
 * A naive parser to extract:
 * - statement (free-text after removing @antelopehq, date references, and bet statements)
 * - resolutionDate (looking for a pattern like "by <Month> <day> <year>")
 * - betSide ("yes" or "no")
 * - stake (numeric)
 */
function parsePredictionTweet(text: string) {
  let statement = "";
  let resolutionDate: string | null = null;
  let betSide: "yes" | "no" | "" = "";
  let stake: number | null = null;

  // Remove the mention for parsing
  const mentionRemoved = text.replace(/@antelopehq/gi, "").trim();

  // Try to find "by Month day year"
  const dateMatch = mentionRemoved.match(/\bby ([A-Za-z]+ \d{1,2},? \d{4})\b/);
  if (dateMatch) {
    resolutionDate = dateMatch[1].replace(",", ""); // remove any comma
  }

  // Look for "bet X usd on yes/no"
  // e.g. "bet 1 usd on yes" or "bet 10 USD on no"
  const betRegex = /bet (\d+)\s*usd on (yes|no)/i;
  const betMatch = mentionRemoved.match(betRegex);
  if (betMatch) {
    stake = parseInt(betMatch[1], 10);
    betSide = betMatch[2].toLowerCase() as "yes" | "no";
  }

  // Clean out the date references and bet references from the statement
  statement = mentionRemoved
    .replace(betRegex, "")
    .replace(/\bby [A-Za-z]+ \d{1,2},? \d{4}\b/, "")
    .trim();

  return {
    statement,
    resolutionDate,
    betSide,
    stake
  };
} 