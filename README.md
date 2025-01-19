# Astro Lightroom Worker

A Cloudflare Worker application that integrates with Adobe Lightroom API to manage and serve your photography portfolio.

## Features

- OAuth2 authentication with Adobe's API
- Fetch albums and catalogs from Lightroom
- List and manage assets within albums
- Secure token storage using Cloudflare KV
- Proper error handling and logging

## Setup

### Prerequisites

1. Node.js and npm installed
2. Cloudflare Workers account
3. Adobe Developer Console account with Lightroom API access

### Environment Setup

#### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.dev.vars` file in the root directory with your Adobe API key:
   ```
   ADOBE_API_KEY=your_api_key_here
   ```
   Note: `.dev.vars` is gitignored for security.

#### Production Setup

1. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

2. Set up your Adobe API key as a secret:
   ```bash
   wrangler secret put ADOBE_API_KEY
   ```

### Adobe API Setup

1. Create a project in the Adobe Developer Console
2. Enable Lightroom API access
3. Note down your API credentials:
   - Client ID
   - Client Secret
   - API Key

4. Set up your credentials in the worker:
   ```bash
   curl -X POST https://your-worker-url/admin/credentials \
     -H "Content-Type: application/json" \
     -d '{"clientId": "your_client_id", "clientSecret": "your_client_secret"}'
   ```

## Development

Start the development server:
```bash
npm run dev
```

## API Endpoints

### System
- `GET /health` - Health check endpoint

### Authentication
- `GET /lightroom/auth/start` - Start OAuth flow
- `GET /lightroom/auth/callback` - OAuth callback handler
- `GET /lightroom/auth/clear` - Clear stored OAuth tokens

### Lightroom API
All Lightroom API endpoints are prefixed with `/lightroom/` and support the following operations:

#### Catalogs
- `GET /lightroom/v2/catalog` - Get user catalog information

#### Albums
- `GET /lightroom/v2/catalog/albums` - List all albums
  - Supports cursor-based pagination and sorting
  - Returns both regular albums (`collection`) and album sets (`collection_set`)
  - Album sets can contain other albums, creating a hierarchical structure
- `GET /lightroom/v2/catalog/albums/{album_id}` - Get specific album details
- `GET /lightroom/v2/catalog/albums/{album_id}/assets` - List assets in specific album

#### Assets
- `GET /lightroom/v2/catalog/assets` - List all assets
- `GET /lightroom/v2/catalog/albums/{album_id}/assets` - List assets in specific album

#### Pagination and Sorting
Album and asset listing endpoints support pagination and sorting through query parameters:

- `limit` (optional) - Number of items per page
  - Default: 20 for albums, 100 for assets
  - Example: `?limit=50`

- `name_after` (optional) - Cursor for pagination, use the last item's name from previous page
  - Example: `?name_after=Wedding+Photos`
  - Note: This replaces the offset parameter for more reliable pagination

##### Album Sorting
For albums, the following sort options are available:
- `order` (optional) - Field to sort by
  - Values: `name`, `created`, `updated`
  - Example: `?order=updated`

- `order_by` (optional) - Sort direction
  - Values: `asc`, `desc`
  - Example: `?order_by=desc`

##### Asset Sorting
For assets within albums, additional sort options are available:
- `order` (optional) - Field to sort by
  - Values: `captureDate`, `name`, `updated`
  - Example: `?order=captureDate`

Example requests:
```
# Sort albums by creation date, newest first
GET /lightroom/v2/catalog/albums?limit=20&order=created&order_by=desc

# Sort assets by capture date, newest first
GET /lightroom/v2/catalog/albums/{album_id}/assets?limit=100&order=captureDate&order_by=desc
```

Response format includes pagination links:
```json
{
  "resources": [
    {
      "id": "string",
      "type": "album",
      "subtype": "collection | collection_set",
      "created": "2024-01-19T00:00:00Z",
      "updated": "2024-01-19T00:00:00Z",
      "payload": {
        "name": "Album Name",
        "order": "V-1P",
        "userUpdated": "2024-01-19T00:00:00Z",
        "userCreated": "2024-01-19T00:00:00Z",
        "assetSortOrder": "captureDateAsc",
        "cover": {
          "id": "cover_asset_id"
        },
        "parent": {
          "id": "parent_album_id"
        },
        "importSource": {
          "lrcatStoreProviderId": "provider_id",
          "lrcatAlbumId": 12345
        }
      },
      "links": {
        "self": {
          "href": "albums/album_id"
        },
        "/rels/album_assets": {
          "href": "albums/album_id/assets?embed=asset"
        },
        "/rels/cover_asset": {
          "href": "assets/cover_asset_id"
        },
        "/rels/parent_album": {
          "href": "albums/parent_album_id"
        },
        "/rels/rendition_type/2048": {
          "href": "assets/cover_asset_id/renditions/2048"
        },
        "/rels/rendition_type/1280": {
          "href": "assets/cover_asset_id/renditions/1280"
        },
        "/rels/rendition_type/640": {
          "href": "assets/cover_asset_id/renditions/640"
        },
        "/rels/rendition_type/thumbnail2x": {
          "href": "assets/cover_asset_id/renditions/thumbnail2x"
        }
      }
    }
  ],
  "base": "https://lr.adobe.io/v2/catalogs/{catalog_id}/",
  "links": {
    "next": {
      "href": "albums?name_after=Album+Name&limit=20"  // URL for next page
    }
  }
}
```

#### Collection Types and Structure
Albums can be of two types:
1. `collection` - Regular albums that contain assets
   - Contains photos and videos
   - Has optional cover image
   - Can be nested inside a collection_set

2. `collection_set` - Album sets/folders that can contain other albums
   - Acts as a container for other albums
   - Example: Yearly folders ("2024", "2023") containing multiple albums
   - Can be nested (folders within folders)

Album properties:
- `id`: Unique identifier
- `type`: Always "album"
- `subtype`: Either "collection" or "collection_set"
- `created`: Creation timestamp
- `updated`: Last modification timestamp
- `payload`:
  - `name`: Album name
  - `order`: Sorting order within parent
  - `userUpdated`: Last user modification time
  - `userCreated`: Album creation time
  - `assetSortOrder`: How assets are sorted ("captureDateAsc", etc.)
  - `cover`: Cover image reference
  - `parent`: Parent album reference (for nested albums)
  - `importSource`: Import metadata if imported

The `links` object provides URLs for:
- Accessing album assets
- Retrieving cover image
- Navigating to parent album
- Getting different rendition sizes of cover image

### Admin
- `POST /admin/credentials` - Set Adobe API credentials

## Security Notes

- Never commit API keys or secrets to version control
- Always use environment variables or secrets management for sensitive data
- The `.dev.vars` file is ignored by git for local development security

## Known Limitations

- Asset and album listings are currently limited to approximately 100 items per request
- Pagination support is under development
- Write operations (create/update/delete) require additional security measures

## Future Enhancements

- Pagination support for albums and assets
- Enhanced security measures including API key authentication
- Support for asset metadata management
- Album creation and management
- Photo filtering and sorting capabilities
