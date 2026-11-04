# Especificação - Document Management System

## 1. Objetivo

Disponibilizar uma aplicação web simples para enviar, listar e baixar documentos armazenados no filesystem local, associando cada documento ao usuário local padrão.

## 2. Escopo

### Dentro do escopo

- Envio de um arquivo por requisição.
- Listagem dos documentos registrados para a instância local.
- Download de um documento pelo identificador.
- Metadados mantidos em memória durante a execução do processo.
- Interface web para os fluxos de upload, listagem e download.
- Armazenamento de arquivos em `backend/storage` usando Multer com `diskStorage`.

### Fora do escopo

- Autenticação, cadastro de usuários e controle de acesso multiusuário.
- Banco de dados ou persistência durável dos metadados.
- Armazenamento em nuvem, serviços externos ou provedores de upload.
- Versionamento, edição, exclusão ou compartilhamento de documentos.
- Pesquisa, filtros avançados, paginação e pastas.
- Restrição de formatos por extensão ou tipo MIME.

### Premissas

- A aplicação atende uma única identidade local padrão, representada por `owner: "local-user"`. Esse valor organiza os metadados, mas não é uma credencial nem um mecanismo de autorização.
- O serviço deve ser usado em ambiente local ou confiável. Como não há autenticação, não deve ser exposto a usuários não confiáveis.
- Cada upload aceita qualquer tipo de arquivo, limitado a 10 MiB (10.485.760 bytes). O limite é configurável por variável de ambiente e tem esse valor padrão.
- A API do backend usa os caminhos descritos abaixo. No navegador, as chamadas usam o prefixo `/api`; o proxy Vite remove esse prefixo antes de encaminhar as requisições ao backend.

## 3. Requisitos funcionais

| ID | Requisito | Critérios de aceite |
| --- | --- | --- |
| RF-01 | O sistema deve receber um documento por `multipart/form-data`, no campo `file`. | Com arquivo válido de até 10 MiB, grava o conteúdo localmente e responde `201` com os metadados públicos. |
| RF-02 | O sistema deve validar a presença e o tamanho do arquivo recebido. | Campo ausente ou requisição sem arquivo resulta em `400`; arquivo acima do limite resulta em `413`. Qualquer tipo de arquivo é aceito; arquivo vazio é permitido. |
| RF-03 | O sistema deve atribuir um identificador único e um nome interno gerado pelo servidor. | O identificador público é UUID v4. O nome interno não usa o nome fornecido pelo cliente, não contém caminhos e não é retornado pela API. |
| RF-04 | O sistema deve associar o documento ao usuário local padrão. | Todo registro criado possui `owner: "local-user"`; a listagem retorna somente registros desse usuário. Não há autenticação nem alegação de isolamento seguro entre usuários. |
| RF-05 | O sistema deve listar os documentos registrados. | Responde `200` com a lista, inclusive quando vazia; ordena por `uploadedAt` decrescente e usa `id` crescente como desempate. |
| RF-06 | O sistema deve permitir baixar um documento pelo identificador. | Um identificador existente retorna o conteúdo binário como anexo com o nome original; identificador desconhecido ou sem arquivo correspondente retorna `404`. |
| RF-07 | O sistema deve manter arquivos e metadados de acordo com a política local definida. | O arquivo fica em `backend/storage`; os metadados existem somente em memória e não são reconstruídos após reinício. |
| RF-08 | O sistema deve evitar deixar arquivo órfão quando o registro dos metadados falhar após a gravação. | A falha ao registrar metadados aciona a tentativa de remover o arquivo recém-gravado e retorna erro interno sem expor caminhos locais. |

## 4. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | O armazenamento dos arquivos deve ser local, em `backend/storage`, usando Multer `diskStorage`; armazenamento externo é proibido nesta fase. |
| RNF-02 | Os metadados devem ser mantidos em memória. Reiniciar o processo perde os registros, mesmo que os arquivos continuem no filesystem. |
| RNF-03 | A configuração operacional deve usar variáveis de ambiente quando aplicável. `PORT` define a porta do backend e `MAX_FILE_SIZE_BYTES` define o limite do upload, cujo padrão é `10485760`. |
| RNF-04 | Nomes internos de arquivo devem ser gerados no servidor. Nenhum caminho fornecido pelo cliente pode ser usado para compor o caminho de gravação ou leitura. |
| RNF-05 | Erros não devem revelar caminhos absolutos, stack traces ou detalhes internos ao cliente. |
| RNF-06 | O download deve responder como anexo (`Content-Disposition: attachment`) e incluir `X-Content-Type-Options: nosniff`. |
| RNF-07 | O backend deve seguir Clean Architecture simples, com dependências no sentido routes → controllers → services → repositories. As camadas internas não dependem de Express ou de detalhes HTTP. |
| RNF-08 | O frontend deve usar React, componentes funcionais e `fetch` com prefixo `/api`, conforme a configuração do proxy Vite. |
| RNF-09 | Os testes do backend devem usar o runner nativo `node:test`; a implementação deve permanecer em JavaScript, sem TypeScript nesta fase. |

## 5. Modelo de dados

### Registro público do documento

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | string | Sim | UUID v4 gerado pelo servidor. Identificador usado nos endpoints de listagem e download. |
| `originalName` | string | Sim | Nome original enviado pelo cliente, armazenado como metadado e devolvido para exibição/download. Não é usado como caminho no filesystem. |
| `size` | integer | Sim | Tamanho do conteúdo em bytes, maior ou igual a zero e limitado por `MAX_FILE_SIZE_BYTES`. |
| `uploadedAt` | string | Sim | Data e hora do recebimento em ISO 8601 UTC, por exemplo `2026-11-04T12:30:00.000Z`. |
| `owner` | string | Sim | Identificador fixo `local-user` nesta versão. Não representa autenticação. |

### Dados internos de armazenamento

O repositório mantém também um `storageName` interno, gerado pelo servidor e associado ao registro. Ele identifica o arquivo dentro de `backend/storage`, não é aceito do cliente e nunca aparece nas respostas da API. O nome original não deve ser concatenado ao caminho local.

### Persistência e ciclo de vida

- Os metadados são mantidos em uma estrutura em memória durante a vida do processo.
- Os arquivos são gravados no filesystem local em `backend/storage`.
- Após reinício, a lista de metadados começa vazia. Arquivos remanescentes no diretório não são recuperados automaticamente e podem ficar órfãos; limpeza ou recuperação automática não fazem parte do escopo.
- Não existe garantia de sobrevivência dos metadados a reinício, falha do processo ou implantação de nova instância.

## 6. Contratos de API

### Convenções

- As rotas abaixo são caminhos do backend. Chamadas feitas pelo frontend usam `/api` antes do caminho; por exemplo, `/api/documents` é encaminhado pelo Vite para `/documents`.
- Respostas de erro JSON usam o formato `{"error":{"code":"CODIGO","message":"Descrição em português."}}`.
- `Content-Type` das respostas JSON é `application/json; charset=utf-8`.
- O backend não exige autenticação nesta versão; a identidade `local-user` é aplicada internamente.

### `POST /upload`

Recebe um arquivo e cria um registro de documento.

**Requisição**

- `Content-Type: multipart/form-data`
- Um único campo de arquivo chamado `file`.
- Arquivos com qualquer tipo MIME são aceitos; tamanho máximo padrão: 10.485.760 bytes.

**Sucesso - `201 Created`**

```json
{
  "id": "c2fb73a6-2a55-49eb-9df5-c7059f367c32",
  "originalName": "relatorio.pdf",
  "size": 24576,
  "uploadedAt": "2026-11-04T12:30:00.000Z",
  "owner": "local-user"
}
```

**Erros**

| Status | Código | Condição |
| --- | --- | --- |
| `400 Bad Request` | `FILE_REQUIRED` | Campo `file` ausente ou nenhum arquivo enviado. |
| `400 Bad Request` | `UNEXPECTED_FILE` | Campo de arquivo não reconhecido ou mais de um arquivo enviado. |
| `413 Payload Too Large` | `FILE_TOO_LARGE` | Arquivo ultrapassa `MAX_FILE_SIZE_BYTES`. |
| `500 Internal Server Error` | `UPLOAD_FAILED` | Falha ao gravar arquivo ou registrar metadados. A resposta não revela detalhes internos. |

Se a gravação do arquivo ocorrer, mas o registro em memória falhar, o sistema tenta remover o arquivo gravado antes de responder.

### `GET /documents`

Lista os documentos registrados para `local-user`, do mais recente para o mais antigo. Empates em `uploadedAt` são ordenados por `id` em ordem crescente. Não há paginação nesta versão.

**Sucesso - `200 OK`**

```json
{
  "documents": [
    {
      "id": "c2fb73a6-2a55-49eb-9df5-c7059f367c32",
      "originalName": "relatorio.pdf",
      "size": 24576,
      "uploadedAt": "2026-11-04T12:30:00.000Z",
      "owner": "local-user"
    }
  ]
}
```

Sem documentos, a resposta é `{"documents":[]}`. Falhas inesperadas retornam `500 Internal Server Error` com código `LIST_FAILED` no formato padrão de erro.

### `GET /documents/:id/download`

Localiza um documento registrado e transmite o arquivo como anexo.

**Sucesso - `200 OK`**

- Corpo: bytes originais do arquivo, transmitidos sem conversão.
- `Content-Type: application/octet-stream`.
- `Content-Disposition: attachment`, com o nome original codificado com segurança para uso em header.
- `X-Content-Type-Options: nosniff`.

**Erros**

| Status | Código | Condição |
| --- | --- | --- |
| `404 Not Found` | `DOCUMENT_NOT_FOUND` | UUID inválido, documento inexistente nos metadados ou arquivo local ausente. |
| `500 Internal Server Error` | `DOWNLOAD_FAILED` | Falha inesperada de leitura/transmissão antes do início da resposta. |

O endpoint nunca interpreta `:id` como caminho do filesystem. O caminho é obtido exclusivamente do registro interno associado ao UUID.

## 7. Decisões arquiteturais

### Backend

| Camada | Responsabilidade |
| --- | --- |
| `routes/` | Declarar endpoints e conectar middleware de upload e controllers. |
| `controllers/` | Interpretar a entrada HTTP, fazer validação básica, invocar serviços e mapear resultados para status/headers/respostas. |
| `services/` | Aplicar regras de negócio: limite, associação ao usuário local, criação de metadados, ordenação e resolução de documento para download. |
| `repositories/` | Manter os metadados em memória e encapsular a localização/acesso ao arquivo local. |

Multer com `diskStorage` é configurado na fronteira HTTP para gravar em `backend/storage`. O nome de destino deve ser gerado pelo servidor. Controllers convertem os dados recebidos em uma entrada simples para os serviços; serviços não recebem objetos `req`/`res` nem dependem do Express.

### Frontend

- React com componentes funcionais e Hooks.
- Separação conforme a estrutura existente de `pages/`, `components/` e `services/`.
- Comunicação por `fetch` através de `/api`; o proxy de desenvolvimento encaminha para o backend sem o prefixo.
- A interface contempla estados de carregamento, lista vazia, sucesso e erro de upload/listagem/download.

### Armazenamento

- Apenas filesystem local da aplicação; diretório fixo `backend/storage`.
- Gravação feita com Multer `diskStorage`.
- Metadados apenas em memória nesta fase.
- Não introduzir banco de dados, bucket, armazenamento externo ou serviço de upload de terceiros.

## 8. Plano de execução

As etapas abaixo descrevem trabalho futuro. A etapa atual produz somente este documento; não executa implementação de backend ou frontend.

1. **Backend:** implementar upload local com Multer, regras de metadados em memória, listagem e download, respeitando as camadas e os contratos desta especificação.
2. **Testes do backend:** cobrir contratos, validação, limites, ordenação, documentos ausentes e comportamento de falha/armazenamento usando `node:test`.
3. **Frontend:** implementar os fluxos de upload, listagem e download e seus estados de carregamento, vazio e erro, usando o proxy `/api`.
4. **Integração e verificação:** validar os fluxos completos com backend e frontend, conferir persistência local e comportamento após reinício, e ajustar documentação se os contratos permanecerem consistentes com esta especificação.

## 9. Limites desta entrega

- Entrega desta etapa: `docs/specs/dms-spec.md`.
- Nenhum arquivo de implementação do backend ou frontend faz parte desta etapa.
- A especificação orienta etapas posteriores e não implica que os endpoints ou a interface já estejam implementados.