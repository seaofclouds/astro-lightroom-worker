import { Hono } from 'hono';
import { handleOAuthStart, handleOAuthCallback, getAccessToken } from './handlers/oauth';
import { handleLightroomRequest } from './handlers/lightroom';

interface Env {
  'lightroom-worker-ADOBE_OAUTH_TOKENS': KVNamespace;
  'lightroom-worker-ADOBE_API_CREDENTIALS': KVNamespace;
  ADOBE_REDIRECT_URI: string;
  ADOBE_API_KEY: string;
  DEPLOY_HOOK_URL: string;
  PHOTOS_BUCKET?: R2Bucket;
  PHOTO_CACHE?: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

async function getAdobeCredentials(env: Env) {
  try {
    const [clientId, clientSecret] = await Promise.all([
      env['lightroom-worker-ADOBE_API_CREDENTIALS'].get('client_id'),
      env['lightroom-worker-ADOBE_API_CREDENTIALS'].get('client_secret')
    ]);

    if (!clientId || !clientSecret) {
      throw new Error('Adobe credentials not found in KV');
    }

    return {
      clientId,
      clientSecret,
      redirectUri: env.ADOBE_REDIRECT_URI
    };
  } catch (error) {
    console.error('Error retrieving credentials:', error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (c) => c.text('OK'));

// Admin endpoint to set credentials
app.post('/admin/credentials', async (c) => {
  const { clientId, clientSecret } = await c.req.json();
  
  if (!clientId || !clientSecret) {
    return c.json({ error: 'Missing credentials' }, 400);
  }

  await Promise.all([
    c.env['lightroom-worker-ADOBE_API_CREDENTIALS'].put('client_id', clientId),
    c.env['lightroom-worker-ADOBE_API_CREDENTIALS'].put('client_secret', clientSecret)
  ]);

  return c.json({ message: 'Credentials updated successfully' });
});

// OAuth endpoints
app.get('/auth/start', async (c) => {
  const config = await getAdobeCredentials(c.env);
  return handleOAuthStart(config);
});

app.get('/auth/callback', async (c) => {
  const config = await getAdobeCredentials(c.env);
  return handleOAuthCallback(c.req, config, c.env['lightroom-worker-ADOBE_OAUTH_TOKENS']);
});

// Lightroom API endpoints
app.all('/api/lightroom/*', async (c) => {
  const config = await getAdobeCredentials(c.env);
  if (!c.env.ADOBE_API_KEY) {
    return new Response('Adobe API key not configured', { status: 500 });
  }
  return handleLightroomRequest(
    c.req,
    { ...config, ADOBE_API_KEY: c.env.ADOBE_API_KEY },
    c.env['lightroom-worker-ADOBE_OAUTH_TOKENS']
  );
});

export default app;
