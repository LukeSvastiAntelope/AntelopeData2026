import { SignJWT, jwtVerify } from 'jose';

const rawSecret = process.env.JWT_SECRET_KEY;
const isDev = process.env.NODE_ENV !== 'production';
if (!rawSecret) {
  throw new Error('JWT_SECRET_KEY environment variable must be set for token operations.');
}
if (rawSecret.length < 32) {
  throw new Error('JWT_SECRET_KEY must be at least 32 characters to ensure token security.');
}
const SECRET_KEY = new TextEncoder().encode(rawSecret);

export async function generateConfirmationToken(email: string, role = 'user'): Promise<string> {
  const token = await new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET_KEY);
  
  return token;
}

export async function verifyConfirmationToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    if (isDev) {
      console.log("verifyConfirmationToken payload", payload);
    }
    
    return payload;
  } catch (e) {
    if (isDev) {
      console.log("verifyConfirmationToken error", e);
    }
    return null;
  }
}
