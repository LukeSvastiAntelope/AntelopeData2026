import bcrypt from "bcryptjs";
import { openDb } from "./db";
import { generateConfirmationToken } from "../api/token";

export const UserRepo = {
    authenticate,
    registerPassword,
    verifyAccount
}

async function authenticate({ username, password }: { username: string, password: string }) {
    const db = await openDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    
    if (!(user && bcrypt.compareSync(password, user.password))) {
        throw 'Username or password is incorrect';
    }

    if (user.is_verified == 0) {
        throw 'User is not verified yet. Pls check your telegram for the confirmation link.';
    }

    const token = await generateConfirmationToken(user.username);

    return {
        user: user,
        token
    }
}

async function registerPassword({ username, password }: { username: string, password: string }) {
    // validate
    const db = await openDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) {
        throw 'Username "' + username + '" is not registered yet. Pls join the telegram bot to register. ' + process.env.TELEGRAM_BOT_USERNAME;
    }

    if (user.password && user.is_verified == 1) {
        throw 'Password already set for user "' + username + '".';
    }

    const token = await generateConfirmationToken(username);

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.run('UPDATE users SET password = ? WHERE username = ?', hashedPassword, username);
    return {token, chatId: user.telegram_id};
}

async function verifyAccount(username: string) {
    const db = await openDb();
    await db.run('UPDATE users SET is_verified = 1 WHERE username = ?', username);
}
