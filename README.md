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
- `GET /lightroom/v2/catalog/albums/{album_id}` - Get specific album details
- `GET /lightroom/v2/catalog/albums/{album_id}/assets` - List assets in specific album

#### Assets
- `GET /lightroom/v2/catalog/assets` - List all assets
- `GET /lightroom/v2/catalog/albums/{album_id}/assets` - List assets in specific album

#### Pagination and Sorting
All album and asset listing endpoints support pagination and sorting through query parameters:

- `limit` (optional) - Number of items per page
  - Default: 20 for albums, 100 for assets
  - Example: `?limit=50`

- `offset` (optional) - Number of items to skip
  - Default: 0
  - Example: `?offset=100`

- `order_by` (optional) - Field to sort by
  - Values: `captureDate`, `name`, `updated`
  - Example: `?order_by=captureDate`

- `order_direction` (optional) - Sort direction
  - Values: `asc`, `desc`
  - Example: `?order_direction=desc`

Example request with all parameters:
```
GET /lightroom/v2/catalog/assets?limit=50&offset=0&order_by=captureDate&order_direction=desc
```

Response format:
```json
{
  "resources": [], // Array of albums or assets
  "base": "string", // Base URL
  "links": {
    "next": "string", // URL for next page (if available)
    "prev": "string"  // URL for previous page (if available)
  }
}
```

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
