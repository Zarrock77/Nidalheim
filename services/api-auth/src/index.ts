import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import registerRoute from './routes/register.js';
import loginRoute from './routes/login.js';
import refreshRoute from './routes/refresh.js';
import logoutRoute from './routes/logout.js';
import jwksRoute from './routes/jwks.js';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://www.nidalheim.com,http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.use(registerRoute);
app.use(loginRoute);
app.use(refreshRoute);
app.use(logoutRoute);
app.use(jwksRoute);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nidalheim-auth' });
});

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});

export default app;
