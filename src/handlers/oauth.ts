const ADOBE_AUTH_URL = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function handleOAuthStart(config: OAuthConfig) {
  try {
    const state = crypto.randomUUID();
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'offline_access,lr_partner_apis,openid,AdobeID,lr_partner_rendition_apis',
      response_type: 'code',
      state,
      prompt: 'login consent',
      locale: 'en_US'
    });

    const authUrl = `${ADOBE_AUTH_URL}?${params.toString()}`;
    console.log('Starting OAuth flow:', {
      authUrl,
      clientIdLength: config.clientId.length,
      redirectUri: config.redirectUri,
      state
    });

    return Response.redirect(authUrl);
  } catch (error) {
    console.error('Error in handleOAuthStart:', error);
    return new Response(`Internal Server Error: ${error.message}`, { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

export async function handleOAuthCallback(request: Request, config: OAuthConfig, storage: KVNamespace) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const error_description = url.searchParams.get('error_description');

    if (error || error_description) {
      console.error('OAuth error:', { error, error_description });
      return new Response(`OAuth error: ${error_description || error}`, { status: 400 });
    }

    if (!code) {
      console.error('Missing authorization code');
      return new Response('Missing authorization code', { status: 400 });
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: config.redirectUri
    });

    const tokenResponse = await fetch(ADOBE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(`Failed to exchange code for token: ${errorText}`, { status: 500 });
    }

    const tokens: TokenResponse = await tokenResponse.json();
    
    // Store both access token and refresh token
    await storage.put('access_token', tokens.access_token);
    await storage.put('refresh_token', tokens.refresh_token);
    await storage.put('token_expires_at', (Date.now() + tokens.expires_in * 1000).toString());

    return new Response('Authentication successful!', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('Error in handleOAuthCallback:', error);
    return new Response(`Internal Server Error: ${error.message}`, { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

export async function getAccessToken(storage: KVNamespace, config: OAuthConfig): Promise<string | null> {
  try {
    const accessToken = await storage.get('access_token');
    const expiresAt = await storage.get('token_expires_at');
    const refreshToken = await storage.get('refresh_token');

    if (!accessToken || !expiresAt || !refreshToken) {
      console.log('Missing token information');
      return null;
    }

    // Check if token is expired or about to expire (5 minutes buffer)
    if (Date.now() > parseInt(expiresAt) - 5 * 60 * 1000) {
      console.log('Token expired or about to expire, refreshing...');
      
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken
      });

      const response = await fetch(ADOBE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        console.error('Failed to refresh token');
        return null;
      }

      const tokens: TokenResponse = await response.json();
      
      // Store new tokens
      await storage.put('access_token', tokens.access_token);
      await storage.put('refresh_token', tokens.refresh_token);
      await storage.put('token_expires_at', (Date.now() + tokens.expires_in * 1000).toString());

      return tokens.access_token;
    }

    return accessToken;
  } catch (error) {
    console.error('Error in getAccessToken:', error);
    return null;
  }
}

export async function clearAccessToken(storage: KVNamespace): Promise<void> {
  console.log('Clearing OAuth tokens...');
  await storage.delete('access_token');
  await storage.delete('refresh_token');
  await storage.delete('token_expires_at');
}
