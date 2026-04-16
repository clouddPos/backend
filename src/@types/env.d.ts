declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
    DATABASE_URL: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    JWT_REFRESH_SECRET?: string;
    JWT_REFRESH_EXPIRES_IN?: string;
    ALLOWED_FRONTEND_URLS?: string;
    BULLBOARD_ENABLED?: string;
    BULLBOARD_USER?: string;
    BULLBOARD_PASSWORD?: string;
  }
}
