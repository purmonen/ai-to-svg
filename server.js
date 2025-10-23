const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

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
  res.json({ status: 'ok', message: 'AI to SVG conversion service is running' });
});

// Convert .ai file to SVG
async function convertAiToSvg(inputPath) {
  const outputDir = path.join(os.tmpdir(), `svg-output-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // First, check how many pages the file has
    // Inkscape can query PDF/AI files for page count
    const { stdout: queryOutput } = await execAsync(
      `inkscape --query-all "${inputPath}" 2>&1 || true`
    );

    // Try to convert the file - Inkscape may handle multiple pages differently
    // We'll attempt to export each page separately
    const svgResults = [];
    let pageIndex = 0;
    let hasMorePages = true;

    while (hasMorePages && pageIndex < 100) { // Safety limit of 100 pages
      const outputPath = path.join(outputDir, `page-${pageIndex}.svg`);
      
      try {
        // Try to export specific page
        const command = pageIndex === 0 
          ? `inkscape "${inputPath}" --export-filename="${outputPath}" --export-type=svg`
          : `inkscape "${inputPath}" --pdf-page=${pageIndex + 1} --export-filename="${outputPath}" --export-type=svg 2>&1`;

        const { stdout, stderr } = await execAsync(command);
        
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
          throw new Error(`Inkscape conversion failed: ${error.message}`);
        }
        hasMorePages = false;
      }
    }

    // If no pages were converted, try a simpler approach
    if (svgResults.length === 0) {
      const outputPath = path.join(outputDir, 'output.svg');
      await execAsync(`inkscape "${inputPath}" --export-plain-svg="${outputPath}"`);
      
      const svgContent = await fs.readFile(outputPath, 'utf-8');
      svgResults.push(svgContent);
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

// Main conversion endpoint
app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    // Check if Inkscape is installed
    try {
      await execAsync('inkscape --version');
    } catch (err) {
      return res.status(500).json({ 
        error: 'Inkscape is not installed or not available in PATH' 
      });
    }

    // Convert the file
    const svgArray = await convertAiToSvg(filePath);

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
    // Cleanup uploaded file
    try {
      await fs.unlink(filePath);
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
app.listen(PORT, () => {
  console.log(`AI to SVG conversion server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Convert endpoint: POST http://localhost:${PORT}/convert`);
});
