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

export interface LightroomAlbumPayload {
  name: string;
  order?: string;
  userUpdated?: string;
  userCreated?: string;
  assetSortOrder?: 'captureDateAsc' | 'captureDateDesc' | string;
  cover?: {
    id: string;
  };
  parent?: {
    id: string;
  };
  importSource?: {
    lrcatStoreProviderId?: string;
    lrcatAlbumId?: number;
  };
}

export interface LightroomAlbum {
  id: string;
  name: string;
  created: string;
  updated: string;
  type: 'collection' | 'collection_set';
  subtype: string;
  payload: LightroomAlbumPayload;
  parentId?: string;
  cover?: {
    id: string;
    height?: number;
    width?: number;
  };
  links?: {
    self?: { href: string };
    '/rels/album_assets'?: { href: string };
    '/rels/cover_asset'?: { href: string };
    '/rels/parent_album'?: { href: string };
    '/rels/rendition_type/2048'?: { href: string };
    '/rels/rendition_type/1280'?: { href: string };
    '/rels/rendition_type/640'?: { href: string };
    '/rels/rendition_type/thumbnail2x'?: { href: string };
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

// Pagination interfaces
export interface PaginationOptions {
  limit?: number;
  name_after?: string;
  order?: 'name' | 'created' | 'updated';  // Field to sort by
  order_by?: 'asc' | 'desc';  // Sort direction
}

export interface PaginatedResponse<T> {
  resources: T[];
  base: string;
  links: {
    next?: string;
    prev?: string;
  };
  errors?: any[];
}

export class LightroomClient {
  constructor(
    private readonly accessToken: string,
    private readonly accountId?: string,
    private readonly apiKey?: string,
    private readonly clientId?: string
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

  async listCatalogs(): Promise<any> {
    console.log('Listing catalogs...');
    const response = await this.request('/v2/catalog');
    return response;
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

  async getAlbums(
    catalogId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResponse<LightroomAlbum>> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get albums');
    }

    let endpoint = `/v2/catalogs/${catalogId}/albums?`;
    const params = new URLSearchParams();
  
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.name_after) params.append('name_after', options.name_after);
    if (options.order) params.append('order', options.order);
    if (options.order_by) params.append('order_by', options.order_by);
  
    endpoint += params.toString();
  
    console.log('Album request:', {
      endpoint,
      params: Object.fromEntries(params.entries()),
      options
    });
  
    const response = await this.request(endpoint);
    console.log('Raw albums response:', JSON.stringify(response, null, 2));
  
    if (!response.resources) {
      console.warn('No albums found in catalog:', catalogId);
      return {
        resources: [],
        base: response.base,
        links: response.links || {}
      };
    }

    return {
      resources: response.resources.map((album: any) => ({
        id: album.id,
        type: album.type,
        subtype: album.subtype,
        created: album.created,
        updated: album.updated,
        links: album.links,
        payload: {
          name: album.payload.name,
          order: album.payload.order,
          userUpdated: album.payload.userUpdated,
          userCreated: album.payload.userCreated,
          assetSortOrder: album.payload.assetSortOrder,
          cover: album.payload.cover,
          parent: album.payload.parent,
          importSource: album.payload.importSource
        },
        parentId: album.payload?.parent?.id,
        cover: album.payload?.cover ? {
          id: album.payload.cover.id
        } : undefined
      })),
      base: response.base,
      links: response.links || {}
    };
  }

  async getAssets(
    catalogId: string, 
    albumId?: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResponse<LightroomAsset>> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get assets');
    }

    let endpoint = albumId 
      ? `/v2/catalogs/${catalogId}/albums/${albumId}/assets?`
      : `/v2/catalogs/${catalogId}/assets?`;
  
    const params = new URLSearchParams();
  
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.order) params.append('order', options.order);
    if (options.order_by) params.append('order_by', options.order_by);
  
    endpoint += params.toString();

    console.log('Making request to:', endpoint);
    const response = await this.request(endpoint);
    console.log('Raw Adobe API response:', JSON.stringify(response, null, 2));

    if (!response.resources) {
      return {
        resources: [],
        base: response.base,
        links: response.links || {}
      };
    }

    return {
      resources: response.resources.map((asset: any) => ({
        id: asset.id,
        name: asset.payload.name || asset.payload.importSource.fileName || 'Untitled',
        size: asset.payload.importSource.fileSize,
        type: asset.payload.importSource.fileFormat,
        subtype: asset.subtype,
        created: asset.payload.captureDate || asset.payload.importSource.importedOnDevice,
        updated: asset.updated,
        metadata: {
          dimensions: asset.payload.develop?.croppedDimensions || asset.payload.develop?.dimensions,
          location: asset.payload.develop?.userMetadata?.location
        }
      })),
      base: response.base,
      links: response.links || {}
    };
  }

  async getAsset(
    catalogId: string,
    assetId: string
  ): Promise<LightroomAsset> {
    if (!this.accountId) {
      throw new Error('Account ID is required to get asset');
    }

    const endpoint = `/v2/catalogs/${catalogId}/assets/${assetId}`;
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
        thumbnail2x: `/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions/thumbnail2x`,
        '2048': `/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions/2048`,
        fullsize: `/lightroom/catalogs/${catalogId}/assets/${asset.id}/renditions/2048`
      }
    };
  }

  private isGeneratedSize(size: string): boolean {
    return size === 'fullsize' || size === '2560';
  }

  private async checkRenditionStatus(
    catalogId: string,
    assetId: string,
    size: string
  ): Promise<boolean> {
    const endpoint = `/v2/catalogs/${catalogId}/assets/${assetId}/renditions/${size}/status`;
    console.log('Checking rendition status:', endpoint);

    const response = await fetch(`${LIGHTROOM_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'x-api-key': this.apiKey!,
        'X-Lightroom-Client-Id': this.clientId
      }
    });

    if (response.status === 404) {
      return false; // Rendition doesn't exist yet
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Status check error:', errorText);
      return false;
    }

    const status = await response.json();
    console.log('Rendition status:', status);
    return status?.status === 'complete' || status?.ready === true;
  }

  async getAssetPreview(
    catalogId: string,
    assetId: string,
    size: 'thumbnail2x' | 'fullsize' | '640' | '1280' | '2048' | '2560' = '2048'
  ): Promise<Response> {
    if (!this.accessToken || !this.apiKey) {
      throw new Error('Access token and API key are required');
    }

    try {
      const requestedSize = size;
      const needsGeneration = this.isGeneratedSize(requestedSize);
      
      const renditionEndpoint = `/v2/catalogs/${catalogId}/assets/${assetId}/renditions/${requestedSize}`;
      console.log('Getting rendition from:', renditionEndpoint, needsGeneration ? '(needs generation)' : '(using preview)');

      // For previews (non-generated sizes), just try to get them directly
      if (!needsGeneration) {
        const previewResponse = await fetch(`${LIGHTROOM_API_BASE}${renditionEndpoint}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'x-api-key': this.apiKey,
            'X-Lightroom-Client-Id': this.clientId,
            'Accept': 'image/jpeg'
          }
        });

        if (!previewResponse.ok) {
          const errorText = await previewResponse.text();
          throw new Error(`Failed to get preview: ${previewResponse.status} ${previewResponse.statusText} - ${errorText}`);
        }

        return previewResponse;
      }

      // For sizes that need generation (fullsize, 2560)
      const baseWaitTime = requestedSize === 'fullsize' ? 10000 : 5000; // 10s for fullsize, 5s for 2560
      console.log('Base wait time:', baseWaitTime);

      const maxRetries = 8;
      let renditionRequested = false;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const previewResponse = await fetch(`${LIGHTROOM_API_BASE}${renditionEndpoint}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'x-api-key': this.apiKey,
            'X-Lightroom-Client-Id': this.clientId,
            'Accept': 'image/jpeg'
          }
        });

        console.log(`Attempt ${attempt + 1} response:`, {
          status: previewResponse.status,
          statusText: previewResponse.statusText,
          headers: Object.fromEntries(previewResponse.headers.entries())
        });

        if (previewResponse.ok) {
          return previewResponse;
        }

        if (previewResponse.status === 404) {
          // Only request rendition generation once
          if (!renditionRequested) {
            console.log('Rendition not found, requesting generation...');
            
            const generateEndpoint = `/v2/catalogs/${catalogId}/assets/${assetId}/renditions`;
            const generateResponse = await fetch(`${LIGHTROOM_API_BASE}${generateEndpoint}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'x-api-key': this.apiKey,
                'X-Lightroom-Client-Id': this.clientId,
                'X-Generate-Renditions': requestedSize,
                'Content-Length': '0'
              }
            });

            if (!generateResponse.ok) {
              const errorText = await generateResponse.text();
              console.error('Generate rendition error:', errorText);
              throw new Error(`Failed to request rendition generation: ${generateResponse.status} ${generateResponse.statusText}`);
            }

            renditionRequested = true;
            console.log('Rendition generation requested successfully');
          }

          // Check if rendition is ready
          const isReady = await this.checkRenditionStatus(catalogId, assetId, requestedSize);
          if (!isReady) {
            // Exponential backoff with some randomization
            const waitTime = baseWaitTime * Math.pow(1.5, attempt) * (1 + Math.random() * 0.2);
            console.log(`Rendition not ready, waiting ${Math.round(waitTime)}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        // If error is not 404, or rendition is ready but we got an error
        const errorText = await previewResponse.text();
        throw new Error(`Failed to get rendition: ${previewResponse.status} ${previewResponse.statusText} - ${errorText}`);
      }

      throw new Error('Failed to get rendition after generation: Maximum retries exceeded');
    } catch (error) {
      console.error('Error in getAssetPreview:', error);
      throw error;
    }
  }

  async getAvailableRenditionSizes(catalogId: string, assetId: string): Promise<string[]> {
    // According to Adobe API docs, only 'fullsize' and '2560' are supported for generation
    return ['fullsize', '2560'];
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
      `/v2/catalogs/${catalogId}/assets`,
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
