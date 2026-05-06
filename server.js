const express = require('express');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

let dbPool = null;
let dbSecret = null;

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

// Get database credentials from Secret Manager
async function getDatabaseSecret() {
  try {
    const secretName = process.env.DB_SECRET_NAME;
    if (!secretName) {
      console.log('DB_SECRET_NAME not set, skipping database connection');
      return null;
    }

    const [version] = await secretClient.accessSecretVersion({ name: secretName });
    const secretPayload = version.payload.data.toString('utf8');
    return JSON.parse(secretPayload);
  } catch (error) {
    console.error('Error accessing secret:', error.message);
    return null;
  }
}

// Initialize database connection
async function initDatabase() {
  dbSecret = await getDatabaseSecret();
  
  if (dbSecret) {
    dbPool = new Pool({
      user: dbSecret.username,
      password: dbSecret.password,
      host: process.env.DB_HOST || '/cloudsql/' + "699656816818:us-central1:gcp-demo-db",
      database: dbSecret.database,
      port: dbSecret.port || 5432,
    });

    // Create table if not exists
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS visits (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_agent TEXT
        )
      `);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error.message);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy version 1', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', async (req, res) => {
  let visitCount = 0;
  
  if (dbPool) {
    try {
      // Record visit
      await dbPool.query(
        'INSERT INTO visits (user_agent) VALUES ($1)',
        [req.headers['user-agent']]
      );
      
      // Get total visits
      const result = await dbPool.query('SELECT COUNT(*) as count FROM visits');
      visitCount = parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Database error:', error.message);
    }
  }

  res.json({
    message: 'GCP Pipeline Demo - Running on Cloud Run!',
    services: {
      'Cloud Build': 'Automated CI/CD from GitHub',
      'Cloud Run': 'Serverless container hosting',
      'Cloud SQL': dbPool ? 'Connected ✓' : 'Not configured',
      'Cloud Secrets': dbSecret ? 'Secrets loaded ✓' : 'Not configured'
    },
    visits: visitCount,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });
});

// API endpoint to get visit history
app.get('/api/visits', async (req, res) => {
  if (!dbPool) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const result = await dbPool.query(
      'SELECT id, timestamp, user_agent FROM visits ORDER BY timestamp DESC LIMIT 10'
    );
    res.json({ visits: result.rows });
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
