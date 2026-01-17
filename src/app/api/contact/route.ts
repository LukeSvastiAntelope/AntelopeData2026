import { NextRequest } from "next/server";
import { auth } from "@/auth";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@getantelope.com';
const FROM_EMAIL = 'noreply@getantelope.com';
const FROM_NAME = 'Antelope';

// Simple rate limiting (in-memory)
const submissionTracker = new Map<string, number[]>();
const RATE_LIMIT = 3; // max submissions per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const submissions = submissionTracker.get(identifier) || [];
    
    // Remove old submissions outside the window
    const recentSubmissions = submissions.filter(time => now - time < RATE_WINDOW);
    
    if (recentSubmissions.length >= RATE_LIMIT) {
        return false;
    }
    
    recentSubmissions.push(now);
    submissionTracker.set(identifier, recentSubmissions);
    return true;
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const body = await req.json();
        
        const { name, email, message } = body;
        
        // Validation
        if (!name || !email || !message) {
            return Response.json({ 
                status: false, 
                message: 'Name, email, and message are required' 
            }, { status: 400 });
        }
        
        if (name.length > 255 || email.length > 255) {
            return Response.json({ 
                status: false, 
                message: 'Name or email is too long' 
            }, { status: 400 });
        }
        
        if (message.length < 10 || message.length > 5000) {
            return Response.json({ 
                status: false, 
                message: 'Message must be between 10 and 5000 characters' 
            }, { status: 400 });
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return Response.json({ 
                status: false, 
                message: 'Invalid email format' 
            }, { status: 400 });
        }
        
        // Rate limiting
        const identifier = session?.user?.id || email;
        if (!checkRateLimit(identifier.toString())) {
            return Response.json({ 
                status: false, 
                message: 'Too many submissions. Please try again later.' 
            }, { status: 429 });
        }
        
        // Send email to admin (don't block on this)
        sendEmailToAdmin(name, email, message)
            .catch(err => console.error('[Contact] Failed to send admin email:', err));
        
        // Send confirmation to user (don't block on this)
        sendConfirmationToUser(name, email)
            .catch(err => console.error('[Contact] Failed to send user confirmation:', err));
        
        return Response.json({ 
            status: true, 
            message: 'Message sent successfully! We\'ll get back to you soon.'
        });
        
    } catch (error) {
        console.error('[Contact] Form submission error:', error);
        return Response.json({ 
            status: false, 
            message: 'An error occurred. Please try again later.' 
        }, { status: 500 });
    }
}

async function sendEmailToAdmin(name: string, email: string, message: string) {
    if (!SENDGRID_API_KEY) {
        console.warn('[Contact] SENDGRID_API_KEY not set - admin email not sent');
        return;
    }

    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; padding: 20px;">
            <h2 style="color: #333; margin-bottom: 20px;">New Contact Form Submission</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 10px 0;"><strong style="color: #555;">Name:</strong> ${name}</p>
                <p style="margin: 10px 0;"><strong style="color: #555;">Email:</strong> <a href="mailto:${email}" style="color: #007bff;">${email}</a></p>
                <p style="margin: 10px 0;"><strong style="color: #555;">Message:</strong></p>
                <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #007bff;">
                    ${message.replace(/\n/g, '<br>')}
                </div>
            </div>
            <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
                💡 <strong>Tip:</strong> Reply directly to this email to respond to ${name}.
            </p>
        </div>
    `;

    const payload = {
        personalizations: [{
            to: [{ email: ADMIN_EMAIL }],
            subject: `New Contact Form: ${name}`,
        }],
        from: {
            email: FROM_EMAIL,
            name: 'Antelope Contact Form',
        },
        reply_to: {
            email: email,
            name: name,
        },
        content: [{
            type: 'text/html',
            value: htmlContent,
        }],
    };

    try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`SendGrid API responded with ${res.status}: ${text}`);
        }

        console.log(`[Contact] Admin notification sent for submission from ${email}`);
    } catch (error) {
        console.error('[Contact] Failed to send admin notification:', error);
        throw error;
    }
}

async function sendConfirmationToUser(name: string, email: string) {
    if (!SENDGRID_API_KEY) {
        console.warn('[Contact] SENDGRID_API_KEY not set - user confirmation not sent');
        return;
    }

    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0; font-size: 24px;">Thank you for contacting us!</h2>
            </div>
            
            <div style="padding: 30px 20px; background: white;">
                <p style="color: #212529; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    Hi ${name},
                </p>
                
                <p style="color: #212529; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    We've received your message and will get back to you as soon as possible.
                </p>
                
                <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="color: #1976d2; margin: 0; font-size: 14px;">
                        ⏱️ Our team typically responds within 24-48 hours.
                    </p>
                </div>
                
                <p style="color: #212529; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                    Best regards,<br>
                    <strong>The Antelope Team</strong>
                </p>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; border-top: 1px solid #e9ecef; border-radius: 0 0 8px 8px;">
                <p style="color: #6c757d; font-size: 12px; margin: 0;">
                    This is an automated confirmation email from Antelope.
                </p>
            </div>
        </div>
    `;

    const payload = {
        personalizations: [{
            to: [{ email: email, name: name }],
            subject: 'We received your message - Antelope',
        }],
        from: {
            email: FROM_EMAIL,
            name: FROM_NAME,
        },
        content: [{
            type: 'text/html',
            value: htmlContent,
        }],
    };

    try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`SendGrid API responded with ${res.status}: ${text}`);
        }

        console.log(`[Contact] Confirmation email sent to ${email}`);
    } catch (error) {
        console.error('[Contact] Failed to send user confirmation:', error);
        // Don't throw - we don't want to fail the request if confirmation fails
    }
}
