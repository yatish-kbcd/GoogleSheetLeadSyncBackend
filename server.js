// server.js
import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { testConnection } from './config/database.js';
import leadsRouter from './routes/leads.js';

config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test database connection on startup
testConnection().then(() => {
  console.log('✅ Database connection established');
}).catch(error => {
  console.error('❌ Failed to connect to database:', error);
  process.exit(1);
});

// Routes
app.use('/api/leads', leadsRouter);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { query } = await import('./config/database.js');
    await query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date() 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      database: 'Disconnected',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 MySQL Database: ${process.env.DB_NAME}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`📝 API available at: http://localhost:${PORT}/api`);
});