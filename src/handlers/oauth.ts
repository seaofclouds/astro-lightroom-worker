const ADOBE_AUTH_URL = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export async function handleOAuthStart(config: OAuthConfig) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid,AdobeID,lr_partner_apis',
    response_type: 'code',
    state: crypto.randomUUID(),
    prompt: 'login consent',
    locale: 'en_US'
  });

  const authUrl = `${ADOBE_AUTH_URL}?${params.toString()}`;
  console.log('Authorization URL:', authUrl);
  console.log('Config:', { ...config, clientSecret: '[REDACTED]' });

  return Response.redirect(authUrl);
}

export async function handleOAuthCallback(request: Request, config: OAuthConfig, storage: KVNamespace) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const error_description = url.searchParams.get('error_description');

  console.log('OAuth callback params:', { code, state, error, error_description });

  if (error || error_description) {
    console.error('OAuth error:', { error, error_description });
    return new Response(`OAuth error: ${error_description || error}`, { status: 400 });
  }

  if (!code) {
    console.error('Missing authorization code');
    return new Response('Missing authorization code', { status: 400 });
  }

  const tokenParams = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  };

  // Log full request details
  console.log('Token request:', {
    url: ADOBE_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    params: { ...tokenParams, client_secret: '[REDACTED]' }
  });

  // Exchange code for access token
  const tokenResponse = await fetch(ADOBE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(tokenParams),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token exchange failed:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      error: errorText,
      requestParams: { ...tokenParams, client_secret: '[REDACTED]' }
    });
    return new Response(`Failed to exchange code for token: ${errorText}`, { status: 500 });
  }

  const tokens = await tokenResponse.json();
  
  // Store tokens in KV
  await storage.put('adobe_tokens', JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  }));

  return new Response('Authorization successful! You can close this window.');
}

export async function getAccessToken(storage: KVNamespace, config: OAuthConfig): Promise<string | null> {
  const tokensStr = await storage.get('adobe_tokens');
  if (!tokensStr) return null;

  const tokens = JSON.parse(tokensStr);
  const now = Date.now();

  // Check if token is expired or about to expire
  if (tokens.expires_at - now < 5 * 60 * 1000) {
    // Refresh token
    const refreshResponse = await fetch(ADOBE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!refreshResponse.ok) {
      console.error('Token refresh failed');
      return null;
    }

    const newTokens = await refreshResponse.json();
    
    // Update stored tokens
    await storage.put('adobe_tokens', JSON.stringify({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: Date.now() + (newTokens.expires_in * 1000),
    }));

    return newTokens.access_token;
  }

  return tokens.access_token;
}
