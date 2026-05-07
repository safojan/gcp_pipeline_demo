const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 8080;

let dbConn = null;
let dbSecret = null;

// Get database credentials from Secret Manager (injected via --set-secrets)
function getDatabaseSecret() {
  try {
    const secretValue = process.env.DB_SECRET_NAME;
    if (!secretValue) {
      console.log('DB_SECRET_NAME not set, skipping database connection');
      return null;
    }
    return JSON.parse(secretValue);
  } catch (error) {
    console.error('Error parsing secret:', error.message);
    return null;
  }
}

// Initialize database connection
async function initDatabase() {
  dbSecret = getDatabaseSecret();

  if (dbSecret) {
    try {
      dbConn = await mysql.createPool({
        user: dbSecret.username,
        password: dbSecret.password,
        socketPath: '/cloudsql/brandai-36abd:us-central1:gcp-demo-db:us-central1:gcp-demo-db',
        database: dbSecret.database,
        waitForConnections: true,
        connectionLimit: 10,
      });

      // Create table if not exists
      await dbConn.query(`
        CREATE TABLE IF NOT EXISTS visits (
          id INT AUTO_INCREMENT PRIMARY KEY,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          user_agent TEXT
        )
      `);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error.message);
      dbConn = null;
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', async (req, res) => {
  let visitCount = 0;

  if (dbConn) {
    try {
      await dbConn.query(
        'INSERT INTO visits (user_agent) VALUES (?)',
        [req.headers['user-agent']]
      );

      const [rows] = await dbConn.query('SELECT COUNT(*) as count FROM visits');
      visitCount = parseInt(rows[0].count);
    } catch (error) {
      console.error('Database error:', error.message);
    }
  }

  res.json({
    message: 'GCP Pipeline Demo - Running on Cloud Run!',
    services: {
      'Cloud Build': 'Automated CI/CD from GitHub',
      'Cloud Run': 'Serverless container hosting',
      'Cloud SQL': dbConn ? 'Connected ✓' : 'Not configured',
      'Cloud Secrets': dbSecret ? 'Secrets loaded ✓' : 'Not configured',
    },
    visits: visitCount,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
  });
});

// API endpoint to get visit history
app.get('/api/visits', async (req, res) => {
  if (!dbConn) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const [rows] = await dbConn.query(
      'SELECT id, timestamp, user_agent FROM visits ORDER BY timestamp DESC LIMIT 10'
    );
    res.json({ visits: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
async function startServer() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  });
}

startServer();