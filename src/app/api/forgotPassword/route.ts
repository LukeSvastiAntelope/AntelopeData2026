import { NextRequest } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { generateConfirmationToken } from "@/app/utils/api/token";
import { EmailService } from "@/app/utils/services/email-service";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return Response.json({ status: false, message: 'Email is required' });

    const user = await UserRepo.getUserByEmail(email);
    if (!user) return Response.json({ status: true, message: 'If that email exists, a reset link has been sent.' });

    const token = await generateConfirmationToken(email);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_BASE_URL || ''
    const confirmationLink = `${baseUrl.replace(/\/$/, '')}/auth/resetPassword?token=${token}`;

    // Try email first; fall back to returning link in response for dev/debug
    try {
      await EmailService.sendTwinLoginLink(user.email, user.display_name, token);
    } catch {}

    return Response.json({ status: true, message: 'If that email exists, a reset link has been sent.', link: confirmationLink });
  } catch (err) {
    console.log('Error in forgotPassword:', err);
    return Response.json({ status: false, message: 'Unexpected error' });
  }
}