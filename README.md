# AI to SVG Conversion Service

Express.js server that converts Adobe Illustrator (.ai) files to SVG format using Inkscape. The service handles multi-page .ai files and returns each page as a separate SVG string.

## Features

- Convert .ai files to SVG format
- Handle multi-page documents (each page returned separately)
- RESTful API with file upload support
- Docker support for easy deployment
- Designed for Dokploy deployment

## Prerequisites

- Node.js 18+ and npm
- Inkscape installed on the system

### Installing Inkscape

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install inkscape
```

**macOS:**
```bash
brew install inkscape
```

**Windows:**
Download from [Inkscape official website](https://inkscape.org/release/)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-to-svg
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will start on port 3000 by default.

## API Endpoints

### Health Check
```
GET /health
```

Returns the server status.

**Response:**
```json
{
  "status": "ok",
  "message": "AI to SVG conversion service is running"
}
```

### Convert AI to SVG
```
POST /convert
```

Upload an .ai file and receive SVG output(s).

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with a file field named "file"

**Example using curl:**
```bash
curl -X POST http://localhost:3000/convert \
  -F "file=@/path/to/your/file.ai"
```

**Example using JavaScript fetch:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('http://localhost:3000/convert', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result.svgs); // Array of SVG strings
```

**Success Response (200):**
```json
{
  "success": true,
  "count": 2,
  "svgs": [
    "<svg>...page 1 content...</svg>",
    "<svg>...page 2 content...</svg>"
  ]
}
```

**Error Responses:**

400 Bad Request - No file uploaded:
```json
{
  "error": "No file uploaded"
}
```

400 Bad Request - Invalid file type:
```json
{
  "error": "Only .ai files are allowed"
}
```

500 Internal Server Error:
```json
{
  "error": "Failed to convert file",
  "message": "Detailed error message"
}
```

## Docker Deployment

### Build the Docker image:
```bash
docker build -t ai-to-svg .
```

### Run the container:
```bash
docker run -p 3000:3000 ai-to-svg
```

## Dokploy Deployment

This service is designed to work with Dokploy. The Dockerfile includes all necessary dependencies:

1. Push your code to a Git repository
2. In Dokploy, create a new application
3. Connect your Git repository
4. Dokploy will automatically detect the Dockerfile and build the image
5. Set the port to 3000 (or configure via PORT environment variable)

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Node environment (default: production in Docker)

## File Upload Limits

- Maximum file size: 50MB
- Accepted file types: .ai files
- Maximum pages per file: 100 (safety limit)

## Development

### Running in development mode:
```bash
node server.js
```

### Testing the API:

1. Start the server
2. Use the provided curl example or test with a tool like Postman
3. Upload a .ai file
4. Receive SVG output(s) as JSON response

## Technical Details

### Conversion Process

1. File is uploaded via multipart/form-data
2. File is temporarily stored in the system temp directory
3. Inkscape is called to convert the .ai file to SVG
4. For multi-page documents, each page is extracted separately
5. SVG content is read and returned as text strings in an array
6. Temporary files are cleaned up automatically

### Error Handling

- Validates Inkscape is installed before conversion
- Handles file upload errors (size, type, etc.)
- Cleans up temporary files even if conversion fails
- Returns descriptive error messages

## License

ISC