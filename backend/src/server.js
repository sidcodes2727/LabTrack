import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import authRoutes from './routes/authRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { initSocket } from './services/socket.js';

const app = express();
const port = process.env.PORT || 4000;
const server = http.createServer(app);

app.use(
  // Use FRONTEND_URL environment variable for CORS in production
  // Set FRONTEND_URL in your .env file (e.g., FRONTEND_URL=https://your-frontend.com)
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'LabTrack API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

initSocket(server);

server.listen(port, () => {
  console.log(`LabTrack backend listening on port ${port}`);
});
