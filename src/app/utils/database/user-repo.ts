import bcrypt from "bcryptjs";
import { openSql as getMySQLConnection } from "./db";
import { generateConfirmationToken } from "../api/token";
import { AGENT_RISK_LEVEL } from "../const";
import { IFormDataAgentProfile, PredictionDB } from "../interface";
import { UserDB, AgentDB, PaymentIntentDB, CreatePredictionInput, IBet } from "../interface";
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const UserRepo = {
    authenticate,
    registerPassword,
    verifyAccount,
    getUserById,
    getUserByUsername,
    getAgentByUserId,
    getAgentById,
    createAgent,
    updateAgent,
    getAgents,
    getOpenPredictions,
    getPredictionsByAgentId,
    getBetsByAgentId,
    getBetHistoryByAgentId,
    createPaymentIntent,
    getPaymentIntent,
    updatePaymentIntent,
    updateAgentBalance,
    updateAgentNftAddress,
    getPredictionById,
    getBetById,
    getPredictionsWithoutAgentId,
    getGeneralData,
    getSportsData,
    getLeaderboard,
    getPredictionsByUserId,
    changePassword,
    updatePassword,
    createPrediction,
    updateUserBalance,
    createBet,
    updateBettingStatus,
    getRecentActivity
}

async function getRecentActivity(limit: number, offset: number) {
    const db = await getMySQLConnection();
    const query = `
      SELECT * FROM (
        (SELECT 
          'bet' as type,
          bets.id as bet_id,
          bets.user_id as user_id,
          bets.prediction_id as prediction_id,
          bets.created_at as created_at,
          bets.amount as amount,
          agents.image as str_thumb,
          bets.choice as choice,
          predictions.description as description,
          predictions.source as source,
          users.username as username
        FROM bets
        JOIN users ON bets.user_id = users.id
        JOIN predictions ON bets.prediction_id = predictions.id
        JOIN agents ON agents.user_id = users.id
        WHERE bets.is_secret = 0)
        
        UNION ALL
        
        (SELECT 
          'prediction' as type,
          '0' as bet_id,
          predictions.creator_id as user_id,
          predictions.id as prediction_id,
          predictions.created_at as created_at,
          predictions.bet_amount as amount,
          predictions.str_thumb as str_thumb,
          predictions.creator_choice as choice,
          predictions.description as description,
          predictions.source as source,
          users.username as username
        FROM predictions
        JOIN users ON predictions.creator_id = users.id)
      ) AS combined_results
      ORDER BY created_at DESC
      LIMIT ${offset}, ${limit}
    `;
    
    const [rows] = await db.execute<RowDataPacket[]>(query);
    return rows;
}

async function updateBettingStatus(userId: number, is_bet: boolean) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE agents SET is_bet = ? WHERE user_id = ?', [is_bet, userId]);
}

async function createBet(predictionId: number, agentId: number, choice: string, amount: number, reason: string, userId: number, pineconeId: string) {
    const db = await getMySQLConnection();
    await db.execute('INSERT INTO bets (prediction_id, agent_id, choice, amount, reason, user_id, pinecone_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [predictionId, agentId, choice, amount, reason, userId, pineconeId]);
}

async function createPrediction(data: CreatePredictionInput) {
    const db = await getMySQLConnection();
    const [result] = await db.execute<ResultSetHeader>(
        'INSERT INTO predictions (creator_id, description, source, source_url, created_at, status, bet_amount, creator_choice, event_id, league_id, team_a, team_b, str_thumb, predicted_outcome, agent_id, source_type, bet_type, resolution_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            data.creator_id ?? 0,
            data.description ?? '',
            data.source ?? '',
            data.source_url ?? '',
            data.created_at ?? new Date().toISOString(),
            data.status ?? 'open',
            data.bet_amount ?? 0,
            data.creator_choice ?? '',
            data.event_id ?? 0,
            data.league_id ?? 0,
            data.team_a ?? '',
            data.team_b ?? '',
            data.str_thumb ?? '',
            data.predicted_outcome ?? '',
            data.agent_id ?? 0,
            data.source_type ?? '',
            data.bet_type ?? '',
            data.resolution_date ?? new Date().toISOString()
        ]
    );
    return result.insertId;
}

async function changePassword(id: string, currentPassword: string, newPassword: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(UserDB & RowDataPacket)[]>('SELECT * FROM users WHERE id = ?', [id]);
    const user = rows[0];
    if (!user) {
        throw new Error('User not found');
    }
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        throw new Error('Current password is incorrect');
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
}

async function updatePassword(id: number, newPassword: string) {
    const db = await getMySQLConnection();
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
}

async function authenticate({ username, password }: { username: string, password: string }) {
    const pool = await getMySQLConnection();
    try {
        const [rows] = await pool.execute<(UserDB & RowDataPacket)[]>(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        const user = rows[0];

        if (!(user && bcrypt.compareSync(password, user.password))) {
            throw new Error('Username or password is incorrect');
        }

        if (user.is_verified == 0) {
            throw new Error('User is not verified yet. Pls check your telegram for the confirmation link.');
        }

        const token = await generateConfirmationToken(user.id.toString());

        return {
            user: user,
            token
        }
    } catch (error) {
        // Handle or rethrow the error as needed
        throw error;
    }
}

async function registerPassword({ username, password }: { username: string, password: string }) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(UserDB & RowDataPacket)[]>('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (!user) {
        throw new Error('Username "' + username + '" is not registered yet. Pls join the telegram bot to register. ' + process.env.TELEGRAM_BOT_USERNAME);
    }

    if (user.password && user.is_verified == 1) {
        throw new Error('Password already set for user "' + username + '".');
    }

    const token = await generateConfirmationToken(username);

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.execute('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, username]);
    return { token, chatId: user.telegram_id };
}

async function verifyAccount(username: string) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE users SET is_verified = 1 WHERE username = ?', [username]);
}

async function getUserById(id: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(UserDB & RowDataPacket)[]>('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
}

async function getUserByUsername(username: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(UserDB & RowDataPacket)[]>('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
}

async function getAgentByUserId(id: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(AgentDB & RowDataPacket)[]>('SELECT * FROM agents WHERE user_id = ?', [id]);
    return rows[0];
}

async function createAgent(id: string) {
    const db = await getMySQLConnection();
    await db.execute(
        'INSERT INTO agents (user_id, riskLevel, conservativeBetSize, moderateBetSize, aggressiveBetSize, wallet_balance) VALUES (?, ?, ?, ?, ?, ?)',
        [Number(id), AGENT_RISK_LEVEL[0], 0, 0, 0, process.env.CREDIT_BALANCE || 1000]
    );
    return await getAgentByUserId(id);
}

async function updateAgent(id: string, params: IFormDataAgentProfile) {
    const db = await getMySQLConnection();
    await db.execute(
        'UPDATE agents SET name = ?, description = ?, maxBetSize = ?, interests = ?, riskLevel = ?, conservativeBetSize = ?, moderateBetSize = ?, aggressiveBetSize = ?, principles = ?, image = ?, maxTimelineLimit = ?, category = ? WHERE user_id = ?',
        [params.name, params.description, params.maxBetSize, params.interests, params.riskLevel, params.conservativeBetSize, params.moderateBetSize, params.aggressiveBetSize, params.principles, params.image, params.maxTimelineLimit, params.category, id]
    );
}

async function getAgents() {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(AgentDB & RowDataPacket)[]>('SELECT * FROM agents');
    return rows;
}

async function getAgentById(id: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(AgentDB & RowDataPacket)[]>('SELECT * FROM agents WHERE id = ?', [id]);
    return rows[0];
}

async function getOpenPredictions(agent_id: number, category: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute(`
        SELECT 
            predictions.*,
            COUNT(bets.id) as bets_count,
            GROUP_CONCAT(CONCAT(bets.id, ':', bets.agent_id, ':', bets.amount, ':', bets.choice)) as agent_bets,
            COUNT(CASE WHEN bets.agent_id = ? THEN 1 END) as agent_bet_count
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id 
        WHERE predictions.status = 'open' AND predictions.group_info = '' AND predictions.source = ?
        GROUP BY predictions.id
        HAVING agent_bet_count < 2
        ORDER BY predictions.created_at DESC`,
        [agent_id, category]
    );
    return rows;
}

async function getPredictionsByAgentId(id: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute(`
        SELECT 
            predictions.*, 
            COUNT(bets.id) as bets_count 
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id
        WHERE predictions.agent_id = ? 
        GROUP BY predictions.id 
        ORDER BY predictions.created_at DESC`,
        [id]
    );
    return rows;
}

async function getBetsByAgentId(id: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute('SELECT * FROM bets JOIN predictions ON bets.prediction_id = predictions.id WHERE bets.agent_id = ? AND bets.is_secret = 0 ORDER BY bets.created_at DESC', [id]);
    return rows;
}

async function getBetHistoryByAgentId(id: number, limit: number, offset: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket)[]>(
        `SELECT 
            b.*, p.*,
            b.id as bet_id,
            (
                SELECT GROUP_CONCAT(
                    JSON_OBJECT(
                        'id', id,
                        'agent_id', agent_id,
                        'amount', amount,
                        'choice', choice,
                        'created_at', created_at
                    )
                )
                FROM bets 
                WHERE prediction_id = p.id 
                    AND agent_id != 0
                    AND is_secret = 0
            ) as agent_bets
        FROM bets b 
        JOIN predictions p ON b.prediction_id = p.id 
        WHERE b.agent_id = ? AND b.is_secret = 0
        ORDER BY b.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}`,
        [id]
    );

    // Parse the JSON strings into arrays
    return rows.map(row => ({
        ...row,
        agent_bets: row.agent_bets ? JSON.parse(`[${row.agent_bets}]`) : []
    }));
}


async function getPredictionsByUserId(id: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket)[]>(`
        SELECT 
            predictions.*,
            (
                SELECT GROUP_CONCAT(
                    JSON_OBJECT(
                        'id', id,
                        'agent_id', agent_id,
                        'amount', amount,
                        'choice', choice,
                        'created_at', created_at
                    )
                )
                FROM bets 
                WHERE prediction_id = predictions.id 
                    AND agent_id != 0
                    AND is_secret = 0
            ) as agent_bets
        FROM predictions
        WHERE predictions.creator_id = ? AND predictions.agent_id = 0
        GROUP BY predictions.id
        ORDER BY predictions.created_at DESC`,
        [id]
    );

    return rows.map(row => ({
        ...row,
        agent_bets: row.agent_bets ? JSON.parse(`[${row.agent_bets}]`) : []
    }));
}

async function createPaymentIntent(paymentId: string, userId: string, agentId: number, amount: number, creditAmount: number, paymentMethod: string, fromAddress: string) {
    const db = await getMySQLConnection();
    await db.execute('INSERT INTO payment_intents (payment_id, user_id, agent_id, amount, credit_amount, payment_method, from_address, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [paymentId, userId, agentId, amount, creditAmount, paymentMethod, fromAddress, 'pending', new Date(Date.now() + 30 * 60 * 1000)]);
}

async function getPaymentIntent(paymentId: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(PaymentIntentDB & RowDataPacket)[]>('SELECT * FROM payment_intents WHERE payment_id = ?', [paymentId]);
    return rows[0];
}

async function updatePaymentIntent(paymentId: string, status: string) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE payment_intents SET status = ? WHERE payment_id = ?', [status, paymentId]);
}

async function updateAgentBalance(agentId: number, creditAmount: number) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE agents SET wallet_balance = wallet_balance + ?, escrow_balance = escrow_balance - ? WHERE id = ?', [creditAmount, creditAmount, agentId]);
}

async function updateUserBalance(userId: number, creditAmount: number) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE users set wallet_balance = wallet_balance - ?, escrow_balance = escrow_balance + ? WHERE id = ?', [creditAmount, creditAmount, userId]);
}

async function updateAgentNftAddress(agentId: number, nftAddress: string) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE agents SET nft_address = ? WHERE id = ?', [nftAddress, agentId]);
}

async function getPredictionById(id: string) {
    try {
        const db = await getMySQLConnection();
        const [rows] = await db.execute<(PredictionDB & RowDataPacket)[]>(`
            SELECT 
                p.*,
                GROUP_CONCAT(
                    JSON_OBJECT(
                        'id', b.id,
                        'amount', b.amount,
                        'choice', COALESCE(b.choice, ''),
                        'reason', COALESCE(b.reason, ''),
                        'pinecone_id', COALESCE(b.pinecone_id, ''),
                        'created_at', DATE_FORMAT(b.created_at, '%Y-%m-%dT%H:%i:%s.000Z')
                    ) SEPARATOR '|||'
                ) as bets
            FROM predictions p
            LEFT JOIN bets b ON p.id = b.prediction_id AND b.is_secret = ?
            WHERE p.id = ?
            GROUP BY p.id`,
            [0, id]
        );

        if (!rows[0]) {
            return null;
        }

        // Parse the GROUP_CONCAT result into an array
        rows[0].bets = (typeof rows[0].bets === 'string' && rows[0].bets as string)
            ? (rows[0].bets as string).split('|||').map(bet => {
                try {
                    return JSON.parse(bet);
                } catch (e) {
                    console.error('Failed to parse bet:', e);
                    return null;
                }
            }).filter(bet => bet !== null)
            : [];

        return rows[0];
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error in getPredictionById for id ${id}:`, error.message);
        }
        throw error;
    }
}

async function getBetById(id: string, userId: string) {
    try {
        const db = await getMySQLConnection();
        const [rows] = await db.execute<(IBet & RowDataPacket)[]>('SELECT *, bets.pinecone_id as pinecone_id FROM bets JOIN predictions ON bets.prediction_id = predictions.id WHERE bets.id = ? AND bets.user_id = ?', [id, userId]);
        return rows[0];
    } catch (error) {
        console.error("Error in getBetById: ", error);
        throw error;
    }
}

async function getPredictionsWithoutAgentId(id: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket)[]>(`
        SELECT 
            predictions.*, 
            COUNT(DISTINCT CASE WHEN bets.is_secret = 0 THEN bets.id END) as bets_count,
            CONCAT('[', 
                GROUP_CONCAT(
                    IF(bets.is_secret = 0,
                        JSON_OBJECT(
                            'id', bets.id,
                            'amount', COALESCE(bets.amount, 0),
                            'choice', COALESCE(bets.choice, ''),
                            'reason', COALESCE(bets.reason, ''),
                            'pinecone_id', COALESCE(bets.pinecone_id, ''),
                            'created_at', DATE_FORMAT(bets.created_at, '%Y-%m-%dT%H:%i:%s.000Z')
                        ),
                        NULL
                    )
                ),
            ']') as agent_bets
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id
        WHERE predictions.agent_id <> ? 
        GROUP BY predictions.id 
        ORDER BY predictions.created_at DESC`,
        [id]
    );

    // Simplified parsing since we're now getting a proper JSON array string
    return rows.map(row => ({
        ...row,
        agent_bets: row.agent_bets && row.agent_bets !== '[null]' 
            ? JSON.parse(row.agent_bets).filter(Boolean)
            : []
    }));
    // const [rows] = await db.execute<(RowDataPacket)[]>(`
    //     SELECT 
    //         predictions.*, 
    //         COUNT(DISTINCT CASE WHEN bets.is_secret = 0 THEN bets.id END) as bets_count,
    //         JSON_ARRAYAGG(
    //             IF(bets.is_secret = 0,
    //                 JSON_OBJECT(
    //                     'id', bets.id,
    //                     'amount', COALESCE(bets.amount, 0),
    //                     'choice', COALESCE(bets.choice, ''),
    //                     'reason', COALESCE(bets.reason, ''),
    //                     'pinecone_id', COALESCE(bets.pinecone_id, ''),
    //                     'created_at', DATE_FORMAT(bets.created_at, '%Y-%m-%dT%H:%i:%s.000Z')
    //                 ),
    //                 NULL
    //             )
    //         ) as agent_bets
    //     FROM predictions 
    //     LEFT JOIN bets ON predictions.id = bets.prediction_id
    //     WHERE predictions.agent_id <> ? 
    //     GROUP BY predictions.id 
    //     ORDER BY predictions.created_at DESC`,
    //     [id]
    // );

    // // Clean up the results by removing null values from agent_bets
    // return rows.map(row => ({
    //     ...row,
    //     agent_bets: Array.isArray(row.agent_bets)
    //         ? row.agent_bets.filter(Boolean)
    //         : []
    // }));
}

async function getGeneralData(id: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute(`
        SELECT 
            predictions.*, 
            COUNT(DISTINCT CASE WHEN bets.is_secret = 1 THEN bets.id END) as secret_bets_count,
            COUNT(DISTINCT CASE WHEN bets.is_secret = 0 THEN bets.id END) as public_bets_count,
            GROUP_CONCAT(
                CASE WHEN bets.is_secret = 1 
                THEN CONCAT(bets.id, ':', bets.agent_id, ':', bets.amount, ':', bets.choice)
                END
            ) as secret_bets
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id
        WHERE predictions.agent_id <> ? AND predictions.source != "sportDB"
        GROUP BY predictions.id 
        ORDER BY predictions.created_at DESC`,
        [id]
    );
    return rows;
}

async function getSportsData(id: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute(`
        SELECT 
            predictions.*, 
            COUNT(DISTINCT CASE WHEN bets.is_secret = 1 THEN bets.id END) as secret_bets_count,
            COUNT(DISTINCT CASE WHEN bets.is_secret = 0 THEN bets.id END) as public_bets_count,
            GROUP_CONCAT(
                CASE WHEN bets.is_secret = 1 
                THEN CONCAT(bets.id, ':', bets.agent_id, ':', bets.amount, ':', bets.choice)
                END
            ) as secret_bets
        FROM predictions 
        LEFT JOIN bets ON predictions.id = bets.prediction_id
        WHERE predictions.agent_id <> ? AND predictions.source = "sportDB"
        GROUP BY predictions.id 
        ORDER BY predictions.created_at DESC`,
        [id]
    );
    return rows;
}

async function getLeaderboard() {
    const db = await getMySQLConnection();
    const [rows] = await db.execute(`
        SELECT 
            agents.id,
            agents.user_id,
            agents.name,
            agents.description,
            agents.maxBetSize,
            agents.interests,
            agents.riskLevel,
            agents.conservativeBetSize,
            agents.moderateBetSize,
            agents.aggressiveBetSize,
            agents.principles,
            agents.image,
            agents.maxTimelineLimit,
            agents.category,
            agents.wallet_balance,
            agents.nft_address,
            agents.total_winnings,
            COUNT(DISTINCT bets.id) as bets_count
        FROM agents 
        LEFT JOIN bets ON agents.id = bets.agent_id
        WHERE bets.is_secret = 0
        GROUP BY 
            agents.id,
            agents.user_id,
            agents.name,
            agents.description,
            agents.maxBetSize,
            agents.interests,
            agents.riskLevel,
            agents.conservativeBetSize,
            agents.moderateBetSize,
            agents.aggressiveBetSize,
            agents.principles,
            agents.image,
            agents.maxTimelineLimit,
            agents.category,
            agents.wallet_balance,
            agents.nft_address,
            agents.total_winnings
        ORDER BY agents.total_winnings DESC`
    );
    return rows;
}

