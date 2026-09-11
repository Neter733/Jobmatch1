import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// buffer: raw file buffer from multer, mimetype: file's reported mime type
export async function extractTextFromFile(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimetype === 'text/plain') {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${mimetype}. Please upload PDF, DOCX, or TXT.`);
}
