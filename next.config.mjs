/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: false,
    // Prevent webpack from bundling TypeORM — load it natively via Node.js instead
    // This eliminates "Module not found" warnings for optional DB drivers
    serverComponentsExternalPackages: ['typeorm', 'pg'],
  },
  webpack: (config) => {
    // Suppress missing optional TypeORM driver warnings in webpack output
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'react-native-sqlite-storage': false,
      mysql: false,
      mysql2: false,
      'better-sqlite3': false,
      sqlite3: false,
      mssql: false,
      oracledb: false,
      mongodb: false,
      '@sap/hana-client': false,
      '@sap/hana-client/extension/Stream': false,
      ioredis: false,
      redis: false,
      'pg-native': false,
      'pg-query-stream': false,
    };
    return config;
  },
};

export default nextConfig;
