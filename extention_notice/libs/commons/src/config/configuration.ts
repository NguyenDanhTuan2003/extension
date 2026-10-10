// configuration.ts
export default () => ({
  port: +(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  servicesPort: {
    noticeService: +(process.env.NOTICE_SERVICE_PORT || 3001),
  },

  database: {
    uri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/extention',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'tuan2003',
    expiresInaccess: +(process.env.JWT_EXPIRES_IN_ACCESS || 3600),
    expiresInrefresh: +(process.env.JWT_EXPIRES_IN_REFRESH || 86400),
  },

  bcrypt: {
    saltRound: +(process.env.ENCODE_PASSWORD || 10),
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: +(process.env.REDIS_PORT || 6379),
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD || '',
    tls: process.env.REDIS_TLS === 'true',
    db: +(process.env.REDIS_DB || 0),
    prefix: process.env.REDIS_KEY_PREFIX || '',
  },

  nats: {
    url: process.env.NATS_URL || 'nats://127.0.0.1:4222',
  },
});
