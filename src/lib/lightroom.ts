const LIGHTROOM_API_BASE = 'https://lr.adobe.io';

export interface LightroomAccount {
  id: string;
  name: string;
  type: string;
}

export interface LightroomCatalog {
  id: string;
  name: string;
  created: string;
  updated: string;
}

export interface LightroomAlbum {
  id: string;
  name: string;
  created: string;
  updated: string;
  cover?: {
    id: string;
    height: number;
    width: number;
  };
}

export interface LightroomAsset {
  id: string;
  name: string;
  size: number;
  type: string;
  subtype: string;
  created: string;
  updated: string;
  metadata: {
    dimensions?: {
      height: number;
      width: number;
    };
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

export class LightroomClient {
  constructor(
    private readonly accessToken: string,
    private readonly accountId?: string,
    private readonly apiKey?: string
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    if (!this.apiKey) {
      throw new Error('Adobe API key is required');
    }

    const url = `${LIGHTROOM_API_BASE}${endpoint}`;
    console.log('Making Lightroom API request:', {
      url,
      method: options.method || 'GET',
      hasToken: !!this.accessToken,
      hasApiKey: !!this.apiKey,
      accountId: this.accountId
    });

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add account ID header if available
    if (this.accountId) {
      headers['X-Lightroom-Account-Id'] = this.accountId;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    let responseText = await response.text();
    
    // Remove the while(1){} prefix if it exists
    const whilePrefix = 'while (1) {}';
    if (responseText.startsWith(whilePrefix)) {
      responseText = responseText.substring(whilePrefix.length).trim();
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (error) {
      console.error('Error parsing JSON response:', {
        error,
        responseText,
        url
      });
      throw new Error('Invalid JSON response from Lightroom API');
    }

    if (!response.ok) {
      console.error('Lightroom API error:', {
        status: response.status,
        statusText: response.statusText,
        url,
        response: responseData,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Handle Adobe's error format
      if (responseData.code && responseData.description) {
        throw new Error(`Adobe API Error (${responseData.code}): ${responseData.description}`);
      }

      throw new Error(`Lightroom API error: ${response.status} ${response.statusText}`);
    }

    return responseData;
  }

  async getAccounts(): Promise<LightroomAccount[]> {
    const response = await this.request('/v2/account');
    // The account endpoint returns a single account object, not an array
    return [{
      id: response.id,
      name: response.full_name,
      type: response.type
    }];
  }

  async getCatalogs(): Promise<LightroomCatalog[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get catalogs');
    }

    // Get the catalog (singular since users only have one)
    const response = await this.request('/v2/catalog');
    
    if (!response) {
      console.warn('No catalog found in response:', response);
      return [];
    }

    // Return as array for backwards compatibility
    return [{
      id: response.id,
      name: response.name || 'Lightroom Catalog',
      created: response.created,
      updated: response.updated
    }];
  }

  async getCatalog(catalogId: string): Promise<LightroomCatalog> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get catalog');
    }

    const response = await this.request(`/v2/catalog`);
    return {
      id: response.id,
      name: response.name || 'Lightroom Catalog',
      created: response.created,
      updated: response.updated
    };
  }

  async createCatalog(name: string): Promise<LightroomCatalog> {
    if (!this.accountId) {
      throw new Error('Account ID is required to create catalog');
    }

    const response = await this.request('/v2/catalog', {
      method: 'POST',
      body: JSON.stringify({
        name,
        account_id: this.accountId
      })
    });

    return {
      id: response.id,
      name: response.name || 'Untitled Catalog',
      created: response.created,
      updated: response.updated
    };
  }

  async getAlbums(catalogId: string): Promise<LightroomAlbum[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get albums');
    }

    const response = await this.request(`/v2/catalog/albums`);
    
    if (!response.resources) {
      console.warn('No albums found in catalog:', catalogId);
      return [];
    }

    return response.resources.map((album: any) => ({
      id: album.id,
      name: album.name || 'Untitled Album',
      created: album.created,
      updated: album.updated,
      type: album.subtype
    }));
  }

  async getAssets(
    catalogId: string, 
    albumId?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<LightroomAsset[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get assets');
    }

    let endpoint = `/v2/catalog/assets?account_id=${this.accountId}`;
    if (albumId) {
      endpoint = `/v2/catalog/albums/${albumId}/assets?account_id=${this.accountId}`;
    }

    if (options.limit) {
      endpoint += `&limit=${options.limit}`;
    }
    if (options.offset) {
      endpoint += `&offset=${options.offset}`;
    }

    const response = await this.request(endpoint);
    return response.resources;
  }

  async uploadAsset(
    catalogId: string,
    albumId: string | null,
    file: ArrayBuffer,
    filename: string,
    mimeType: string
  ): Promise<LightroomAsset> {
    if (!this.accountId) {
      throw new Error('Account ID is required to upload assets');
    }

    // Step 1: Generate upload target
    const targetResponse = await this.request(
      `/v2/catalog/assets?account_id=${this.accountId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: {
            name: filename,
            importSource: {
              fileName: filename,
              fileSize: file.byteLength,
              mimeType,
            },
          },
        }),
      }
    );

    // Step 2: Upload the file to the target location
    const uploadUrl = targetResponse.links.upload.href;
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Authorization': `Bearer ${this.accessToken}`,
        'x-api-key': this.apiKey,
      },
      body: file,
    });

    // Step 3: Add to album if specified
    if (albumId) {
      await this.request(
        `/v2/catalog/albums/${albumId}/assets/${targetResponse.asset.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return targetResponse.asset;
  }
}
