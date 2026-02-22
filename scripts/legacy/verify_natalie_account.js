require('dotenv').config({ path: '.env 2' });
const mysql = require('mysql2/promise');

async function verifyNatalieAccount() {
    const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT || 25060,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Verifying Natalie\'s account...\n');
        
        const email = 'natalie.pangburn@gmail.com';
        
        // Search for the account
        const [result] = await connection.execute(
            'SELECT * FROM users WHERE email = ?', 
            [email]
        );

        if (result.length > 0) {
            const user = result[0];
            console.log('✅ ACCOUNT FOUND AND VERIFIED!');
            console.log('='.repeat(50));
            console.log(`   🆔 User ID: ${user.id}`);
            console.log(`   📧 Email: ${user.email}`);
            console.log(`   👤 Display Name: ${user.display_name}`);
            console.log(`   👤 Username: ${user.username || 'null'}`);
            console.log(`   🛡️ Role: ${user.role}`);
            console.log(`   ✅ Verified: ${user.is_verified ? 'Yes' : 'No'}`);
            console.log(`   🔐 First Login Required: ${user.is_first_login ? 'Yes' : 'No'}`);
            console.log(`   💰 Wallet Balance: ${user.wallet_balance}`);
            console.log(`   🏆 Total Winnings: ${user.total_winnings}`);
            console.log(`   💳 Escrow Balance: ${user.escrow_balance}`);
            console.log(`   🔒 Password Hash: ${user.password ? 'Set ✓' : 'Not set ✗'}`);
            console.log('='.repeat(50));
            
            // Check account status
            console.log('\n📋 Account Status Summary:');
            if (user.is_verified && !user.is_first_login && user.password) {
                console.log('🟢 READY TO LOGIN - Account is fully set up');
                console.log('   ✓ Email verified');
                console.log('   ✓ Password set');
                console.log('   ✓ Profile complete');
                console.log('   ✓ No setup required');
            } else {
                console.log('🟡 SETUP NEEDED:');
                if (!user.is_verified) console.log('   ⚠️  Email not verified');
                if (user.is_first_login) console.log('   ⚠️  First-time setup required');
                if (!user.password) console.log('   ⚠️  Password not set');
            }

        } else {
            console.log('❌ ACCOUNT NOT FOUND');
            console.log('   The account does not exist in the database.');
            
            // Check if there are any similar accounts
            const [similarAccounts] = await connection.execute(
                'SELECT email, display_name FROM users WHERE email LIKE ? OR display_name LIKE ?',
                ['%natalie%', '%natalie%']
            );
            
            if (similarAccounts.length > 0) {
                console.log('\n🔍 Similar accounts found:');
                similarAccounts.forEach(acc => {
                    console.log(`   - ${acc.display_name} (${acc.email})`);
                });
            }
        }

        // Show latest registrations for context
        console.log('\n📊 Latest 3 user registrations:');
        const [latest] = await connection.execute(
            'SELECT id, email, display_name FROM users ORDER BY id DESC LIMIT 3'
        );
        
        latest.forEach((user, index) => {
            const isNatalie = user.email === email;
            console.log(`${index + 1}. ID: ${user.id} - ${user.display_name} (${user.email})${isNatalie ? ' ← NATALIE' : ''}`);
        });

        // Total user count
        const [count] = await connection.execute('SELECT COUNT(*) as total FROM users');
        console.log(`\n📈 Total users in production: ${count[0].total}`);

    } catch (error) {
        console.error('❌ Error verifying account:', error.message);
    } finally {
        await connection.end();
    }
}

verifyNatalieAccount(); 