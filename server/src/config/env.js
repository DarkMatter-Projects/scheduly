require('dotenv').config();

// Railway & Render expose MySQL creds differently depending on the provider.
// We support both plain DB_* vars and Railway's MYSQL_* / MYSQLHOST style,
// plus a single DATABASE_URL (mysql://user:pass@host:port/db) fallback.
function resolveDbConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (url) {
    try {
      const u = new URL(url);
      return {
        host: u.hostname,
        port: parseInt(u.port, 10) || 3306,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
      };
    } catch (e) {
      // fall through to individual vars
    }
  }
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASS || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'dmm_scheduly',
  };
}

// Parse comma-separated list of allowed origins. Falls back to the single CLIENT_URL.
function resolveClientOrigins() {
  const list = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173';
  return list.split(',').map(s => s.trim()).filter(Boolean);
}

const env = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: resolveDbConfig(),
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  facebook: {
    appId: process.env.FB_APP_ID,
    appSecret: process.env.FB_APP_SECRET,
    redirectUri: process.env.FB_REDIRECT_URI,
  },
  instagram: {
    appId: process.env.IG_APP_ID || process.env.FB_APP_ID,
    appSecret: process.env.IG_APP_SECRET || process.env.FB_APP_SECRET,
    redirectUri: process.env.IG_REDIRECT_URI || 'http://localhost:3001/api/social/auth/instagram/callback',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/social/auth/google/callback',
    adsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    // Optional MCC login customer (digits only, no dashes). Used when the
    // OAuth user is a Google Ads manager that owns multiple sub-accounts.
    adsLoginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  },
  serverUrl: process.env.SERVER_URL || 'http://localhost:3001',
  encryptionKey: process.env.ENCRYPTION_KEY,
  igPublicBaseUrl: process.env.IG_PUBLIC_BASE_URL || '',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 104857600,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  clientOrigins: resolveClientOrigins(),
};

module.exports = env;
