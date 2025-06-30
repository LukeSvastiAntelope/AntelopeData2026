# Authentication Migration Plan
## From Username-Based to Email-Based Auth with NextAuth

### 📋 **Overview**
Migrating from custom JWT username-based authentication to NextAuth email-based authentication with Google OAuth support.

### 🎯 **Goals**
1. Convert username system to email-based authentication
2. Implement NextAuth for better security and OAuth support
3. Add Google OAuth integration
4. Maintain user experience with display names
5. Add rate limiting and security hardening

---

## 📊 **Current State Analysis**

### **Current System:**
- **Auth Method**: Custom JWT tokens stored in localStorage
- **Login Field**: Username (no email validation)
- **Password**: Strong validation (8+ chars, mixed case, numbers, special chars)
- **Session**: JWT tokens with 1-hour expiry
- **Verification**: Auto-verified (no email confirmation)
- **OAuth**: Discord configured but not actively used

### **Security Issues:**
- Username validation is disabled (accepts any input)
- JWT tokens in localStorage (XSS vulnerable)
- No rate limiting on auth endpoints
- No email verification
- Mixed auth systems (JWT + NextAuth)

---

## 🚀 **Migration Strategy**

### **Phase 1: Database & Email Conversion** ⏱️ *1-2 hours*

#### **1.1 Database Schema Changes**
```sql
-- Add email column to users table
ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN is_first_login BOOLEAN DEFAULT 1;

-- Create index for email lookups
CREATE INDEX idx_users_email ON users(email);
```

#### **1.2 Data Migration Script**
```sql
-- Convert existing usernames to emails and set temporary password
UPDATE users SET 
  email = CONCAT('thomas.petersen+', username, '@gmail.com'),
  display_name = username,
  password = '$2a$10$[hash_of_ao27@30LLl]',  -- bcrypt hash
  is_first_login = 1
WHERE email IS NULL;
```

#### **1.3 Update User Interface**
- Change login form: Username field → Email field
- Change registration form: Username field → Email field  
- Add display name field to registration
- Add first-time login flow for display name setup

---

### **Phase 2: NextAuth Integration** ⏱️ *2-3 hours*

#### **2.1 NextAuth Configuration**
```typescript
// src/auth.ts
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" }
      },
      authorize: async (credentials) => {
        const user = await UserRepo.authenticate({
          email: credentials.email,
          password: credentials.password
        });
        return user ? { 
          id: user.id, 
          email: user.email, 
          name: user.display_name || user.username 
        } : null;
      }
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.displayName = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.displayName = token.displayName;
      return session;
    }
  },
  pages: {
    signIn: '/login',
    newUser: '/setup-profile' // First-time login flow
  }
})
```

#### **2.2 Replace JWT System**
- Remove localStorage token management
- Replace custom auth API routes with NextAuth
- Update middleware to use NextAuth sessions
- Replace all `fetch` calls with NextAuth session handling

#### **2.3 Session Management Migration**
```typescript
// Before (JWT):
const token = localStorage.getItem('token');
fetch('/api/endpoint', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// After (NextAuth):
import { useSession } from "next-auth/react"
const { data: session } = useSession();
// Automatic session handling in API routes
```

---

### **Phase 3: User Experience Flow** ⏱️ *1-2 hours*

#### **3.1 First-Time Login Flow**
```typescript
// Check if user needs to set up display name
if (user.is_first_login) {
  redirect('/setup-profile');
}
```

#### **3.2 Setup Profile Page**
- Welcome message for migrated users
- Display name input (pre-filled with username)
- Option to change display name
- "Complete Setup" button
- Update `is_first_login = 0` after completion

#### **3.3 Display Name Generation**
```typescript
// For OAuth users, generate display name from email
function generateDisplayName(email: string): string {
  const [localPart] = email.split('@');
  return localPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
```

---

### **Phase 4: Google OAuth Integration** ⏱️ *1 hour*

#### **4.1 Environment Variables**
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
```

#### **4.2 OAuth User Handling**
```typescript
// Handle new OAuth users
async signIn({ user, account, profile }) {
  if (account?.provider === 'google') {
    const existingUser = await getUserByEmail(user.email);
    if (!existingUser) {
      // Create new user from OAuth
      await createUserFromOAuth({
        email: user.email,
        display_name: generateDisplayName(user.email),
        provider: 'google',
        is_first_login: 1 // Still show setup flow
      });
    }
  }
  return true;
}
```

#### **4.3 Account Linking**
- Handle case where user has both password and OAuth accounts
- Merge accounts if email matches
- Prevent duplicate accounts

---

### **Phase 5: Security Hardening** ⏱️ *1 hour*

#### **5.1 Rate Limiting**
```typescript
// Add rate limiting middleware
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts, please try again later'
});
```

#### **5.2 Email Validation**
```typescript
export function validateEmail(email: string) {
  if (!email || email.trim().length === 0) return "Email is required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return "Please enter a valid email address";
  if (email.length > 254) return "Email is too long";
  return null;
}
```

#### **5.3 Password Reset via Email**
- Replace Telegram-based reset with email
- Generate secure reset tokens
- Email templates for reset links

---

## 📁 **File Changes Required**

### **Frontend Changes:**
- `src/app/(auth)/login/page.tsx` - Change username to email
- `src/app/(auth)/register/page.tsx` - Add email + display name
- `src/app/(auth)/setup-profile/page.tsx` - New first-time setup page
- `src/app/utils/validation.ts` - Add email validation
- `src/auth.ts` - NextAuth configuration
- `src/middleware.ts` - Update to use NextAuth sessions

### **Backend Changes:**
- `src/app/api/signin/route.ts` - Update for email-based auth
- `src/app/api/signup/route.ts` - Handle email + display name
- `src/app/utils/database/user-repo.ts` - Update all auth functions
- All protected API routes - Replace JWT with NextAuth session

### **Database Changes:**
- Migration script for schema updates
- Data migration script for existing users

---

## 🔄 **Migration Steps (Execution Order)**

### **Step 1: Backup & Preparation**
1. Create database backup
2. Test migration script on copy of database
3. Prepare rollback plan

### **Step 2: Database Migration**
1. Add new columns to users table
2. Run data migration script (convert usernames to emails)
3. Verify data integrity

### **Step 3: Code Migration**
1. Update validation functions
2. Update auth API routes
3. Update user repository functions
4. Update frontend forms

### **Step 4: NextAuth Integration**
1. Configure NextAuth providers
2. Replace JWT system with NextAuth
3. Update middleware
4. Update all API route authentication

### **Step 5: Testing & Verification**
1. Test login with converted accounts (password: ao27@30LLl)
2. Test registration with new email system
3. Test Google OAuth flow
4. Test first-time login setup flow
5. Verify all protected routes work

### **Step 6: Cleanup**
1. Remove old JWT token utilities
2. Remove unused auth code
3. Update documentation

---

## ⚠️ **Risk Mitigation**

### **Potential Issues:**
1. **Email conflicts** - Multiple users with similar usernames
2. **Session disruption** - All users will need to re-login
3. **OAuth conflicts** - Users might have existing Google accounts
4. **Data loss** - Migration script errors

### **Mitigation Strategies:**
1. **Unique email generation** - Add numbers if conflicts (thomas.petersen+username1@gmail.com)
2. **Clear communication** - Notify users about re-login requirement
3. **Account linking** - Merge accounts by email where appropriate
4. **Thorough testing** - Test migration on copy before production
5. **Rollback plan** - Keep backup and rollback procedures ready

---

## 🧪 **Testing Checklist**

### **Pre-Migration Testing:**
- [ ] Backup database
- [ ] Test migration script on copy
- [ ] Verify all existing users can be converted
- [ ] Test rollback procedure

### **Post-Migration Testing:**
- [ ] Login with converted account (ao27@30LLl password)
- [ ] Register new account with email
- [ ] First-time login flow works
- [ ] Display name setup works
- [ ] Google OAuth registration
- [ ] Google OAuth login (existing account)
- [ ] All protected API routes work
- [ ] Session persistence across browser refresh
- [ ] Rate limiting works on auth endpoints

---

## 📝 **Notes & Considerations**

### **Temporary Password:**
- All existing users get password: `ao27@30LLl`
- Users will be prompted to change on first login
- Consider sending email notification about migration

### **Display Names:**
- Existing usernames become display names
- OAuth users get auto-generated display names
- Users can change display names anytime

### **Email Format:**
- Existing: `thomas.petersen+{username}@gmail.com`
- New registrations: Real email addresses
- Gmail + feature allows easy filtering/organization

### **Rollback Plan:**
- Keep backup of original database
- Document all changes for quick reversal
- Test rollback procedure before migration

---

## 🎯 **Success Criteria**

✅ **Migration Complete When:**
1. All existing users converted to email-based accounts
2. New registration uses email + display name
3. Google OAuth works for new and existing users
4. First-time login flow guides users through setup
5. All security vulnerabilities addressed
6. Rate limiting prevents brute force attacks
7. No user data lost in migration
8. All existing functionality preserved

---

*Last Updated: [Current Date]*
*Next Review: After Phase 1 completion* 