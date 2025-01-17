const ADOBE_AUTH_URL = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export async function handleOAuthStart(config: OAuthConfig) {
  try {
    const state = crypto.randomUUID();
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'openid,AdobeID,lr_partner_apis',
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
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const error_description = url.searchParams.get('error_description');

  console.log('OAuth callback received:', {
    code: code ? `${code.substring(0, 5)}...` : null,
    state,
    error,
    error_description
  });

  if (error || error_description) {
    console.error('OAuth error:', { error, error_description });
    return new Response(`OAuth error: ${error_description || error}`, { status: 400 });
  }

  if (!code) {
    console.error('Missing authorization code');
    return new Response('Missing authorization code', { status: 400 });
  }

  // URL encode the client secret
  const encodedClientSecret = encodeURIComponent(config.clientSecret);
  console.log('Client secret encoding:', {
    originalLength: config.clientSecret.length,
    encodedLength: encodedClientSecret.length
  });

  const tokenParams = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: encodedClientSecret,
    code,
    redirect_uri: config.redirectUri,
  };

  console.log('Token request:', {
    url: ADOBE_TOKEN_URL,
    clientIdLength: config.clientId.length,
    clientSecretLength: encodedClientSecret.length,
    code: `${code.substring(0, 5)}...`,
    redirectUri: config.redirectUri
  });

  const tokenResponse = await fetch(ADOBE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams(tokenParams),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token exchange failed:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      error: errorText,
      requestParams: {
        ...tokenParams,
        client_secret: '[REDACTED]',
        code: `${code.substring(0, 5)}...`
      }
    });
    return new Response(`Failed to exchange code for token: ${errorText}`, { status: 500 });
  }

  const tokenData = await tokenResponse.json();
  await storage.put('access_token', tokenData.access_token);
  await storage.put('refresh_token', tokenData.refresh_token);

  return Response.redirect('/');
}

export async function getAccessToken(storage: KVNamespace, config: OAuthConfig): Promise<string | null> {
  const accessToken = await storage.get('access_token');
  if (!accessToken) {
    console.log('No access token found');
    return null;
  }
  return accessToken;
}
