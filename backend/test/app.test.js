const { test } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
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

async function startTestServer(t) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

// Teste de fumaça do seed: garante que o app Express foi exportado.
// Novos testes serão adicionados durante os Steps 2, 6 e 7 com auxílio do Copilot.
test('o app backend é exportado', () => {
  assert.ok(app, 'o app deve estar definido');
  assert.strictEqual(typeof app, 'function', 'o app Express deve ser uma função');
});

test('upload, listagem e download de documentos', async (t) => {
  const baseUrl = await startTestServer(t);

  let uploadedId;
  t.after(async () => {
    if (uploadedId) {
      const document = documentRepository.findById(uploadedId);
      documentRepository.deleteById(uploadedId);
      if (document) {
        await localFileRepository.remove(document.storageName);
      }
    }
  });

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

test('os endpoints respeitam os contratos de upload, listagem e download', async (t) => {
  const baseUrl = await startTestServer(t);

  await t.test('a listagem vazia retorna um array', async () => {
    const response = await fetch(`${baseUrl}/documents`);
    assert.strictEqual(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepStrictEqual(await response.json(), { documents: [] });
  });

  for (const invalidUpload of ['campo inesperado', 'mais de um arquivo']) {
    await t.test(`o upload rejeita ${invalidUpload}`, async () => {
      const form = new FormData();
      const field = invalidUpload === 'campo inesperado' ? 'document' : 'file';
      form.append(field, new Blob(['primeiro']), 'primeiro.txt');
      if (invalidUpload === 'mais de um arquivo') {
        form.append('file', new Blob(['segundo']), 'segundo.txt');
      }

      const response = await fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
      assert.strictEqual(response.status, 400);
      assert.strictEqual((await response.json()).error.code, 'UNEXPECTED_FILE');
      const listResponse = await fetch(`${baseUrl}/documents`);
      assert.deepStrictEqual(await listResponse.json(), { documents: [] });
    });
  }

  await t.test('a listagem ordena documentos e filtra o proprietário', async (t) => {
    const records = [
      createStoredDocument({ id: '00000000-0000-4000-8000-000000000003', uploadedAt: '2026-11-04T12:00:00.000Z' }),
      createStoredDocument({ id: '00000000-0000-4000-8000-000000000002' }),
      createStoredDocument(),
      createStoredDocument({ id: '00000000-0000-4000-8000-000000000004', owner: 'other-user' }),
    ];
    t.after(() => {
      for (const record of records) documentRepository.deleteById(record.id);
    });
    for (const record of records) documentRepository.save(record);

    const response = await fetch(`${baseUrl}/documents`);
    assert.strictEqual(response.status, 200);
    const { documents } = await response.json();
    assert.deepStrictEqual(documents.map((document) => document.id), [records[2].id, records[1].id, records[0].id]);
    for (const document of documents) {
      assert.strictEqual(document.owner, 'local-user');
      assert.deepStrictEqual(Object.keys(document), ['id', 'originalName', 'size', 'uploadedAt', 'owner']);
    }
  });

  for (const content of [Buffer.alloc(0), Buffer.from([0, 255, 128, 13, 10])]) {
    await t.test(content.length === 0 ? 'aceita arquivo vazio' : 'preserva bytes binários', async (t) => {
      let uploadedDocument;
      t.after(async () => {
        if (!uploadedDocument?.id) return;
        const stored = documentRepository.findById(uploadedDocument.id);
        documentRepository.deleteById(uploadedDocument.id);
        if (stored) await localFileRepository.remove(stored.storageName);
      });
      const form = new FormData();
      form.append('file', new Blob([content]), 'arquivo.bin');
      const uploadResponse = await fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
      uploadedDocument = await uploadResponse.json();
      assert.strictEqual(uploadResponse.status, 201);
      assert.strictEqual(uploadedDocument.size, content.length);
      assert.strictEqual(Object.hasOwn(uploadedDocument, 'storageName'), false);

      const downloadResponse = await fetch(`${baseUrl}/documents/${uploadedDocument.id}/download`);
      assert.strictEqual(downloadResponse.status, 200);
      assert.match(downloadResponse.headers.get('content-disposition'), /^attachment;/);
      assert.deepStrictEqual(Buffer.from(await downloadResponse.arrayBuffer()), content);
    });
  }

  await t.test('o download retorna 404 quando o arquivo local está ausente', async (t) => {
    const record = createStoredDocument({ storageName: `${randomUUID()}.bin` });
    t.after(() => documentRepository.deleteById(record.id));
    documentRepository.save(record);
    const response = await fetch(`${baseUrl}/documents/${record.id}/download`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual((await response.json()).error.code, 'DOCUMENT_NOT_FOUND');
  });

  for (const invalidId of ['id-invalido', '../../etc/passwd']) {
    await t.test(`o download rejeita ${invalidId}`, async () => {
      const response = await fetch(`${baseUrl}/documents/${encodeURIComponent(invalidId)}/download`);
      assert.strictEqual(response.status, 404);
      assert.strictEqual((await response.json()).error.code, 'DOCUMENT_NOT_FOUND');
    });
  }
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
