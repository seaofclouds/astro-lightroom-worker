import { LightroomClient } from '../lib/lightroom';
import { getAccessToken } from './oauth';
import { OAuthConfig } from './oauth';

export async function handleLightroomRequest(
  request: Request,
  config: OAuthConfig,
  storage: KVNamespace
) {
  try {
    const accessToken = await getAccessToken(storage, config);
    if (!accessToken) {
      return new Response('Unauthorized - No access token', { status: 401 });
    }

    const url = new URL(request.url);
    const accountId = url.searchParams.get('account_id');
    const client = new LightroomClient(accessToken, accountId || undefined);

    const path = url.pathname.replace('/api/lightroom', '');
    const catalogId = url.searchParams.get('catalog_id');
    const albumId = url.searchParams.get('album_id');

    switch (path) {
      case '/accounts':
        const accounts = await client.getAccounts();
        return new Response(JSON.stringify(accounts), {
          headers: { 'Content-Type': 'application/json' },
        });

      case '/catalogs':
        const catalogs = await client.getCatalogs();
        return new Response(JSON.stringify(catalogs), {
          headers: { 'Content-Type': 'application/json' },
        });

      case '/albums':
        if (!catalogId) {
          return new Response('Missing catalog_id parameter', { status: 400 });
        }
        const albums = await client.getAlbums(catalogId);
        return new Response(JSON.stringify(albums), {
          headers: { 'Content-Type': 'application/json' },
        });

      case '/assets':
        if (!catalogId) {
          return new Response('Missing catalog_id parameter', { status: 400 });
        }
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        const assets = await client.getAssets(catalogId, albumId || undefined, {
          limit: limit ? parseInt(limit) : undefined,
          offset: offset ? parseInt(offset) : undefined,
        });
        return new Response(JSON.stringify(assets), {
          headers: { 'Content-Type': 'application/json' },
        });

      case '/upload':
        if (!catalogId) {
          return new Response('Missing catalog_id parameter', { status: 400 });
        }
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) {
          return new Response('Missing or invalid file', { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const asset = await client.uploadAsset(
          catalogId,
          albumId,
          buffer,
          file.name,
          file.type
        );

        return new Response(JSON.stringify(asset), {
          headers: { 'Content-Type': 'application/json' },
        });

      default:
        return new Response('Not found', { status: 404 });
    }
  } catch (error) {
    console.error('Error handling Lightroom request:', error);
    return new Response(`Internal Server Error: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
