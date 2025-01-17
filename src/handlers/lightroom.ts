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
    // Use clientId as API key
    const client = new LightroomClient(accessToken, undefined, config.clientId);
    const path = url.pathname.replace('/api/lightroom', '');

    console.log('Lightroom request:', {
      path,
      accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : null,
      clientId: config.clientId
    });

    // Get account ID first if not provided
    let accountId = url.searchParams.get('account_id');
    if (!accountId && path !== '/accounts') {
      console.log('Fetching account ID...');
      const accounts = await client.getAccounts();
      console.log('Accounts response:', JSON.stringify(accounts, null, 2));
      if (accounts && accounts.length > 0) {
        accountId = accounts[0].id;
        console.log('Using account ID:', accountId);
      } else {
        return new Response('No Lightroom accounts found', { status: 404 });
      }
    }

    // Create new client instance with account ID
    const authenticatedClient = new LightroomClient(accessToken, accountId, config.clientId);

    const catalogId = url.searchParams.get('catalog_id');
    const albumId = url.searchParams.get('album_id');

    switch (path) {
      case '/accounts':
        console.log('Fetching accounts...');
        try {
          const accounts = await client.getAccounts();
          console.log('Accounts response:', JSON.stringify(accounts, null, 2));
          return new Response(JSON.stringify(accounts), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error fetching accounts:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

      case '/catalogs':
        console.log('Fetching catalogs for account:', accountId);
        try {
          const catalogs = await authenticatedClient.getCatalogs();
          console.log('Catalogs response:', JSON.stringify(catalogs, null, 2));
          return new Response(JSON.stringify(catalogs), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error fetching catalogs:', error, {
            accountId,
            accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : null
          });
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

      case '/albums':
        if (!catalogId) {
          return new Response('Missing catalog_id parameter', { status: 400 });
        }
        console.log('Fetching albums for catalog:', catalogId);
        try {
          const albums = await authenticatedClient.getAlbums(catalogId);
          console.log('Albums response:', JSON.stringify(albums, null, 2));
          return new Response(JSON.stringify(albums), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error fetching albums:', error, {
            catalogId,
            accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : null
          });
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

      case '/assets':
        if (!catalogId) {
          return new Response('Missing catalog_id parameter', { status: 400 });
        }
        console.log('Fetching assets for catalog:', catalogId);
        try {
          const limit = url.searchParams.get('limit');
          const offset = url.searchParams.get('offset');
          const assets = await authenticatedClient.getAssets(catalogId, albumId || undefined, {
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
          });
          console.log('Assets response:', JSON.stringify(assets, null, 2));
          return new Response(JSON.stringify(assets), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error fetching assets:', error, {
            catalogId,
            albumId,
            accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : null
          });
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

      case '/upload':
        if (!catalogId) {
          return new Response('Missing catalog_id parameter', { status: 400 });
        }
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }

        console.log('Uploading asset to catalog:', catalogId);
        try {
          const formData = await request.formData();
          const file = formData.get('file');
          if (!file || !(file instanceof File)) {
            return new Response('Missing or invalid file', { status: 400 });
          }

          const buffer = await file.arrayBuffer();
          const asset = await authenticatedClient.uploadAsset(
            catalogId,
            albumId,
            buffer,
            file.name,
            file.type
          );
          console.log('Upload response:', JSON.stringify(asset, null, 2));
          return new Response(JSON.stringify(asset), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error uploading asset:', error, {
            catalogId,
            albumId,
            accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : null
          });
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

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
