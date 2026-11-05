const { randomUUID } = require('node:crypto');

const DEFAULT_OWNER = 'local-user';

class DocumentServiceError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function toPublicDocument(document) {
  return {
    id: document.id,
    originalName: document.originalName,
    size: document.size,
    uploadedAt: document.uploadedAt,
    owner: document.owner,
  };
}

function createDocumentMetadata(file) {
  return {
    id: randomUUID(),
    originalName: file.originalname,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    owner: DEFAULT_OWNER,
    storageName: file.filename,
  };
}

function compareDocuments(left, right) {
  const dateOrder = right.uploadedAt.localeCompare(left.uploadedAt);
  return dateOrder || left.id.localeCompare(right.id);
}

function createDocumentService({ documentRepository, localFileRepository }) {
  async function removeUploadedFile(storageName) {
    try {
      await localFileRepository.remove(storageName);
    } catch {
      // Preserva o erro original; o arquivo poderá exigir limpeza manual.
    }
  }

  async function createDocument(file) {
    const document = createDocumentMetadata(file);

    try {
      documentRepository.save(document);
      return toPublicDocument(document);
    } catch (error) {
      await removeUploadedFile(file.filename);

      throw new DocumentServiceError(
        500,
        'UPLOAD_FAILED',
        'Não foi possível registrar o documento.',
      );
    }
  }

  async function listDocuments() {
    return documentRepository
      .findAllByOwner(DEFAULT_OWNER)
      .sort(compareDocuments)
      .map(toPublicDocument);
  }

  async function getDocumentForDownload(id) {
    const document = documentRepository.findById(id);
    if (
      !document ||
      document.owner !== DEFAULT_OWNER ||
      !(await localFileRepository.exists(document.storageName))
    ) {
      throw new DocumentServiceError(
        404,
        'DOCUMENT_NOT_FOUND',
        'Documento não encontrado.',
      );
    }

    return {
      document: toPublicDocument(document),
      filePath: localFileRepository.getFilePath(document.storageName),
    };
  }

  return {
    createDocument,
    listDocuments,
    getDocumentForDownload,
  };
}

module.exports = {
  createDocumentService,
  DocumentServiceError,
};