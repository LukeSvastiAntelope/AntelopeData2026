const dotenv = require('dotenv')
dotenv.config()

async function main() {
  const email = process.argv[2]
  const password = process.argv[3]
  if (!email || !password) {
    console.error('Usage: node scripts/test-login.js <email> <password>')
    process.exit(1)
  }

  const { UserRepo } = await import('../src/app/utils/database/user-repo.ts')
  const bcrypt = (await import('bcryptjs')).default

  try {
    const user = await UserRepo.getUserByEmail(email)
    if (!user) {
      console.log(JSON.stringify({ ok: false, reason: 'email_not_found' }))
      return
    }
    const match = bcrypt.compareSync(password, user.password)
    const isVerified = user.is_verified === 1 || user.is_verified === true
    console.log(JSON.stringify({ ok: match && isVerified, match, isVerified, id: user.id }))
  } catch (e) {
    console.error('error', e)
    process.exit(2)
  }
}

main()






