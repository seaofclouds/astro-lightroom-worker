interface LightroomConfig {
  clientId: string;
  accessToken?: string;
}

export class LightroomClient {
  private config: LightroomConfig;
  private baseUrl = 'https://lr.adobe.io/v2';

  constructor(config: LightroomConfig) {
    this.config = config;
  }

  private async fetch(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-API-Key': this.config.clientId,
      'Authorization': `Bearer ${this.config.accessToken}`,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Adobe API error: ${response.statusText}`);
    }

    return response.json();
  }

  async getAlbums() {
    return this.fetch('/catalog/albums');
  }

  async getAsset(assetId: string) {
    return this.fetch(`/catalog/assets/${assetId}`);
  }

  async getAssetRendition(assetId: string) {
    return this.fetch(`/catalog/assets/${assetId}/renditions/2048`);
  }
}
