# Astro Lightroom Worker

A Cloudflare Worker application that integrates with Adobe Lightroom API to manage and serve your photography portfolio.

## Features

- OAuth2 authentication with Adobe's API
- Fetch albums and catalogs from Lightroom
- Upload photos to Lightroom
- Manage photo metadata
- Portfolio organization and management

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

### Authentication
- `GET /auth/start` - Start OAuth flow
- `GET /auth/callback` - OAuth callback handler

### Lightroom API
- `GET /api/lightroom/accounts` - List all accounts
- `GET /api/lightroom/catalogs` - List all catalogs
- `GET /api/lightroom/albums` - List albums in a catalog
- `GET /api/lightroom/assets` - List assets in a catalog or album
- `POST /api/lightroom/upload` - Upload new assets

## Security Notes

- Never commit API keys or secrets to version control
- Always use environment variables or secrets management for sensitive data
- The `.dev.vars` file is ignored by git for local development security
