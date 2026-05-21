const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Route imports
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const postsRoutes = require('./routes/posts.routes');
const mediaRoutes = require('./routes/media.routes');
const calendarRoutes = require('./routes/calendar.routes');
const socialRoutes = require('./routes/social.routes');
const commentsRoutes = require('./routes/comments.routes');
const teamsRoutes = require('./routes/teams.routes');
const clientsRoutes = require('./routes/clients.routes');
const activityRoutes = require('./routes/activity.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const adsRoutes = require('./routes/ads.routes');
const dashboardsRoutes = require('./routes/dashboards.routes');
const engageRoutes = require('./routes/engage.routes');
const diagnoseRoutes = require('./routes/diagnose.routes');

const app = express();

// Health check — above all middleware so it always responds, even if DB is down
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Security & parsing — but skip helmet on /uploads so Meta's image fetchers
// don't choke on CSP / X-Frame-Options / nosniff combos. Static media is
// public anyway, no security benefit to wrapping it in a strict CSP.
app.use((req, res, next) => {
  if (req.path.startsWith('/uploads/')) return next();
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })(req, res, next);
});

// CORS: allow configured client origins plus any *.vercel.app preview URLs
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // non-browser / server-to-server
    if (env.clientOrigins.includes(origin)) return cb(null, true);
    if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy (Railway, Vercel, Cloudflare, etc. sit in front of the app)
app.set('trust proxy', 1);

// Static files (uploaded media). Explicit headers + long cache so Meta's
// CDN-style fetcher gets a stable, CDN-friendly response.
app.use('/uploads', (req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  next();
}, express.static(path.join(__dirname, '../uploads'), {
  fallthrough: false,
  etag: true,
  lastModified: true,
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/dashboards', dashboardsRoutes);
app.use('/api/engage', engageRoutes);
app.use('/api/diagnose', diagnoseRoutes);

// Error handler
app.use(errorHandler);

module.exports = app;
