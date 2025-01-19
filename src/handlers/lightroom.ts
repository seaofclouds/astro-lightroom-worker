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
    const path = url.pathname.replace('/lightroom', '');

    console.log('Lightroom request:', {
      path,
      accessToken: accessToken ? `${accessToken.substring(0, 10)}...` : null,
      clientId: config.clientId
    });

    // Parse path segments
    const segments = path.split('/').filter(s => s);
    
    // Get account ID first if not provided
    let accountId = url.searchParams.get('account_id');
    if (!accountId && segments[0] !== 'account') {
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

    // Handle RESTful paths
    if (segments[0] === 'catalogs') {
      const catalogId = segments[1];
      if (!catalogId) {
        return new Response('Missing catalog ID in path', { status: 400 });
      }

      // Handle /catalogs/{catalog_id}/assets/{asset_id}
      if (segments[2] === 'assets' && segments[3] && !segments[4]) {
        const assetId = segments[3];
        
        try {
          const asset = await authenticatedClient.getAsset(catalogId, assetId);
          return new Response(JSON.stringify(asset), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error fetching asset:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Handle /catalogs/{catalog_id}/assets/{asset_id}/preview
      if (segments[2] === 'assets' && segments[3] && segments[4] === 'preview') {
        const assetId = segments[3];
        const size = url.searchParams.get('size') || '2048';
        
        try {
          console.log(`Fetching preview for asset ${assetId}, size ${size}`);
          const preview = await authenticatedClient.getAssetPreview(catalogId, assetId, size);
          
          // Get the content type from the response
          const contentType = preview.headers.get('content-type');
          console.log('Preview content type:', contentType);

          // If it's JSON, it might be an error response
          if (contentType?.includes('application/json')) {
            const errorText = await preview.text();
            console.error('Preview error:', errorText);
            return new Response(errorText, {
              status: preview.status,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          // Otherwise, stream the image response
          return new Response(preview.body, {
            status: preview.status,
            headers: {
              'Content-Type': contentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000'
            }
          });
        } catch (error) {
          console.error('Error fetching preview:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Handle /catalogs/{catalog_id}/assets/{asset_id}/preview/develop
      if (segments[2] === 'assets' && segments[3] && segments[4] === 'preview' && segments[5] === 'develop') {
        const assetId = segments[3];
        
        try {
          console.log(`Generating preview for asset ${assetId}`);
          const developEndpoint = `/v2/catalogs/${catalogId}/assets/${assetId}/preview/develop?account_id=${authenticatedClient.accountId}`;
          
          const developResponse = await fetch(`${LIGHTROOM_API_BASE}${developEndpoint}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${authenticatedClient.accessToken}`,
              'x-api-key': authenticatedClient.apiKey!,
              'X-Lightroom-Account-Id': authenticatedClient.accountId!,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          });

          if (!developResponse.ok) {
            const errorText = await developResponse.text();
            console.error('Develop error:', errorText);
            return new Response(errorText, {
              status: developResponse.status,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Error generating preview:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Handle /catalogs/{catalog_id}/assets/{asset_id}/renditions/{size}
      if ((segments[2] === 'assets' || segments[2] === 'albums') && segments[3]) {
        let assetId = segments[3];
        
        // If this is an album path, extract the actual asset ID
        if (segments[2] === 'albums') {
          const albumId = segments[3];
          // Check if we have an asset ID in the path
          if (segments[4] === 'assets' && segments[5]) {
            assetId = segments[5];
          } else {
            return new Response('Invalid album asset path', { status: 400 });
          }
        }

        // Handle rendition requests
        if (segments[segments[2] === 'albums' ? 6 : 4] === 'renditions') {
          const size = segments[segments[2] === 'albums' ? 7 : 5] || 'fullsize';
          
          try {
            console.log(`Fetching rendition for asset ${assetId}, size ${size}`);
            const preview = await authenticatedClient.getAssetPreview(catalogId, assetId, size);
            
            // Get the content type from the response
            const contentType = preview.headers.get('content-type');
            console.log('Rendition content type:', contentType);

            // If it's JSON, it might be an error response
            if (contentType?.includes('application/json')) {
              const errorText = await preview.text();
              console.error('Rendition error:', errorText);
              return new Response(errorText, {
                status: preview.status,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            // Otherwise, stream the image response
            return new Response(preview.body, {
              status: preview.status,
              headers: {
                'Content-Type': contentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000'
              }
            });
          } catch (error) {
            console.error('Error fetching rendition:', error);
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // Handle /catalogs/{catalog_id}/albums
      if (segments[2] === 'albums') {
        const albumId = segments[3];
        
        if (albumId) {
          // Handle /catalogs/{catalog_id}/albums/{album_id}
          try {
            const assets = await authenticatedClient.getAssets(catalogId, albumId);
            return new Response(JSON.stringify(assets), {
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (error) {
            console.error('Error fetching album assets:', error);
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } else {
          // Handle /catalogs/{catalog_id}/albums
          try {
            const albums = await authenticatedClient.getAlbums(catalogId);
            return new Response(JSON.stringify(albums), {
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (error) {
            console.error('Error fetching albums:', error);
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // Handle /catalogs/{catalog_id}/assets
      if (segments[2] === 'assets') {
        try {
          const limit = url.searchParams.get('limit');
          const offset = url.searchParams.get('offset');
          const assets = await authenticatedClient.getAssets(catalogId, undefined, {
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
          });
          return new Response(JSON.stringify(assets), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('Error fetching catalog assets:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Handle /catalogs/{catalog_id}
      try {
        const catalog = await authenticatedClient.getCatalog(catalogId);
        return new Response(JSON.stringify(catalog), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error fetching catalog:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle /account endpoint
    if (segments[0] === 'account') {
      try {
        const accounts = await client.getAccounts();
        return new Response(JSON.stringify(accounts[0]), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error fetching account:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  } catch (error) {
    console.error('Error handling Lightroom request:', error);
    return new Response(`Internal Server Error: ${error.message}`, {
      status: 500,
    });
  }
}
