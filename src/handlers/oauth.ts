const ADOBE_AUTH_URL = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v1';

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
  });

  return Response.redirect(`${ADOBE_AUTH_URL}?${params.toString()}`);
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

  // Log the request we're about to make
  console.log('Exchanging code for token with params:', {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: '[REDACTED]',
    code,
    redirect_uri: config.redirectUri,
  });

  // Exchange code for access token
  const tokenResponse = await fetch(ADOBE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token exchange failed:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      error: errorText
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
