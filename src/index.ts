import 'reflect-metadata';
import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import 'express-async-errors';
import { initializeDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { schoolRoutes } from './routes/schools';
import { teacherRoutes } from './routes/teachers';
import { classRoutes } from './routes/classes';
import { adminRoutes } from './routes/admins';
import { gradeGroupRoutes } from './routes/gradeGroups';
import { prizeRoutes } from './routes/prizes';
import { earnedPrizeRoutes } from './routes/earnedPrizes';
import { dashboardRoutes } from './routes/dashboard';
import { createSocketServer } from './socket';
import { setSocketIo } from './socket/emitter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SOCKET_ENABLED = process.env.SOCKET_ENABLED !== '0' && process.env.SOCKET_ENABLED !== 'false';

// Middleware
app.use(cors({
  origin: FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/schools', schoolRoutes);
app.use('/teachers', teacherRoutes);
app.use('/classes', classRoutes);
app.use('/admins', adminRoutes);
app.use('/grade-groups', gradeGroupRoutes);
app.use('/prizes', prizeRoutes);
app.use('/earned-prizes', earnedPrizeRoutes);
app.use('/dashboard', dashboardRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Create HTTP server and attach Socket.io when enabled
const httpServer = http.createServer(app);

if (SOCKET_ENABLED) {
  const io = createSocketServer(httpServer);
  setSocketIo(io);
  app.set('io', io);
}

// Initialize database and start server (0.0.0.0 = listen on all interfaces for LAN/device access)
initializeDatabase()
  .then(() => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📚 API available at http://localhost:${PORT}`);
      if (SOCKET_ENABLED) {
        console.log(`🔌 Real-time socket enabled at ws://localhost:${PORT}`);
      }
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
