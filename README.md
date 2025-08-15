# External Auth Server

A Node.js API server for external authentication, designed to connect to Microsoft Dataverse. This server provides secure authentication endpoints and contractor management functionality.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Microsoft Dataverse access
- Azure AD application registration

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory with the following variables:
   ```env
   NODE_ENV=development
   PORT=5000
   DATAVERSE_URL=your_dataverse_url
   AZURE_CLIENT_ID=your_client_id
   AZURE_CLIENT_SECRET=your_client_secret
   AZURE_TENANT_ID=your_tenant_id
   ```

## Development

### Running with Local Tunnel (HTTPS endpoint)

For development with external services that require HTTPS endpoints (like Power Apps), you need to set up a tunnel before starting the server:

1. **Install localtunnel globally:**

   ```bash
   npm install -g localtunnel
   ```

2. **Start the tunnel (run this BEFORE starting the server):**

   ```bash
   lt --port 5000 --subdomain powerapp-lof
   ```

   This will generate a secure HTTPS endpoint like: `https://powerapp-lof.loca.lt`

3. **Start the development server:**

   ```bash
   npm run dev
   ```

4. **Access your API:**
   - Local: `http://localhost:5000`
   - Public HTTPS: `https://powerapp-lof.loca.lt`

### Running without tunnel (local only)

```bash
npm run dev
```

## Project Structure

```
├── app.js                 # Express application setup
├── server.js             # Server entry point
├── config.js             # Configuration management
├── controllers/          # Request handlers
├── services/             # Business logic
├── middlewares/          # Express middlewares
├── routes/               # API route definitions
├── lib/                  # Utility libraries
├── constants/            # Error codes and messages
└── utils/                # Helper utilities
```

## API Endpoints

### Authentication

- `POST /contractor-auth/login` - Contractor login
- `POST /contractor-auth/:contractorAuthId/password` - Generate password

### Contractors

- `GET /contractors` - List contractors
- `GET /contractors/:id` - Get contractor details

### Health Check

- `GET /health` - Server health status

## Development Notes

- The server automatically connects to Microsoft Dataverse using MSAL authentication
- All Dataverse operations are abstracted through service layers
- Error handling is centralized with custom AppError class
- Request logging and validation middleware are included
- Rate limiting is configured for production use

## Security Features

- JWT-based authentication
- Password hashing with SHA-256
- Rate limiting
- CORS configuration
- Request ID tracking
- Secure cookie handling

## Testing

```bash
npm test
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure production environment variables
3. Ensure HTTPS is properly configured
4. Review rate limiting settings
5. Set up proper logging and monitoring
