export default () => ({
  databaseUrl: process.env.DATABASE_URL,
  daytonaApiUrl: process.env.DAYTONA_API_URL,
  daytonaApiKey: process.env.DAYTONA_API_KEY,
  authSecret: process.env.AUTH_SECRET,
  port: parseInt(process.env.PORT ?? '3001', 10),
});
