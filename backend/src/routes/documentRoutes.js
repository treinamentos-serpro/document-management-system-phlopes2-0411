const { randomUUID } = require('node:crypto');
const multer = require('multer');
const express = require('express');

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function getMaxFileSizeBytes() {
  const configuredLimit = process.env.MAX_FILE_SIZE_BYTES;
  if (configuredLimit === undefined) {
    return DEFAULT_MAX_FILE_SIZE_BYTES;
  }

  const maxFileSizeBytes = Number(configuredLimit);
  if (!Number.isSafeInteger(maxFileSizeBytes) || maxFileSizeBytes < 1) {
    throw new Error('MAX_FILE_SIZE_BYTES deve ser um inteiro positivo.');
  }

  return maxFileSizeBytes;
}

function sendUploadError(res, statusCode, code, message) {
  return res.status(statusCode).json({ error: { code, message } });
}

function createDocumentRouter(documentController, localFileRepository) {
  const router = express.Router();
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      localFileRepository.ensureStorageDirectory()
        .then(() => callback(null, localFileRepository.storageDirectory))
        .catch(callback);
    },
    filename(req, file, callback) {
      callback(null, `${randomUUID()}.bin`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: getMaxFileSizeBytes() },
  }).single('file');

  function handleUpload(req, res, next) {
    upload(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return sendUploadError(
          res,
          413,
          'FILE_TOO_LARGE',
          'O arquivo excede o limite permitido.',
        );
      }

      if (error instanceof multer.MulterError) {
        return sendUploadError(
          res,
          400,
          'UNEXPECTED_FILE',
          'Envie apenas um arquivo no campo "file".',
        );
      }

      return sendUploadError(
        res,
        500,
        'UPLOAD_FAILED',
        'Não foi possível salvar o documento.',
      );
    });
  }

  router.post('/upload', handleUpload, documentController.upload);
  router.get('/documents', documentController.list);
  router.get('/documents/:id/download', documentController.download);

  return router;
}

module.exports = {
  createDocumentRouter,
};