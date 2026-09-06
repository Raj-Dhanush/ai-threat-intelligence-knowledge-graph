const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Document = require('../models/Document');

// ── Multer configuration ──────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const isPdf =
    file.mimetype === 'application/pdf' ||
    path.extname(file.originalname).toLowerCase() === '.pdf';

  if (isPdf) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// Export the multer middleware so the router can use it
const uploadMiddleware = upload.single('file');

// ── Controllers ───────────────────────────────────────────────────────────────

// @desc    Upload a PDF document
// @route   POST /api/documents/upload
// @access  Private (requires auth — handled via middleware on the route)
const uploadDocument = (req, res) => {
  uploadMiddleware(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Multer error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ message: 'Title is required' });
      }

      // Extract text from the saved PDF
      const filePath = path.join(__dirname, '../../uploads', req.file.filename);
      const fileBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(fileBuffer);
      const extractedText = pdfData.text || '';

      // req.user is set by the auth middleware
      const document = await Document.create({
        title,
        fileName: req.file.filename,
        uploadedBy: req.user.id,
        extractedText,
      });

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: {
          id: document._id,
          title: document.title,
          fileName: document.fileName,
          uploadedBy: document.uploadedBy,
          createdAt: document.createdAt,
          extractedTextLength: extractedText.length,
        },
      });
    } catch (error) {
      console.error('Upload error:', error.message);
      res.status(500).json({ message: 'Server error during upload' });
    }
  });
};

// @desc    Get all documents uploaded by the logged-in user
// @route   GET /api/documents
// @access  Private
const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find({ uploadedBy: req.user.id })
      .sort({ createdAt: -1 })
      .select('-__v');

    res.status(200).json({ documents });
  } catch (error) {
    console.error('Get documents error:', error.message);
    res.status(500).json({ message: 'Server error fetching documents' });
  }
};

module.exports = { uploadDocument, getDocuments };
