import bcrypt from "bcryptjs";
import { openSql as getMySQLConnection } from "./db";
import { generateConfirmationToken } from "../api/token";
import { AGENT_RISK_LEVEL } from "../const";
import { IFormDataAgentProfile } from "../interface";
import { UserDB, AgentDB, PaymentIntentDB } from "../interface";
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const UserRepo = {
    insertConversation,
    authenticate,
    registerPassword,
    verifyAccount,
    getUserById,
    getUserByUsername,
    getUserByEmail,
    updateUserDisplayName,
    getAgentByUserId,
    getAgentById,
    createAgent,
    updateAgent,
    getAgents,
    createPaymentIntent,
    getPaymentIntent,
    updatePaymentIntent,
    updateAgentBalance,
    updateAgentNftAddress,
    changePassword,
    updatePassword,
    updateUserBalance,
    createAgentJoinAction,
    updateAgentTraining,
    getPlatformAccountByUserId,
    connectTelegram,
    deleteUserById,
    getAllUsersBasic,
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

async function authenticate({ email, password }: { email: string, password: string }) {
    const pool = await getMySQLConnection();
    try {
        console.log('Getting user by email:', email);
        const [rows] = await pool.execute<(UserDB & RowDataPacket)[]>(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        const user = rows[0];

        if (!user) {
            throw new Error('Email not found');
        }

        if (!bcrypt.compareSync(password, user.password)) {
            throw new Error('Password is incorrect');
        }

        if (user.is_verified == 0) {
            throw new Error('User is not verified yet. Please check your email for the confirmation link.');
        }

        const token = await generateConfirmationToken(user.id.toString(), user.role);

        return {
            user: user,
            token
        }
    } catch (error) {
        console.error('Auth error:', error);
        throw error;
    }
}

async function registerPassword({ email, password, displayName }: { email: string, password: string, displayName: string }) {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(UserDB & RowDataPacket)[]>('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (user) {
        throw new Error('Email "' + email + '" is already registered.');
    }

    if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.execute(
        'INSERT INTO users (email, display_name, password, is_verified, is_first_login) VALUES (?, ?, ?, 1, 0)', 
        [email, displayName, hashedPassword]
    );
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

async function getUserByEmail(email: string) {
    const db = await getMySQLConnection();
    try {
        const [userRows] = await db.execute<(UserDB & RowDataPacket)[]>(
            'SELECT * FROM users WHERE email = ?',
            [email]
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
    } catch (error) {
        console.error('Error in getUserByEmail:', error);
        throw error;
    }
}

async function updateUserDisplayName(userId: number, displayName: string) {
    const db = await getMySQLConnection();
    await db.execute(
        'UPDATE users SET display_name = ?, is_first_login = 0 WHERE id = ?',
        [displayName, userId]
    );
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
            agents.interests,
            agents.riskLevel,
            agents.principles,
            agents.image,
            agents.maxTimelineLimit,
            agents.category,
            agents.model,
            agents.plugins,
            agents.nft_address,
            agents.ipfs_hash,
            agents.trainCount,
            agents.train_index`,
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
    const defaultAvatar = "https://api.dicebear.com/7.x/bottts/svg?seed=agent" + id;
    const defaultName = "My Agent";
    
    await db.execute(
        'INSERT INTO agents (user_id, riskLevel, image, name, is_onboarded, description, interests, principles, maxTimelineLimit, category, model, plugins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [Number(id), AGENT_RISK_LEVEL[0], defaultAvatar, defaultName, 0, '', '', '', 30, 'General', 'gpt-4o', '']
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
    if (params.interests !== undefined) { fields.push('interests = ?'); values.push(params.interests); }
    if (params.riskLevel !== undefined) { fields.push('riskLevel = ?'); values.push(params.riskLevel); }
    if (params.principles !== undefined) { fields.push('principles = ?'); values.push(params.principles); }
    if (params.image !== undefined) { fields.push('image = ?'); values.push(params.image); }
    if (params.maxTimelineLimit !== undefined) { fields.push('maxTimelineLimit = ?'); values.push(params.maxTimelineLimit); }
    if (params.category !== undefined) { fields.push('category = ?'); values.push(params.category); }
    if (params.model !== undefined) { fields.push('model = ?'); values.push(params.model); }
    if (params.plugins !== undefined) { fields.push('plugins = ?'); values.push(params.plugins); }
    if (params.is_onboarded !== undefined) { fields.push('is_onboarded = ?'); values.push(params.is_onboarded); }
    
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

// Basic user listing for admin views
async function getAllUsersBasic(): Promise<Array<Pick<UserDB, 'id' | 'email' | 'display_name' | 'role'>>> {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<(UserDB & RowDataPacket)[]>(
        'SELECT id, email, display_name, role FROM users ORDER BY id DESC'
    );
    return rows as any;
}

// Delete a user by ID
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
