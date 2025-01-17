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
  renditions?: {
    thumbnail2x?: string;
    fullsize?: string;
    "2048"?: string;
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

    const response = await this.request(`/v2/catalogs/${catalogId}/albums`);
    
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

    let endpoint = `/v2/catalogs/${catalogId}/assets`;
    if (albumId) {
      endpoint = `/v2/catalogs/${catalogId}/albums/${albumId}/assets`;
    }

    // Add account_id as a query parameter
    endpoint += `?account_id=${this.accountId}`;

    if (options.limit) {
      endpoint += `&limit=${options.limit}`;
    }
    if (options.offset) {
      endpoint += `&offset=${options.offset}`;
    }

    console.log('Making request to:', endpoint);
    const response = await this.request(endpoint);
    console.log('Raw Adobe API response:', JSON.stringify(response, null, 2));
    
    if (!response.resources) {
      console.warn('No assets found');
      return [];
    }

    // Check if we have the expected links structure
    if (response.resources[0]) {
      console.log('First asset _links:', JSON.stringify(response.resources[0]._links, null, 2));
      console.log('First asset full structure:', JSON.stringify(response.resources[0], null, 2));
    }

    return response.resources.map((asset: any) => {
      const assetBase = {
        id: asset.id,
        created: asset.created,
        updated: asset.updated,
        subtype: asset.subtype || 'image',
        name: asset.payload?.importSource?.fileName || asset.payload?.name || asset.name || 'Untitled Asset',
        size: asset.payload?.importSource?.fileSize || asset.payload?.fileSize || 0,
        type: asset.payload?.importSource?.mimeType || asset.payload?.type || 'image/jpeg',
        metadata: {
          dimensions: asset.payload?.develop?.croppedDimensions || {
            width: asset.payload?.width || 0,
            height: asset.payload?.height || 0
          },
          location: asset.payload?.develop?.userMetadata?.location || asset.payload?.location
        }
      };

      // Add rendition URLs if we have _links
      if (asset._links) {
        const renditions: Record<string, string> = {};
        const renditionBase = `/api/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions`;
        
        // Add standard rendition sizes
        renditions['thumbnail2x'] = `${renditionBase}/thumbnail2x`;
        renditions['2048'] = `${renditionBase}/2048`;

        // Find the largest available rendition for fullsize
        const sizeKeys = Object.keys(asset._links).filter(key => /^\d+$/.test(key));
        if (sizeKeys.length > 0) {
          const maxSize = Math.max(...sizeKeys.map(k => parseInt(k)));
          renditions['fullsize'] = `${renditionBase}/${maxSize}`;
        }

        return {
          ...assetBase,
          renditions
        };
      }

      return assetBase;
    });
  }

  async getAsset(
    catalogId: string,
    assetId: string
  ): Promise<LightroomAsset> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get asset');
    }

    const endpoint = `/v2/catalogs/${catalogId}/assets/${assetId}?account_id=${this.accountId}`;
    console.log('Getting single asset from:', endpoint);
    
    const response = await this.request(endpoint);
    console.log('Single asset response:', JSON.stringify(response, null, 2));

    if (!response) {
      throw new Error('Asset not found');
    }

    const asset = response;
    return {
      id: asset.id,
      created: asset.created,
      updated: asset.updated,
      subtype: asset.subtype || 'image',
      name: asset.payload?.importSource?.fileName || asset.payload?.name || asset.name || 'Untitled Asset',
      size: asset.payload?.importSource?.fileSize || asset.payload?.fileSize || 0,
      type: asset.payload?.importSource?.mimeType || asset.payload?.type || 'image/jpeg',
      metadata: {
        dimensions: asset.payload?.develop?.croppedDimensions || {
          width: asset.payload?.width || 0,
          height: asset.payload?.height || 0
        },
        location: asset.payload?.develop?.userMetadata?.location || asset.payload?.location
      },
      // Always include rendition URLs for single asset view
      renditions: {
        thumbnail2x: `/api/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions/thumbnail2x`,
        '2048': `/api/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions/2048`,
        fullsize: `/api/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions/2048`
      }
    };
  }

  async getAssetPreview(
    catalogId: string,
    assetId: string,
    size: '2048' | 'thumbnail2x' | string
  ): Promise<Response> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get asset previews');
    }

    // First get the asset details
    const assetEndpoint = `/v2/catalogs/${catalogId}/assets/${assetId}?account_id=${this.accountId}`;
    console.log('Getting asset details from:', assetEndpoint);
    
    const assetResponse = await this.request(assetEndpoint);
    console.log('Asset response:', JSON.stringify(assetResponse, null, 2));

    // Use previews endpoint instead of renditions
    const previewEndpoint = `/v2/catalogs/${catalogId}/assets/${assetId}/previews/${size}?account_id=${this.accountId}`;
    console.log('Getting preview from:', previewEndpoint);

    try {
      const previewResponse = await fetch(`${LIGHTROOM_API_BASE}${previewEndpoint}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'x-api-key': this.apiKey!,
          'X-Lightroom-Account-Id': this.accountId,
          'Accept': 'image/*'
        }
      });

      if (!previewResponse.ok) {
        // If preview doesn't exist, try to create it
        console.log('Preview GET failed, trying POST');
        const createPreviewResponse = await fetch(`${LIGHTROOM_API_BASE}${previewEndpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'x-api-key': this.apiKey!,
            'X-Lightroom-Account-Id': this.accountId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });

        if (!createPreviewResponse.ok) {
          throw new Error(`Failed to create preview: ${createPreviewResponse.status} ${createPreviewResponse.statusText}`);
        }

        // After creating, try to get it again
        return await fetch(`${LIGHTROOM_API_BASE}${previewEndpoint}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'x-api-key': this.apiKey!,
            'X-Lightroom-Account-Id': this.accountId,
            'Accept': 'image/*'
          }
        });
      }

      return previewResponse;
    } catch (error) {
      console.error('Error in getAssetPreview:', error);
      throw error;
    }
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
        'x-api-key': this.apiKey,
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
