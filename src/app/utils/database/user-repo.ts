import bcrypt from "bcryptjs";
import { openDb } from "./db";
import { generateConfirmationToken } from "../api/token";
import { AGENT_RISK_LEVEL } from "../const";
import { IFormDataAgentProfile } from "../interface";

export const UserRepo = {
    authenticate,
    registerPassword,
    verifyAccount,
    getUserById,
    getAgentByUserId,
    createAgent,
    updateAgent,
    getAgents,
    getOpenPredictions,
    getPredictionsByAgentId,
    getBetsByAgentId,
    getBetHistoryByAgentId
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

    const token = await generateConfirmationToken(user.id);

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
    return { token, chatId: user.telegram_id };
}

async function verifyAccount(username: string) {
    const db = await openDb();
    await db.run('UPDATE users SET is_verified = 1 WHERE username = ?', username);
}

async function getUserById(id: string) {
    const db = await openDb();
    return await db.get('SELECT * FROM users WHERE id = ?', id);
}

async function getAgentByUserId(id: string) {
    const db = await openDb();
    return await db.get('SELECT * FROM agents WHERE user_id = ?', id);
}

async function createAgent(id: string) {
    console.log(id);
    const db = await openDb();
    await db.run('INSERT INTO agents (user_id, riskLevel, conservativeBetSize, moderateBetSize, aggressiveBetSize, wallet_balance) VALUES (?, ?, ?, ?, ?, ?)', Number(id), AGENT_RISK_LEVEL[0], 0, 0, 0, 10000);
    return await getAgentByUserId(id);
}

async function updateAgent(id: string, params: IFormDataAgentProfile) {
    const db = await openDb();
    await db.run(
        'UPDATE agents SET name = ?, description = ?, maxBetSize = ?, interests = ?, riskLevel = ?, conservativeBetSize = ?, moderateBetSize = ?, aggressiveBetSize = ?, principles = ?, image = ?, maxTimelineLimit = ?, category = ? WHERE user_id = ?',
        params.name, params.description, params.maxBetSize, params.interests, params.riskLevel, params.conservativeBetSize, params.moderateBetSize, params.aggressiveBetSize, params.principles, params.image, params.maxTimelineLimit, params.category, id
    );
}

async function getAgents() {
    const db = await openDb();
    return await db.all('SELECT * FROM agents');
}

async function getOpenPredictions() {
    const db = await openDb();
    return await db.all(`
        SELECT 
            predictions.*, 
            COALESCE(SUM(CASE 
                WHEN bets.choice = predictions.creator_choice THEN bets.amount
                ELSE 0
            END), 0) as match_total_amount,
            COALESCE(SUM(CASE 
                WHEN bets.choice != predictions.creator_choice THEN bets.amount
                ELSE 0
            END), 0) as not_match_total_amount,
            COUNT(bets.id) as bets_count,
            GROUP_CONCAT(bets.agent_id || ':' || bets.amount || ':' || bets.choice) as agent_bets
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id 
        WHERE predictions.status = "open" AND predictions.group_info == ""
        GROUP BY predictions.id
        ORDER BY predictions.created_at DESC`
    );
}

async function getPredictionsByAgentId(id: string) {
    const db = await openDb();
    return await db.all(`
        SELECT 
            predictions.*, 
            COUNT(bets.id) as bets_count 
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id 
        WHERE predictions.agent_id = ? 
        GROUP BY predictions.id 
        ORDER BY predictions.created_at DESC`,
        id
    );
}

async function getBetsByAgentId(id: string) {
    const db = await openDb();
    return await db.all('SELECT * FROM bets JOIN predictions ON bets.prediction_id = predictions.id WHERE bets.agent_id = ? ORDER BY bets.created_at DESC', id);
}

async function getBetHistoryByAgentId(id: string, limit: number, offset: number) {
    const db = await openDb();
    return await db.all('SELECT * FROM bets JOIN predictions ON bets.prediction_id = predictions.id WHERE bets.agent_id = ? ORDER BY bets.created_at DESC LIMIT ? OFFSET ?', id, limit, offset);
}