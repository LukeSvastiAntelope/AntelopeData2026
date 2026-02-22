# Google OAuth Setup Instructions

## 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (for development)
   - `https://yourdomain.com/api/auth/callback/google` (for production)

## 2. Environment Variables

Add these to your `.env` file:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

## 3. NextAuth Configuration

The NextAuth configuration in `src/auth.ts` has been updated to include:
- ✅ Credentials provider (email/password)
- ✅ Google OAuth provider
- ✅ Automatic user creation for new Google sign-ins
- ✅ Session management with user ID and first-login status

## 4. Testing

Once Google OAuth is configured:
1. Users can sign in with Google and accounts will be auto-created
2. Existing users can link their Google accounts
3. New Google users will be prompted for display name setup if needed 