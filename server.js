const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;

// Check Inkscape availability at startup
let inkscapeAvailable = false;
async function checkInkscape() {
  try {
    await execFileAsync('inkscape', ['--version']);
    inkscapeAvailable = true;
    console.log('✓ Inkscape is installed and available');
  } catch (err) {
    inkscapeAvailable = false;
    console.error('✗ WARNING: Inkscape is not installed or not available in PATH');
    console.error('  The conversion service will not work without Inkscape.');
    console.error('  Installation instructions:');
    console.error('    - Ubuntu/Debian: sudo apt-get install inkscape');
    console.error('    - macOS: brew install inkscape');
    console.error('    - Windows: Download from https://inkscape.org/release/');
  }
}

// Rate limiting to prevent DoS attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many conversion requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure multer for file uploads
const upload = multer({
  dest: path.join(os.tmpdir(), 'ai-uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/postscript' || 
        file.mimetype === 'application/illustrator' ||
        file.originalname.toLowerCase().endsWith('.ai')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ai files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'AI to SVG conversion service is running',
    inkscape: {
      available: inkscapeAvailable,
      message: inkscapeAvailable 
        ? 'Inkscape is installed and ready' 
        : 'Inkscape is not installed. Install it to enable conversions.'
    }
  });
});

// Validate and sanitize file path to prevent path traversal
function validateFilePath(filePath) {
  const resolvedPath = path.resolve(filePath);
  const tmpDir = os.tmpdir();
  
  // Ensure the file is within temp directory
  if (!resolvedPath.startsWith(tmpDir)) {
    throw new Error('Invalid file path');
  }
  
  return resolvedPath;
}

// Convert .ai file to SVG
async function convertAiToSvg(inputPath) {
  // Validate input path to prevent path injection
  const safeInputPath = validateFilePath(inputPath);
  
  const outputDir = path.join(os.tmpdir(), `svg-output-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // First, check how many pages the file has using execFile for security
    try {
      await execFileAsync('inkscape', ['--query-all', safeInputPath]);
    } catch (err) {
      // Query may fail, continue with conversion
    }

    // Try to convert the file - Inkscape may handle multiple pages differently
    // We'll attempt to export each page separately
    const svgResults = [];
    let pageIndex = 0;
    let hasMorePages = true;

    while (hasMorePages && pageIndex < 100) { // Safety limit of 100 pages
      const outputPath = path.join(outputDir, `page-${pageIndex}.svg`);
      
      try {
        // Try to export specific page using execFile to prevent command injection
        const inkscapeArgs = pageIndex === 0 
          ? [
              safeInputPath,
              `--export-filename=${outputPath}`,
              '--export-type=svg'
            ]
          : [
              safeInputPath,
              `--pdf-page=${pageIndex + 1}`,
              `--export-filename=${outputPath}`,
              '--export-type=svg'
            ];
        
        const result = await execFileAsync('inkscape', inkscapeArgs);
        
        // Log Inkscape output for debugging (only on first page to avoid spam)
        if (pageIndex === 0) {
          if (result.stdout) console.log('Inkscape stdout:', result.stdout);
          if (result.stderr) console.log('Inkscape stderr:', result.stderr);
        }
        
        // Check if file was created
        try {
          const stats = await fs.stat(outputPath);
          if (stats.size > 0) {
            const svgContent = await fs.readFile(outputPath, 'utf-8');
            svgResults.push(svgContent);
            pageIndex++;
          } else {
            hasMorePages = false;
          }
        } catch (err) {
          hasMorePages = false;
        }
      } catch (error) {
        // If error on first page, it's a real error, otherwise we're done
        if (pageIndex === 0) {
          const errorDetails = error.stderr ? `\nInkscape error: ${error.stderr}` : '';
          throw new Error(`Inkscape conversion failed: ${error.message}${errorDetails}`);
        }
        hasMorePages = false;
      }
    }

    // If no pages were converted, try a simpler approach
    if (svgResults.length === 0) {
      const outputPath = path.join(outputDir, 'output.svg');
      try {
        // Use consistent Inkscape 1.0+ syntax
        const inkscapeArgs = [
          safeInputPath,
          '--export-type=svg',
          `--export-filename=${outputPath}`
        ];
        
        console.log('Running Inkscape with args:', inkscapeArgs);
        const result = await execFileAsync('inkscape', inkscapeArgs);
        
        // Log Inkscape output for debugging
        if (result.stdout) console.log('Inkscape stdout:', result.stdout);
        if (result.stderr) console.log('Inkscape stderr:', result.stderr);
        
        // Check if the file was created before trying to read it
        try {
          await fs.access(outputPath);
          const svgContent = await fs.readFile(outputPath, 'utf-8');
          svgResults.push(svgContent);
        } catch (err) {
          // File wasn't created, throw a more informative error
          throw new Error('Inkscape failed to create output file. The .ai file may be corrupted or in an unsupported format.');
        }
      } catch (error) {
        // Capture stderr for better error reporting
        const errorDetails = error.stderr ? `\nInkscape error: ${error.stderr}` : '';
        
        // If this fallback also fails, provide a helpful error message
        if (!error.message.includes('Inkscape failed to create output file')) {
          throw new Error(`Inkscape conversion failed: ${error.message}${errorDetails}`);
        }
        throw error;
      }
    }

    return svgResults;
  } finally {
    // Cleanup temporary output directory
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up output directory:', err);
    }
  }
}

// Main conversion endpoint with rate limiting
app.post('/convert', limiter, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const uploadedFilePath = req.file.path;
  let validatedFilePath = null;

  try {
    // Validate file path to prevent path injection
    validatedFilePath = validateFilePath(uploadedFilePath);
    
    // Check if Inkscape is installed
    try {
      await execFileAsync('inkscape', ['--version']);
    } catch (err) {
      return res.status(500).json({ 
        error: 'Inkscape is not installed or not available in PATH',
        help: 'Please install Inkscape to use this service',
        instructions: {
          ubuntu: 'sudo apt-get install inkscape',
          macos: 'brew install inkscape',
          windows: 'Download from https://inkscape.org/release/'
        }
      });
    }

    // Convert the file
    const svgArray = await convertAiToSvg(validatedFilePath);

    // Return the SVG array
    res.json({
      success: true,
      count: svgArray.length,
      svgs: svgArray
    });

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ 
      error: 'Failed to convert file',
      message: error.message 
    });
  } finally {
    // Cleanup uploaded file - use validated path if available, otherwise original
    const pathToDelete = validatedFilePath || uploadedFilePath;
    try {
      await fs.unlink(pathToDelete);
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: error.message });
  }
  
  res.status(500).json({ error: error.message || 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`AI to SVG conversion server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Convert endpoint: POST http://localhost:${PORT}/convert`);
  
  // Check Inkscape availability on startup
  await checkInkscape();
});
