const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 4000;
const MINERU_API_URL = 'https://mineru.net/api/v4/extract/task';
const MINERU_TOKEN = 'eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiIxMzMwMDIzNyIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc3NzI0OTIyOSwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiMTM4MDk4ODE5ODAiLCJvcGVuSWQiOm51bGwsInV1aWQiOiIwMzdmZGZlOS00M2NjLTQ5NzYtODhjYy1lZTAxODM0ZDU3ZGIiLCJlbWFpbCI6IiIsImV4cCI6MTc4NTAyNTIyOX0.3Yz_DaDS1JkrnhAQ0L8Wz_smPzCOytyx20x3Qs7SF8yvrRc2LLqpqsvROQRKt3EYB3FmywMYemkDFONqCVSUlw';

// macOS textutil for PDF text extraction (no OCR, but works for text-based PDFs)
const extractTextWithTextutil = (filePath) => {
  return new Promise((resolve, reject) => {
    exec(`textutil -convert txt -stdout "${filePath}"`, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
};

// MinerU v4 API proxy - now uses JSON with file base64
app.post('/api/mineru/file_parse', async (req, res) => {
  const { fileBase64, fileName } = req.body;

  if (!fileBase64) {
    return res.status(400).json({ error: 'Missing file data' });
  }

  try {
    // Decode base64 to buffer
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    // Write temp file for processing
    const tempDir = '/tmp/mineru';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `mineru_${Date.now()}_${fileName || 'resume.pdf'}`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    const ext = path.extname(fileName || '').toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'].includes(ext);

    // First try textutil for document formats (PDF, DOC, DOCX, RTF, TXT)
    // Skip textutil for image files — they need OCR
    if (!isImage) {
      try {
        const text = await extractTextWithTextutil(tempFilePath);
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {}
        return res.json({
          success: true,
          content_md: `# ${fileName}\n\n${text}`,
          content_list: [],
        });
      } catch (textutilError) {
        console.log('textutil failed, trying MinerU API:', textutilError.message);
      }
    } else {
      console.log('Image file detected, using MinerU API for OCR:', fileName);
    }

    // If textutil fails, try MinerU API
    const FormData = require('form-data');
    const form = new FormData();
    form.append('files', fs.createReadStream(tempFilePath), fileName || 'resume.pdf');
    form.append('model_version', 'vlm');

    const response = await fetch(MINERU_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINERU_TOKEN}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    // Clean up temp file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (e) {}

    if (!response.ok) {
      const errorText = await response.text();
      console.error('MinerU API error:', response.status, errorText);
      return res.status(response.status).json({ error: `API error: ${response.status} - ${errorText}` });
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const server = createServer(app);

server.listen(PORT, () => {
  console.log(`MinerU proxy server running on port ${PORT}`);
  console.log('Using macOS textutil for PDF text extraction');
});