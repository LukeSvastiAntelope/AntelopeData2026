import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET_KEY || 'your-secret-key-at-least-32-characters'
);

export async function generateConfirmationToken(email: string): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET_KEY);
  
  return token;
}

export async function verifyConfirmationToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    console.log(payload);
    
    return payload;
  } catch (error) {
    return null;
  }
}