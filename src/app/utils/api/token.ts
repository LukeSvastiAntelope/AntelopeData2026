import { SignJWT, jwtVerify } from 'jose';

const isDev = process.env.NODE_ENV !== 'production';

// Lazy-load and validate the secret key only when needed (not at module import time)
function getSecretKey(): Uint8Array {
  const rawSecret = process.env.JWT_SECRET_KEY;
  if (!rawSecret) {
    throw new Error('JWT_SECRET_KEY environment variable must be set for token operations.');
  }
  if (rawSecret.length < 32) {
    throw new Error('JWT_SECRET_KEY must be at least 32 characters to ensure token security.');
  }
  return new TextEncoder().encode(rawSecret);
}

export async function generateConfirmationToken(email: string, role = 'user'): Promise<string> {
  const SECRET_KEY = getSecretKey();
  const token = await new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET_KEY);
  
  return token;
}

export async function verifyConfirmationToken(token: string) {
  try {
    const SECRET_KEY = getSecretKey();
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
