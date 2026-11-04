const API_BASE_URL = '/api';

async function ensureSuccessfulResponse(response) {
  if (response.ok) {
    return response;
  }

  let message = 'Não foi possível concluir a solicitação.';
  try {
    const body = await response.json();
    message = body.error?.message || message;
  } catch {
    // Mantém a mensagem padrão quando a resposta não contém JSON.
  }

  throw new Error(message);
}

export async function listDocuments() {
  const response = await ensureSuccessfulResponse(
    await fetch(`${API_BASE_URL}/documents`),
  );
  const body = await response.json();

  if (!Array.isArray(body.documents)) {
    throw new Error('A resposta da lista de documentos é inválida.');
  }

  return body.documents;
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await ensureSuccessfulResponse(
    await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    }),
  );

  return response.json();
}

export async function downloadDocument(documentId) {
  const response = await ensureSuccessfulResponse(
    await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(documentId)}/download`),
  );

  return response.blob();
}