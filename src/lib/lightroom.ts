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
    private readonly accountId?: string
  ) {}

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${LIGHTROOM_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'x-api-key': process.env.ADOBE_API_KEY!,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Lightroom API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getAccounts(): Promise<LightroomAccount[]> {
    const response = await this.request('/v2/account');
    return response.accounts;
  }

  async getCatalogs(): Promise<LightroomCatalog[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get catalogs');
    }
    const response = await this.request(`/v2/catalogs?account_id=${this.accountId}`);
    return response.resources;
  }

  async getAlbums(catalogId: string): Promise<LightroomAlbum[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get albums');
    }
    const response = await this.request(
      `/v2/catalogs/${catalogId}/albums?account_id=${this.accountId}`
    );
    return response.resources;
  }

  async getAssets(
    catalogId: string, 
    albumId?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<LightroomAsset[]> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get assets');
    }

    let endpoint = `/v2/catalogs/${catalogId}/assets?account_id=${this.accountId}`;
    if (albumId) {
      endpoint = `/v2/catalogs/${catalogId}/albums/${albumId}/assets?account_id=${this.accountId}`;
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
      `/v2/catalogs/${catalogId}/assets?account_id=${this.accountId}`,
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
        'x-api-key': process.env.ADOBE_API_KEY!,
      },
      body: file,
    });

    // Step 3: Add to album if specified
    if (albumId) {
      await this.request(
        `/v2/catalogs/${catalogId}/albums/${albumId}/assets/${targetResponse.asset.id}`,
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
