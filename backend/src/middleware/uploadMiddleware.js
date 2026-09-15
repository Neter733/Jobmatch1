import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PDF, DOCX, or TXT files are allowed'));
    }
    cb(null, true);
  }
});

// Separate, more permissive uploader for internal team chat — allows
// common document types plus images/photos, since staff share screenshots.
export const chatUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('That file type isn\'t supported in chat'));
    }
    cb(null, true);
  }
});
