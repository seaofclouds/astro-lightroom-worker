import { Hono } from 'hono';
import { handleOAuthStart, handleOAuthCallback, getAccessToken } from './handlers/oauth';
import { LightroomClient } from './lib/adobe-client';

interface Env {
  ADOBE_AUTH: KVNamespace;
  ADOBE_CREDENTIALS: KVNamespace;
  ADOBE_REDIRECT_URI: string;
  DEPLOY_HOOK_URL: string;
  PHOTOS_BUCKET?: R2Bucket;
  PHOTO_CACHE?: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

async function getAdobeCredentials(env: Env) {
  const [clientId, clientSecret] = await Promise.all([
    env.ADOBE_CREDENTIALS.get('client_id'),
    env.ADOBE_CREDENTIALS.get('client_secret')
  ]);

  console.log('Retrieved credentials:', {
    clientId,
    clientSecret: clientSecret ? '[PRESENT]' : '[MISSING]',
    redirectUri: env.ADOBE_REDIRECT_URI
  });

  if (!clientId || !clientSecret) {
    throw new Error('Adobe credentials not found in KV');
  }

  return {
    clientId,
    clientSecret,
    redirectUri: env.ADOBE_REDIRECT_URI
  };
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
    c.env.ADOBE_CREDENTIALS.put('client_id', clientId),
    c.env.ADOBE_CREDENTIALS.put('client_secret', clientSecret)
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
  return handleOAuthCallback(c.req, config, c.env.ADOBE_AUTH);
});

// Protected endpoints
app.get('/albums', async (c) => {
  const config = await getAdobeCredentials(c.env);
  const accessToken = await getAccessToken(c.env.ADOBE_AUTH, config);

  if (!accessToken) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const client = new LightroomClient(accessToken);
  const albums = await client.getAlbums();
  return c.json(albums);
});

// Test endpoint for Adobe API
app.get('/test/albums', async (c) => {
  try {
    const config = await getAdobeCredentials(c.env);
    const client = new LightroomClient(config.clientId, config.clientSecret, config.redirectUri);

    const albums = await client.getAlbums();
    return c.json(albums);
  } catch (error) {
    console.error('Error fetching albums:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Webhook endpoint for Lightroom events
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received webhook:', body);

    if (body.type === 'asset.created' || body.type === 'asset.updated') {
      const config = await getAdobeCredentials(c.env);
      const client = new LightroomClient(config.clientId, config.clientSecret, config.redirectUri);

      // Fetch asset details
      const asset = await client.getAsset(body.asset.id);
      console.log('Asset details:', asset);

      // TODO: Store asset in R2
      // TODO: Update KV cache
      // TODO: Trigger site rebuild
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
