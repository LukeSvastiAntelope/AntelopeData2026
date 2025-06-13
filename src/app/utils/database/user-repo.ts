import bcrypt from "bcryptjs";
import { openSql as getMySQLConnection } from "./db";
import { generateConfirmationToken } from "../api/token";
import { AGENT_RISK_LEVEL } from "../const";
import { IFormDataAgentProfile, PredictionDB } from "../interface";
import { UserDB, AgentDB, PaymentIntentDB, CreatePredictionInput, IBet } from "../interface";
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const UserRepo = {
    insertConversation,
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
    getRecentActivity,
    createAgentJoinAction,
    updateAgentTraining,
    getPlatformAccountByUserId,
    connectTelegram,
    getPredictionsfromAdmin,
    resolvePrediction,
    getBetsByPredictionId,
    updateUserPredictionBalance,
    updatePlatformAccountBalance,
    getBetsStatsByAgentId,
    getPredictionTopicConfigs,
    upsertPredictionTopicConfig,
    deleteUserById,
    getAllPredictions,
}

async function getBetsStatsByAgentId(agentId: number) {
    const db = await getMySQLConnection();
    try {
        const query = `
            SELECT 
                COUNT(*) AS total_bets,
                COALESCE(SUM(CASE 
                    WHEN predictions.status = 'resolved' 
                         AND predictions.outcome = bets.choice 
                         AND bets.is_secret = 0 
                    THEN 1 ELSE 0 END), 0) AS win_count,
                COALESCE(SUM(CASE 
                    WHEN predictions.status = 'resolved' 
                         AND predictions.outcome <> bets.choice 
                         AND predictions.outcome IS NOT NULL
                         AND bets.is_secret = 0 
                    THEN 1 ELSE 0 END), 0) AS lose_count,
                COALESCE(SUM(CASE 
                    WHEN predictions.status = 'open' 
                         AND bets.is_secret = 0 
                    THEN 1 ELSE 0 END), 0) AS open_bets,
                COALESCE(ROUND(AVG(CASE 
                    WHEN bets.is_secret = 0 
                    THEN CAST(bets.amount AS DECIMAL(10,2))
                    ELSE NULL END), 2), 0) AS avg_bet_size,
                COUNT(DISTINCT CASE WHEN bets.is_secret = 0 THEN bets.id END) as non_secret_bets_count,
                SUM(CASE WHEN bets.is_secret = 0 THEN bets.amount ELSE 0 END) as total_amount
            FROM bets
            JOIN predictions ON bets.prediction_id = predictions.id
            WHERE bets.agent_id = ? AND bets.is_secret = 0`;

        console.log('Executing query for agent:', agentId);
        const [rows] = await db.execute<(RowDataPacket)[]>(query, [agentId]);
        console.log('Query results:', rows[0]);
        
        // Add validation to ensure we're returning a number
        const result = rows[0];
        result.avg_bet_size = parseFloat(result.avg_bet_size) || 0;
        
        return result;
    } catch (error) {
        console.error('Error in getBetsStatsByAgentId:', error);
        throw error;
    }
}

async function updatePlatformAccountBalance(platformId: number, win: number, betAmount: number) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE platform_accounts SET wallet_balance = wallet_balance + ?, escrow_balance = escrow_balance - ?, total_winnings = total_winnings + ? WHERE id = ?', [win, betAmount, win > 0 ? 1 : 0, platformId]);
}

async function updateUserPredictionBalance(userId: number, win: number, betAmount: number) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE users SET escrow_balance = escrow_balance - ?, wallet_balance = wallet_balance + ?, total_winnings = total_winnings + ? WHERE id = ?', [betAmount, win, win > 0 ? 1 : 0, userId]);
}

async function getBetsByPredictionId(id: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket)[]>(`SELECT b.*, u.username, pa.platform_id as pa_platform_id
      FROM bets as b
      LEFT JOIN users as u ON b.user_id = u.id
      LEFT JOIN platform_accounts as pa ON b.platform_id = pa.id AND pa.platform = 'telegram'
      WHERE prediction_id = ? AND state <> 'canceled'`, [id]);
    return rows;
}

async function resolvePrediction(id: string, outcome: string) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE predictions SET outcome = ?, status = ? WHERE id = ?', [outcome, "resolved", id]);
}

async function getPredictionsfromAdmin() {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket)[]>('SELECT * FROM predictions ORDER BY status ASC, resolution_date ASC');
    return rows;
}

async function connectTelegram(userId: string, telegram_id: string, username: string, first_name: string, last_name: string, type: string) {
    const db = await getMySQLConnection();
    const telegram_username = username ? username : first_name + ' ' + last_name;
    const [rows] = await db.execute<(RowDataPacket)[]>('SELECT * FROM platform_accounts WHERE platform_id = ? AND platform = ?', [telegram_id, type]);
    if (rows.length > 0) {
        if (rows[0].user_id) {
            throw new Error(`This ${type} account is already connected to another account.`);
        } else {
            const walletBalance = parseFloat(rows[0].wallet_balance) || 0;
            const escrowBalance = parseFloat(rows[0].escrow_balance) || 0;

            // Update platform account with numeric values
            await db.execute(
                'UPDATE platform_accounts SET user_id = ?, username = ?, wallet_balance = ?, escrow_balance = ? WHERE platform_id = ? AND platform = ?',
                [userId, telegram_username, 0, 0, telegram_id, type]
            );

            await db.execute(
                'UPDATE users SET wallet_balance = wallet_balance + ?, escrow_balance = escrow_balance + ? WHERE id = ?',
                [walletBalance, escrowBalance, userId]
            );
        }
    } else {
        await db.execute(
            'INSERT INTO platform_accounts (platform_id, user_id, username, platform, wallet_balance, escrow_balance) VALUES (?, ?, ?, ?, ?, ?)',
            [telegram_id, userId, telegram_username, type, 0, 0]
        );
    }
}

async function getPlatformAccountByUserId(userId: number) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket)[]>('SELECT * FROM platform_accounts WHERE user_id = ?', [userId]);
    return rows[0];
}

async function insertConversation(userId: number, agentId: number, message: string, type: string) {
    const db = await getMySQLConnection();
    await db.execute('INSERT INTO conversations (user_id, agent_id, message, type) VALUES (?, ?, ?, ?)', [userId, agentId, message, type]);
}

async function updateAgentTraining(agentId: number, train_index: string) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE agents SET trainCount = trainCount - 1, train_index = ? WHERE id = ?', [train_index, agentId]);
}

async function createAgentJoinAction(userId: string, description: string, type: string) {
    const db = await getMySQLConnection();
    await db.execute('INSERT INTO actions (user_id, description, type) VALUES (?, ?, ?)', [userId, description, type]);
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
          predictions.str_thumb as str_thumb,
          bets.choice as choice,
          predictions.description as description,
          predictions.source as source,
          users.username as username,
          agents.name as agent_name,
          agents.image as agent_image
        FROM bets
        JOIN users ON bets.user_id = users.id
        JOIN predictions ON bets.prediction_id = predictions.id
        JOIN agents ON agents.id = bets.agent_id
        WHERE bets.is_secret = 0)
        
        UNION ALL
        
        (SELECT 
          'prediction' as type,
          '0' as bet_id,
          predictions.user_id as user_id,
          predictions.id as prediction_id,
          predictions.created_at as created_at,
          predictions.bet_amount as amount,
          predictions.str_thumb as str_thumb,
          predictions.creator_choice as choice,
          predictions.description as description,
          predictions.source as source,
          users.username as username,
          '' as agent_name,
          '' as agent_image
        FROM predictions
        JOIN users ON predictions.user_id = users.id)

        UNION ALL

        (SELECT 
          actions.type as type,
          '0' as bet_id,
          actions.user_id as user_id,
          '0' as prediction_id,
          actions.created_at as created_at,
          '0' as amount,
          agents.image as str_thumb,
          '0' as choice,
          actions.description as description,
          '0' as source,
          users.username as username,
          agents.name as agent_name,
          agents.image as agent_image
        FROM actions
        JOIN users ON actions.user_id = users.id
        JOIN agents ON agents.user_id = users.id)
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

async function createPrediction(data: CreatePredictionInput, choices: string[]) {
    const db = await getMySQLConnection();
    const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO predictions 
        (user_id, description, source, source_url, created_at, status, bet_amount, creator_choice, event_id, league_id, team_a, team_b, str_thumb, predicted_outcome, agent_id, source_type, bet_type, resolution_date, choices, context) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.user_id ?? 0,
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
            data.resolution_date ?? new Date().toISOString(),
            choices.length > 0 ? JSON.stringify(choices) : '',
            data.context ?? ''
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

        const token = await generateConfirmationToken(user.id.toString(), user.role);

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

    if (user) {
        throw new Error('Username "' + username + '" is already registered.');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.execute('INSERT INTO users (username, password, is_verified) VALUES (?, ?, 1)', [username, hashedPassword]);
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
    const [userRows] = await db.execute<(UserDB & RowDataPacket)[]>(
        'SELECT * FROM users WHERE username = ?',
        [username]
    );

    if (!userRows[0]) return null;

    const [platformRows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM platform_accounts WHERE user_id = ?',
        [userRows[0].id]
    );

    return {
        ...userRows[0],
        platform_accounts: platformRows
    };
}

async function getAgentByUserId(id: string) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(AgentDB & RowDataPacket)[]>(
        `SELECT 
            agents.*,
            users.wallet_balance,
            users.escrow_balance,
            JSON_ARRAYAGG(
                IF(platform_accounts.id IS NOT NULL,
                    JSON_OBJECT(
                        'platform_id', platform_accounts.platform_id,
                        'platform', platform_accounts.platform
                    ),
                    NULL
                )
            ) as platform_accounts
        FROM agents 
        JOIN users ON agents.user_id = users.id
        LEFT JOIN platform_accounts ON users.id = platform_accounts.user_id
        WHERE users.id = ?
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
            agents.model,
            agents.plugins,
            agents.nft_address,
            agents.ipfs_hash,
            agents.trainCount,
            agents.train_index,
            agents.is_bet,
            agents.total_winnings`,
        [id]
    );

    if (!rows[0]) return null;

    // Clean up the platform_accounts array
    return {
        ...rows[0],
        platform_accounts: Array.isArray(rows[0].platform_accounts) 
            ? rows[0].platform_accounts.filter(Boolean)
            : []
    };
}

async function createAgent(id: string) {
    const db = await getMySQLConnection();
    // Default placeholder avatar - a data URI for a simple avatar
    const defaultAvatar = "https://api.dicebear.com/7.x/bottts/svg?seed=agent" + id;
    // Default name
    const defaultName = "My Agent";
    
    await db.execute(
        'INSERT INTO agents (user_id, riskLevel, conservativeBetSize, moderateBetSize, aggressiveBetSize, image, name, is_onboarded, description, maxBetSize, interests, principles, maxTimelineLimit, category, model, plugins, is_bet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [Number(id), AGENT_RISK_LEVEL[0], 10, 25, 50, defaultAvatar, defaultName, 0, '', 100, '', '', 30, 'General', 'gpt-4o', '', 1]
    );
    return await getAgentByUserId(id);
}

async function updateAgent(id: string, params: IFormDataAgentProfile) {
    const db = await getMySQLConnection();
    
    // Build dynamic query based on provided parameters
    const fields = [];
    const values = [];
    
    if (params.name !== undefined) { fields.push('name = ?'); values.push(params.name); }
    if (params.description !== undefined) { fields.push('description = ?'); values.push(params.description); }
    if (params.maxBetSize !== undefined) { fields.push('maxBetSize = ?'); values.push(params.maxBetSize); }
    if (params.interests !== undefined) { fields.push('interests = ?'); values.push(params.interests); }
    if (params.riskLevel !== undefined) { fields.push('riskLevel = ?'); values.push(params.riskLevel); }
    if (params.conservativeBetSize !== undefined) { fields.push('conservativeBetSize = ?'); values.push(params.conservativeBetSize); }
    if (params.moderateBetSize !== undefined) { fields.push('moderateBetSize = ?'); values.push(params.moderateBetSize); }
    if (params.aggressiveBetSize !== undefined) { fields.push('aggressiveBetSize = ?'); values.push(params.aggressiveBetSize); }
    if (params.principles !== undefined) { fields.push('principles = ?'); values.push(params.principles); }
    if (params.image !== undefined) { fields.push('image = ?'); values.push(params.image); }
    if (params.maxTimelineLimit !== undefined) { fields.push('maxTimelineLimit = ?'); values.push(params.maxTimelineLimit); }
    if (params.category !== undefined) { fields.push('category = ?'); values.push(params.category); }
    if (params.model !== undefined) { fields.push('model = ?'); values.push(params.model); }
    if (params.plugins !== undefined) { fields.push('plugins = ?'); values.push(params.plugins); }
    if (params.is_bet !== undefined) { fields.push('is_bet = ?'); values.push(params.is_bet); }
    if (params.is_onboarded !== undefined) { fields.push('is_onboarded = ?'); values.push(params.is_onboarded); }
    if (params.sport_preference !== undefined) { fields.push('sport_preference = ?'); values.push(params.sport_preference); }
    
    if (fields.length === 0) {
        throw new Error('No fields to update');
    }
    
    values.push(id); // Add user_id for WHERE clause
    
    await db.execute(
        `UPDATE agents SET ${fields.join(', ')} WHERE user_id = ?`,
        values
    );
}

async function getAgents() {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(AgentDB & { username: string } & RowDataPacket)[]>(
        "SELECT agents.*, users.username FROM agents JOIN users ON agents.user_id = users.id"
    );
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
    const [rows] = await db.execute<(RowDataPacket)[]>(`SELECT * FROM bets JOIN predictions ON bets.prediction_id = predictions.id WHERE bets.agent_id = ? AND bets.is_secret = 0 ORDER BY bets.created_at DESC`, [id]);
    return rows;
}

async function getBetHistoryByAgentId(id: number, limit: number, offset: number) {
    const db = await getMySQLConnection();
    const query = `SELECT 
        b.*, 
        p.*,
        b.id as bet_id,
        b.created_at as bet_created_at,
        p.id as prediction_id,
        p.description as prediction_description,
        p.outcome as prediction_outcome,
        p.status as prediction_status,
        p.predicted_outcome as prediction_predicted_outcome,
        p.str_thumb as prediction_str_thumb,
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
    WHERE b.agent_id = ${id} AND b.is_secret = 0
    ORDER BY b.created_at DESC 
    LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await db.execute<(RowDataPacket)[]>(query);

    // Transform the data to match the expected format
    return rows.map(row => ({
        id: row.bet_id,
        user_id: row.user_id,
        prediction_id: row.prediction_id,
        choice: row.choice,
        amount: row.amount,
        created_at: row.bet_created_at,
        reason: row.reason,
        state: row.state,
        winnings: row.winnings,
        pinecone_id: row.pinecone_id,
        prediction: {
            id: row.prediction_id,
            description: row.prediction_description,
            outcome: row.prediction_outcome,
            status: row.prediction_status,
            predicted_outcome: row.prediction_predicted_outcome,
            probability: calculateProbability(row),
            str_thumb: row.prediction_str_thumb
        },
        agent_bets: row.agent_bets ? JSON.parse(`[${row.agent_bets}]`) : []
    }));
}

// Helper function to calculate probability
function calculateProbability(prediction: any): string {
    if (!prediction || (!prediction.yes_amount && !prediction.no_amount)) return '50%';
    
    const yesAmount = prediction.yes_amount || 0;
    const noAmount = prediction.no_amount || 0;
    const total = yesAmount + noAmount;
    
    if (total === 0) return '50%';
    return `${Math.round((yesAmount / total) * 100)}%`;
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
        WHERE predictions.user_id = ? AND predictions.agent_id = 0
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

async function updateAgentNftAddress(agentId: number, nftAddress: string, ipfsHash: string) {
    const db = await getMySQLConnection();
    await db.execute('UPDATE agents SET nft_address = ?, ipfs_hash = ? WHERE id = ?', [nftAddress, ipfsHash, agentId]);
}

async function getPredictionById(id: string) {
    const db = await getMySQLConnection();
    try {
        try {
            const [rows] = await db.execute<(PredictionDB & RowDataPacket)[]>(`
                SELECT 
                    p.*,
                    JSON_ARRAYAGG(
                        IF(b.id IS NOT NULL,
                            JSON_OBJECT(
                                'id', b.id,
                                'amount', COALESCE(b.amount, 0),
                                'choice', COALESCE(b.choice, ''),
                                'reason', COALESCE(b.reason, ''),
                                'pinecone_id', COALESCE(b.pinecone_id, ''),
                                'created_at', DATE_FORMAT(b.created_at, '%Y-%m-%dT%H:%i:%s.000Z')
                            ),
                            NULL
                        )
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

            // Clean up the results by removing null values from bets
            return {
                ...rows[0],
                bets: Array.isArray(rows[0].bets)
                    ? rows[0].bets.filter(Boolean)
                    : []
            };
        } catch (error) {
            console.log(error);
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
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error in getPredictionById for id ${id}:`, error.message);
        }
        throw error;
    }
}

async function getBetById(id: string) {
    try {
        const db = await getMySQLConnection();
        const [rows] = await db.execute<(IBet & RowDataPacket)[]>(
            `SELECT bets.*, 
            predictions.creator_choice, 
            predictions.str_thumb, 
            predictions.outcome, 
            predictions.resolution_date, 
            predictions.predicted_outcome, 
            predictions.source, 
            predictions.description,
            predictions.status
            FROM bets 
            JOIN predictions ON bets.prediction_id = predictions.id 
            WHERE bets.id = ?`,
            [id]);
        return rows[0];
    } catch (error) {
        console.error("Error in getBetById: ", error);
        throw error;
    }
}

async function getPredictionsWithoutAgentId(id: number, page = 1, limit = 50) {
    const db = await getMySQLConnection();
    const offset = (page - 1) * limit;
    
    try {
        // First, get basic predictions with pagination - MUCH faster
        const [rows] = await db.execute<(RowDataPacket)[]>(`
            SELECT 
                predictions.id,
                predictions.description,
                predictions.source,
                predictions.predicted_outcome,
                predictions.creator_choice,
                predictions.status,
                predictions.outcome,
                predictions.resolution_date,
                predictions.str_thumb,
                predictions.created_at,
                predictions.league_id,
                predictions.bet_amount,
                (SELECT COUNT(DISTINCT bets.id) 
                 FROM bets 
                 WHERE bets.prediction_id = predictions.id AND bets.is_secret = 0) as bets_count
            FROM predictions 
            WHERE predictions.agent_id <> ? 
            ORDER BY predictions.created_at DESC
            LIMIT ? OFFSET ?`,
            [id, limit, offset]
        );

        // If no predictions found, return empty array
        if (!rows.length) {
            return { 
                predictions: [], 
                hasMore: false, 
                total: 0, 
                page, 
                limit 
            };
        }

        // Get prediction IDs for batch fetching bets
        const predictionIds = rows.map(row => row.id);
        let betsRows: any[] = [];
        
        // Only fetch bets if we have prediction IDs
        if (predictionIds.length > 0) {
            const placeholders = predictionIds.map(() => '?').join(',');
            const [betsResult] = await db.execute<(RowDataPacket)[]>(`
                SELECT 
                    prediction_id,
                    id,
                    amount,
                    choice,
                    reason,
                    pinecone_id,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') as created_at
                FROM bets 
                WHERE prediction_id IN (${placeholders}) 
                AND is_secret = 0
                ORDER BY created_at DESC`,
                predictionIds
            );
            betsRows = betsResult;
        }

        // Group bets by prediction_id and calculate yes/no amounts
        const betsByPrediction: Record<number, any[]> = {};
        const yesNoAmountsByPrediction: Record<number, { yes_amount: number; no_amount: number }> = {};
        
        betsRows.forEach((bet: any) => {
            if (!betsByPrediction[bet.prediction_id]) {
                betsByPrediction[bet.prediction_id] = [];
                yesNoAmountsByPrediction[bet.prediction_id] = { yes_amount: 0, no_amount: 0 };
            }
            
            betsByPrediction[bet.prediction_id].push({
                id: bet.id,
                amount: bet.amount,
                choice: bet.choice,
                reason: bet.reason,
                pinecone_id: bet.pinecone_id,
                created_at: bet.created_at
            });
            
            // Calculate yes/no amounts from bet data
            if (bet.choice?.toLowerCase() === 'yes') {
                yesNoAmountsByPrediction[bet.prediction_id].yes_amount += parseFloat(bet.amount) || 0;
            } else if (bet.choice?.toLowerCase() === 'no') {
                yesNoAmountsByPrediction[bet.prediction_id].no_amount += parseFloat(bet.amount) || 0;
            }
        });

        // Combine predictions with their bets and calculated amounts
        const enrichedPredictions = rows.map(row => ({
            ...row,
            agent_bets: betsByPrediction[row.id] || [],
            yes_amount: yesNoAmountsByPrediction[row.id]?.yes_amount || 0,
            no_amount: yesNoAmountsByPrediction[row.id]?.no_amount || 0
        }));

        // Check if there are more pages
        const [countResult] = await db.execute<(RowDataPacket)[]>(`
            SELECT COUNT(*) as total 
            FROM predictions 
            WHERE agent_id <> ?`,
            [id]
        );
        
        const total = countResult[0].total;
        const hasMore = offset + limit < total;

        return {
            predictions: enrichedPredictions,
            hasMore,
            total,
            page,
            limit
        };
    } catch (error) {
        console.error('Error in getPredictionsWithoutAgentId:', error);
        // Fallback to simplified query without bets
        try {
            const [rows] = await db.execute<(RowDataPacket)[]>(`
                SELECT 
                    id,
                    description,
                    source,
                    predicted_outcome,
                    creator_choice,
                    status,
                    outcome,
                    resolution_date,
                    str_thumb,
                    created_at,
                    league_id,
                    bet_amount,
                    0 as bets_count
                FROM predictions 
                ORDER BY created_at DESC
                LIMIT ${limit} OFFSET ${offset}`
            );

            return {
                predictions: rows.map(row => ({ 
                    ...row, 
                    agent_bets: [], 
                    yes_amount: 0, 
                    no_amount: 0 
                })),
                hasMore: rows.length === limit,
                total: 0,
                page,
                limit
            };
        } catch (fallbackError) {
            console.error('Error in fallback query:', fallbackError);
            return {
                predictions: [],
                hasMore: false,
                total: 0,
                page,
                limit
            };
        }
    }
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
            agents.nft_address,
            agents.total_winnings,
            COUNT(DISTINCT bets.id) as bets_count,
            SUM(CASE WHEN predictions.outcome = bets.choice AND bets.is_secret = 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN predictions.outcome != bets.choice AND bets.is_secret = 0 AND predictions.status = 'resolved' THEN 1 ELSE 0 END) as losses,
            SUM(CASE WHEN predictions.status != 'resolved' THEN 1 ELSE 0 END) as open,
            (SUM(CASE WHEN predictions.outcome = bets.choice AND bets.is_secret = 0 THEN 1 ELSE 0 END) / 
             NULLIF(SUM(CASE WHEN predictions.status = 'resolved' THEN 1 ELSE 0 END), 0)) as win_rate
        FROM agents 
        JOIN users ON agents.user_id = users.id
        LEFT JOIN bets ON agents.id = bets.agent_id AND bets.is_secret = 0
        LEFT JOIN predictions ON bets.prediction_id = predictions.id
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
            agents.nft_address,
            agents.total_winnings`
    );
    return rows;
}

async function getPredictionTopicConfigs() {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(RowDataPacket & { topic_type: 'category' | 'interest', topic_value: string, is_disabled: boolean })[]>(
        "SELECT topic_type, topic_value, is_disabled FROM prediction_topic_configs"
    );
    return rows;
}

async function upsertPredictionTopicConfig(topic_type: 'category' | 'interest', topic_value: string, is_disabled: boolean) {
    const db = await getMySQLConnection();
    const [existing] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM prediction_topic_configs WHERE topic_type = ? AND topic_value = ?',
        [topic_type, topic_value]
    );

    if (existing.length > 0) {
        await db.execute(
            'UPDATE prediction_topic_configs SET is_disabled = ? WHERE topic_type = ? AND topic_value = ?',
            [is_disabled, topic_type, topic_value]
        );
    } else {
        await db.execute(
            'INSERT INTO prediction_topic_configs (topic_type, topic_value, is_disabled) VALUES (?, ?, ?)',
            [topic_type, topic_value, is_disabled]
        );
    }
}

// New method to delete a user by ID
async function deleteUserById(userId: number): Promise<{ success: boolean, message?: string }> {
    const db = await getMySQLConnection();
    try {
        // Start a transaction to ensure data consistency
        await db.beginTransaction();

        try {
            // Delete associated agents first
            await db.execute('DELETE FROM agents WHERE user_id = ?', [userId]);
            
            // Delete the user
            const [result] = await db.execute<ResultSetHeader>('DELETE FROM users WHERE id = ?', [userId]);
            
            // Commit the transaction
            await db.commit();

            if (result.affectedRows > 0) {
                return { success: true };
            } else {
                return { success: false, message: "User not found or already deleted." };
            }
        } catch (error) {
            // If anything goes wrong, roll back the transaction
            await db.rollback();
            throw error;
        }
    } catch (error: any) {
        console.error(`Error deleting user with ID ${userId}:`, error);
        throw error;
    }
}

async function getAllPredictions(page = 1, limit = 50, source?: string) {
    const db = await getMySQLConnection();
    const offset = (page - 1) * limit;
    
    try {
        // First, let's check the distribution of sources in the database
        const [sourceDistribution] = await db.execute<(RowDataPacket)[]>(`
            SELECT source, COUNT(*) as count
            FROM predictions 
            GROUP BY source
            ORDER BY count DESC`
        );
        
        console.log('📊 Source distribution in database:', sourceDistribution);
        
        // Build WHERE clause for source filtering
        const whereClause = source ? `WHERE source = '${source}'` : '';
        const sourceInfo = source ? `for source: ${source}` : 'for all sources';
        
        console.log(`🎯 Fetching predictions ${sourceInfo}`);
        
        // Get predictions, optionally filtered by source
        const [rows] = await db.execute<(RowDataPacket)[]>(`
            SELECT 
                predictions.id,
                predictions.description,
                predictions.source,
                predictions.predicted_outcome,
                predictions.creator_choice,
                predictions.status,
                predictions.outcome,
                predictions.resolution_date,
                predictions.str_thumb,
                predictions.created_at,
                predictions.league_id,
                predictions.bet_amount,
                (SELECT COUNT(DISTINCT bets.id) 
                 FROM bets 
                 WHERE bets.prediction_id = predictions.id AND bets.is_secret = 0) as bets_count
            FROM predictions 
            ${whereClause}
            ORDER BY predictions.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
        );

        console.log('🔍 Retrieved predictions by source:', {
            total: rows.length,
            requestedSource: source || 'all',
            sources: rows.reduce((acc: any, row: any) => {
                acc[row.source] = (acc[row.source] || 0) + 1;
                return acc;
            }, {}),
            sampleData: rows.slice(0, 5).map((row: any) => ({
                id: row.id,
                source: row.source,
                description: row.description?.substring(0, 50) + '...'
            }))
        });

        // If no predictions found, return empty array
        if (!rows.length) {
            return { 
                predictions: [], 
                hasMore: false, 
                total: 0, 
                page, 
                limit 
            };
        }

        // Get prediction IDs for batch fetching bets
        const predictionIds = rows.map(row => row.id);
        let betsRows: any[] = [];
        
        // Only fetch bets if we have prediction IDs
        if (predictionIds.length > 0) {
            const placeholders = predictionIds.map(() => '?').join(',');
            const [betsResult] = await db.execute<(RowDataPacket)[]>(`
                SELECT 
                    prediction_id,
                    id,
                    amount,
                    choice,
                    reason,
                    pinecone_id,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') as created_at
                FROM bets 
                WHERE prediction_id IN (${placeholders}) 
                AND is_secret = 0
                ORDER BY created_at DESC`,
                predictionIds
            );
            betsRows = betsResult;
        }

        // Group bets by prediction_id and calculate yes/no amounts
        const betsByPrediction: Record<number, any[]> = {};
        const yesNoAmountsByPrediction: Record<number, { yes_amount: number; no_amount: number }> = {};
        
        betsRows.forEach((bet: any) => {
            if (!betsByPrediction[bet.prediction_id]) {
                betsByPrediction[bet.prediction_id] = [];
                yesNoAmountsByPrediction[bet.prediction_id] = { yes_amount: 0, no_amount: 0 };
            }
            
            betsByPrediction[bet.prediction_id].push({
                id: bet.id,
                amount: bet.amount,
                choice: bet.choice,
                reason: bet.reason,
                pinecone_id: bet.pinecone_id,
                created_at: bet.created_at
            });
            
            // Calculate yes/no amounts from bet data
            if (bet.choice?.toLowerCase() === 'yes') {
                yesNoAmountsByPrediction[bet.prediction_id].yes_amount += parseFloat(bet.amount) || 0;
            } else if (bet.choice?.toLowerCase() === 'no') {
                yesNoAmountsByPrediction[bet.prediction_id].no_amount += parseFloat(bet.amount) || 0;
            }
        });

        // Combine predictions with their bets and calculated amounts
        const enrichedPredictions = rows.map(row => ({
            ...row,
            agent_bets: betsByPrediction[row.id] || [],
            yes_amount: yesNoAmountsByPrediction[row.id]?.yes_amount || 0,
            no_amount: yesNoAmountsByPrediction[row.id]?.no_amount || 0
        }));

        // Check if there are more pages - count predictions with same source filter
        const countWhereClause = source ? `WHERE source = '${source}'` : '';
        const [countResult] = await db.execute<(RowDataPacket)[]>(`
            SELECT COUNT(*) as total 
            FROM predictions 
            ${countWhereClause}`
        );
        
        const total = countResult[0].total;
        const hasMore = offset + limit < total;

        console.log('📋 Final getAllPredictions result:', {
            predictionsCount: enrichedPredictions.length,
            requestedSource: source || 'all',
            sourceBreakdown: enrichedPredictions.reduce((acc: any, p: any) => {
                acc[p.source] = (acc[p.source] || 0) + 1;
                return acc;
            }, {}),
            total,
            hasMore,
            page
        });

        return {
            predictions: enrichedPredictions,
            hasMore,
            total,
            page,
            limit
        };
    } catch (error) {
        console.error('Error in getAllPredictions:', error);
        // Fallback to simplified query without bets
        try {
            const whereClause = source ? `WHERE source = '${source}'` : '';
            const [rows] = await db.execute<(RowDataPacket)[]>(`
                SELECT 
                    id,
                    description,
                    source,
                    predicted_outcome,
                    creator_choice,
                    status,
                    outcome,
                    resolution_date,
                    str_thumb,
                    created_at,
                    league_id,
                    bet_amount,
                    0 as bets_count
                FROM predictions 
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT ${limit} OFFSET ${offset}`
            );

            return {
                predictions: rows.map(row => ({ 
                    ...row, 
                    agent_bets: [], 
                    yes_amount: 0, 
                    no_amount: 0 
                })),
                hasMore: rows.length === limit,
                total: 0,
                page,
                limit
            };
        } catch (fallbackError) {
            console.error('Error in fallback query:', fallbackError);
            return {
                predictions: [],
                hasMore: false,
                total: 0,
                page,
                limit
            };
        }
    }
}