const fs = require('fs');
const mysql = require('mysql2/promise');
function getEnv(key){
  const text = fs.readFileSync('.env.local','utf8');
  const m = text.match(new RegExp('^'+key+'=(.*)$','m'));
  if(!m) return '';
  return m[1].trim().replace(/^"|"$/g,'');
}
(async()=>{
  const host = getEnv('MYSQL_HOST');
  const port = parseInt(getEnv('MYSQL_PORT')||'3306');
  const user = getEnv('MYSQL_USER');
  const password = getEnv('MYSQL_PASSWORD');
  const database = getEnv('MYSQL_DATABASE');
  if(!host||!user||!database){ throw new Error('Missing MySQL env vars'); }
  const conn = await mysql.createConnection({host, port, user, password, database, multipleStatements:true});
  const sql = `
CREATE TABLE IF NOT EXISTS user_channel_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider ENUM('telegram','discord','sms_twilio','whatsapp','email','web') NOT NULL,
  status ENUM('draft','connected','revoked','error') DEFAULT 'draft',
  encrypted_credentials JSON NULL,
  settings JSON NULL,
  webhook_secret VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_provider (user_id, provider)
);
CREATE TABLE IF NOT EXISTS survey_channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  channel ENUM('telegram','discord','sms','whatsapp','email','web') NOT NULL,
  status ENUM('configured','enabled','paused') DEFAULT 'configured',
  config JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_survey_channel (survey_id, channel),
  INDEX idx_survey_channels_survey (survey_id)
);
CREATE TABLE IF NOT EXISTS survey_channel_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  channel ENUM('telegram','discord','sms','whatsapp') NOT NULL,
  external_user_id VARCHAR(255) NOT NULL,
  username VARCHAR(255) NULL,
  state JSON NULL,
  is_completed TINYINT(1) DEFAULT 0,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_session (survey_id, channel, external_user_id),
  INDEX idx_sessions_survey (survey_id)
);
`;
  await conn.query(sql);
  await conn.end();
  console.log('Channels tables created/ensured.');
})().catch(err=>{ console.error(err); process.exit(1); });
