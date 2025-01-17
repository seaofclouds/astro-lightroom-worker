import { Hono } from 'hono';
import { LightroomClient } from './lib/adobe-client';

type Bindings = {
  ADOBE_CLIENT_ID: string;
  DEPLOY_HOOK_URL: string;
  PHOTOS_BUCKET?: R2Bucket;
  PHOTO_CACHE?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Health check endpoint
app.get('/', (c) => c.text('Lightroom Worker is running'));

// Test endpoint for Adobe API
app.get('/test/albums', async (c) => {
  try {
    const client = new LightroomClient({
      clientId: c.env.ADOBE_CLIENT_ID,
      // TODO: Implement OAuth flow to get access token
      accessToken: 'test',
    });

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
      const client = new LightroomClient({
        clientId: c.env.ADOBE_CLIENT_ID,
        // TODO: Implement OAuth flow to get access token
        accessToken: 'test',
      });

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
