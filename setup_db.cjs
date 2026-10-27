const pool = require('./server/db');
async function create() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(36) PRIMARY KEY,
      sender_id VARCHAR(36) NOT NULL,
      receiver_id VARCHAR(36) NOT NULL,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES user_profiles(id) ON DELETE CASCADE
    )`);
    console.log('✅ messages table created');
    
    // Check for backup columns
    const [columns] = await pool.query('SHOW COLUMNS FROM company_settings');
    const columnNames = columns.map(c => c.Field);
    if (!columnNames.includes('backup_day')) {
      await pool.query('ALTER TABLE company_settings ADD COLUMN backup_day VARCHAR(20) DEFAULT "Daily"');
      await pool.query('ALTER TABLE company_settings ADD COLUMN backup_time VARCHAR(10) DEFAULT "02:00"');
      console.log('✅ backup columns added to company_settings');
    } else {
      console.log('✅ backup columns already exist');
    }
  } catch (err) {
    console.error('❌ Database setup error:', err.message);
  } finally {
    process.exit();
  }
}
create();
