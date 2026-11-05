const { test } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const app = require('../src/app');
const documentRepository = require('../src/repositories/documentRepository');
const localFileRepository = require('../src/repositories/localFileRepository');
const {
  createDocumentService,
  DocumentServiceError,
} = require('../src/services/documentService');

function createStoredDocument(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    originalName: 'amostra.txt',
    size: 16,
    uploadedAt: '2026-11-05T12:00:00.000Z',
    owner: 'local-user',
    storageName: '00000000-0000-4000-8000-000000000002.bin',
    ...overrides,
  };
}

// Teste de fumaça do seed: garante que o app Express foi exportado.
// Novos testes serão adicionados durante os Steps 2, 6 e 7 com auxílio do Copilot.
test('o app backend é exportado', () => {
  assert.ok(app, 'o app deve estar definido');
  assert.strictEqual(typeof app, 'function', 'o app Express deve ser uma função');
});

test('upload, listagem e download de documentos', async (t) => {
  const server = app.listen(0);
  await once(server, 'listening');

  let uploadedId;
  t.after(async () => {
    if (uploadedId) {
      const document = documentRepository.findById(uploadedId);
      documentRepository.deleteById(uploadedId);
      if (document) {
        await localFileRepository.remove(document.storageName);
      }
    }

    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const missingFileResponse = await fetch(`${baseUrl}/upload`, { method: 'POST' });
  assert.strictEqual(missingFileResponse.status, 400);
  assert.deepStrictEqual(await missingFileResponse.json(), {
    error: {
      code: 'FILE_REQUIRED',
      message: 'Envie um arquivo no campo "file".',
    },
  });

  const form = new FormData();
  form.append('file', new Blob(['conteudo de teste'], { type: 'text/plain' }), 'amostra.txt');
  const uploadResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    body: form,
  });

  assert.strictEqual(uploadResponse.status, 201);
  const uploadedDocument = await uploadResponse.json();
  uploadedId = uploadedDocument.id;
  assert.match(uploadedId, /^[0-9a-f-]{36}$/i);
  assert.strictEqual(uploadedDocument.originalName, 'amostra.txt');
  assert.strictEqual(uploadedDocument.size, Buffer.byteLength('conteudo de teste'));
  assert.strictEqual(uploadedDocument.owner, 'local-user');
  assert.ok(Number.isFinite(Date.parse(uploadedDocument.uploadedAt)));

  const listResponse = await fetch(`${baseUrl}/documents`);
  assert.strictEqual(listResponse.status, 200);
  assert.deepStrictEqual(await listResponse.json(), { documents: [uploadedDocument] });

  const downloadResponse = await fetch(`${baseUrl}/documents/${uploadedId}/download`);
  assert.strictEqual(downloadResponse.status, 200);
  assert.strictEqual(downloadResponse.headers.get('content-type'), 'application/octet-stream');
  assert.strictEqual(downloadResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.match(downloadResponse.headers.get('content-disposition'), /filename="amostra.txt"/);
  assert.strictEqual(await downloadResponse.text(), 'conteudo de teste');

  const notFoundResponse = await fetch(
    `${baseUrl}/documents/00000000-0000-4000-8000-000000000000/download`,
  );
  assert.strictEqual(notFoundResponse.status, 404);
  assert.strictEqual((await notFoundResponse.json()).error.code, 'DOCUMENT_NOT_FOUND');

  const oversizedForm = new FormData();
  oversizedForm.append(
    'file',
    new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]),
    'arquivo-grande.bin',
  );
  const oversizedResponse = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    body: oversizedForm,
  });
  assert.strictEqual(oversizedResponse.status, 413);
  assert.strictEqual((await oversizedResponse.json()).error.code, 'FILE_TOO_LARGE');
});

test('o serviço cria metadados e não expõe o nome interno', async () => {
  let storedDocument;
  const service = createDocumentService({
    documentRepository: {
      save(document) {
        storedDocument = document;
      },
    },
    localFileRepository: {},
  });

  const document = await service.createDocument({
    originalname: 'amostra.txt',
    size: 16,
    filename: 'arquivo-interno.bin',
  });

  assert.match(document.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.strictEqual(document.originalName, 'amostra.txt');
  assert.strictEqual(document.size, 16);
  assert.strictEqual(document.owner, 'local-user');
  assert.ok(Number.isFinite(Date.parse(document.uploadedAt)));
  assert.strictEqual(storedDocument.storageName, 'arquivo-interno.bin');
  assert.deepStrictEqual(storedDocument, { ...document, storageName: 'arquivo-interno.bin' });
});

test('o serviço tenta limpar o upload sem substituir o erro de registro', async (t) => {
  for (const cleanupFails of [false, true]) {
    await t.test(cleanupFails ? 'a limpeza falha' : 'a limpeza funciona', async () => {
      const removedFiles = [];
      const service = createDocumentService({
        documentRepository: {
          save() {
            throw new Error('Falha de persistência');
          },
        },
        localFileRepository: {
          async remove(storageName) {
            removedFiles.push(storageName);
            if (cleanupFails) {
              throw new Error('Falha de limpeza');
            }
          },
        },
      });

      await assert.rejects(
        service.createDocument({ originalname: 'amostra.txt', size: 16, filename: 'arquivo.bin' }),
        (error) => error instanceof DocumentServiceError &&
          error.statusCode === 500 && error.code === 'UPLOAD_FAILED' &&
          error.message === 'Não foi possível registrar o documento.',
      );
      assert.deepStrictEqual(removedFiles, ['arquivo.bin']);
    });
  }
});

test('o serviço ordena por data e desempata por id sem expor dados internos', async () => {
  const older = createStoredDocument({ id: 'c', uploadedAt: '2026-11-04T12:00:00.000Z' });
  const newer = createStoredDocument({ id: 'b' });
  const tied = createStoredDocument({ id: 'a' });
  const service = createDocumentService({
    documentRepository: {
      findAllByOwner(owner) {
        assert.strictEqual(owner, 'local-user');
        return [older, newer, tied];
      },
    },
    localFileRepository: {},
  });

  const documents = await service.listDocuments();
  assert.deepStrictEqual(documents.map((document) => document.id), ['a', 'b', 'c']);
  for (const document of documents) {
    assert.deepStrictEqual(Object.keys(document), ['id', 'originalName', 'size', 'uploadedAt', 'owner']);
  }
});

test('o serviço verifica registro e arquivo antes de liberar o download', async (t) => {
  const scenarios = [
    { name: 'registro inexistente', document: null, fileExists: true, expectedChecks: 0 },
    { name: 'outro proprietário', document: createStoredDocument({ owner: 'other-user' }), fileExists: true, expectedChecks: 0 },
    { name: 'arquivo ausente', document: createStoredDocument(), fileExists: false, expectedChecks: 1 },
    { name: 'documento disponível', document: createStoredDocument(), fileExists: true, expectedChecks: 1 },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      let fileChecks = 0;
      let pathLookups = 0;
      const service = createDocumentService({
        documentRepository: {
          findById(id) {
            assert.strictEqual(id, 'requested-id');
            return scenario.document;
          },
        },
        localFileRepository: {
          async exists(storageName) {
            fileChecks += 1;
            assert.strictEqual(storageName, scenario.document.storageName);
            return scenario.fileExists;
          },
          getFilePath(storageName) {
            pathLookups += 1;
            assert.strictEqual(storageName, scenario.document.storageName);
            return '/storage/arquivo.bin';
          },
        },
      });

      if (scenario.name === 'documento disponível') {
        const result = await service.getDocumentForDownload('requested-id');
        assert.strictEqual(result.filePath, '/storage/arquivo.bin');
        assert.deepStrictEqual(scenario.document, {
          ...result.document,
          storageName: scenario.document.storageName,
        });
        assert.strictEqual(pathLookups, 1);
      } else {
        await assert.rejects(
          service.getDocumentForDownload('requested-id'),
          (error) => error instanceof DocumentServiceError &&
            error.statusCode === 404 && error.code === 'DOCUMENT_NOT_FOUND' &&
            error.message === 'Documento não encontrado.',
        );
        assert.strictEqual(pathLookups, 0);
      }
      assert.strictEqual(fileChecks, scenario.expectedChecks);
    });
  }
});
