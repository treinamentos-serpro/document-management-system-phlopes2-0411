const { test } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const app = require('../src/app');
const documentRepository = require('../src/repositories/documentRepository');
const localFileRepository = require('../src/repositories/localFileRepository');

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
