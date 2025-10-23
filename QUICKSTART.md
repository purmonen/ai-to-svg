# Quick Start Guide

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Make sure Inkscape is installed:
```bash
# Ubuntu/Debian
sudo apt-get install inkscape

# macOS
brew install inkscape
```

3. Start the server:
```bash
npm start
```

4. Test the server:
```bash
curl http://localhost:3000/health
```

## Docker Deployment

Build and run with Docker:
```bash
docker build -t ai-to-svg .
docker run -p 3000:3000 ai-to-svg
```

Or use docker-compose:
```bash
docker-compose up
```

## Dokploy Deployment

1. Push this repository to your Git hosting service
2. In Dokploy:
   - Create a new application
   - Connect to your Git repository
   - Dokploy will automatically detect and use the Dockerfile
   - Set PORT environment variable if needed (default: 3000)
   - Deploy!

## API Usage

### Health Check
```bash
curl http://localhost:3000/health
```

### Convert .ai to SVG
```bash
curl -X POST http://localhost:3000/convert -F "file=@yourfile.ai"
```

## Frontend Integration

See `example-client.html` for a complete example of how to integrate with a frontend application.

Key points:
- Use multipart/form-data for file uploads
- The response contains an array of SVG strings
- Each page in the .ai file becomes a separate SVG in the array
- CORS is enabled for cross-origin requests

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Node environment (set to 'production' in Docker)

## Troubleshooting

**"Inkscape is not installed"**: Make sure Inkscape is available in your system PATH.

**Rate limit errors**: The service limits requests to 10 per 15 minutes per IP address. Wait or deploy your own instance.

**Large file uploads failing**: Default limit is 50MB. Large files may also take longer to process.
