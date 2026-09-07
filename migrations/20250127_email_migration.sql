-- Migration: Convert from username-based to email-based authentication
-- Date: 2025-01-27
-- Description: Add email, display_name, and is_first_login columns to users table

-- Step 1: Add new columns to users table
ALTER TABLE users 
ADD COLUMN email VARCHAR(255) UNIQUE,
ADD COLUMN display_name VARCHAR(100),
ADD COLUMN is_first_login BOOLEAN DEFAULT 1;

-- Step 2: Create index for email lookups (performance optimization)
CREATE INDEX idx_users_email ON users(email);

-- Step 3: Generate bcrypt hash for password 'ao27@30LLl'
-- Hash generated with bcrypt rounds=10: $2a$10$TT./NOijOIat4No1sZx1uewVMzuQEIKCkmkEmC3tc015MnFhxuvRK
-- You can generate this hash in Node.js with: bcrypt.hashSync('ao27@30LLl', 10)

-- Step 4: Convert existing usernames to emails and set temporary password
UPDATE users SET 
  email = CONCAT('thomas.petersen+', username, '@gmail.com'),
  display_name = username,
  password = '$2a$10$TT./NOijOIat4No1sZx1uewVMzuQEIKCkmkEmC3tc015MnFhxuvRK', -- ao27@30LLl
  is_first_login = 1
WHERE email IS NULL;

-- Step 5: Verify the migration worked
-- SELECT id, username, email, display_name, is_first_login FROM users LIMIT 5;

-- Note: After this migration:
-- 1. All existing users will have emails like: thomas.petersen+{username}@gmail.com
-- 2. All existing users will have password: ao27@30LLl
-- 3. All existing users will be marked for first-time login setup
-- 4. Display names will be set to their original usernames 