function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({
    error: { code, message },
  });
}

function createDocumentController(documentService) {
  async function upload(req, res) {
    if (!req.file) {
      return sendError(res, 400, 'FILE_REQUIRED', 'Envie um arquivo no campo "file".');
    }

    try {
      const document = await documentService.createDocument(req.file);
      return res.status(201).json(document);
    } catch {
      return sendError(
        res,
        500,
        'UPLOAD_FAILED',
        'Não foi possível salvar o documento.',
      );
    }
  }

  async function list(req, res) {
    try {
      const documents = await documentService.listDocuments();
      return res.status(200).json({ documents });
    } catch {
      return sendError(
        res,
        500,
        'LIST_FAILED',
        'Não foi possível listar os documentos.',
      );
    }
  }

  async function download(req, res, next) {
    try {
      const { document, filePath } = await documentService.getDocumentForDownload(
        req.params.id,
      );

      return res.download(
        filePath,
        document.originalName,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
          },
        },
        (error) => {
          if (!error) {
            return;
          }

          if (res.headersSent) {
            return next(error);
          }

          return sendError(
            res,
            500,
            'DOWNLOAD_FAILED',
            'Não foi possível baixar o documento.',
          );
        },
      );
    } catch (error) {
      if (error.statusCode === 404) {
        return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
      }

      return sendError(
        res,
        500,
        'DOWNLOAD_FAILED',
        'Não foi possível baixar o documento.',
      );
    }
  }

  return {
    upload,
    list,
    download,
  };
}

module.exports = {
  createDocumentController,
};