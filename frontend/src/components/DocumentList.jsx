import DownloadButton from './DownloadButton.jsx';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileLabel(fileName) {
  const extension = fileName.includes('.') ? fileName.split('.').pop() : 'DOC';
  return extension.slice(0, 4).toUpperCase();
}

function DocumentRow({ document }) {
  return (
    <li className="document-row">
      <span className="file-type" aria-hidden="true">{getFileLabel(document.originalName)}</span>
      <div className="document-row__details">
        <span className="document-row__name" title={document.originalName}>
          {document.originalName}
        </span>
        <span className="document-row__meta">
          {formatFileSize(document.size)} <span aria-hidden="true">·</span>{' '}
          {dateFormatter.format(new Date(document.uploadedAt))}
        </span>
      </div>
      <DownloadButton documentId={document.id} originalName={document.originalName} />
    </li>
  );
}

export default function DocumentList({ documents, isLoading, error, onRetry }) {
  return (
    <section className="documents-section" aria-labelledby="documents-title">
      <div className="list-heading">
        <div className="section-heading">
          <p className="eyebrow">ACERVO</p>
          <h2 id="documents-title">Seus arquivos</h2>
        </div>
        {!isLoading && !error && (
          <span className="list-heading__count">{documents.length} itens</span>
        )}
      </div>

      {isLoading ? (
        <div className="list-state" role="status">Carregando documentos...</div>
      ) : error ? (
        <div className="list-state list-state--error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      ) : documents.length === 0 ? (
        <div className="list-state list-state--empty">
          <span className="empty-mark" aria-hidden="true">0</span>
          <p>Nenhum documento ainda.</p>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((document) => (
            <DocumentRow key={document.id} document={document} />
          ))}
        </ul>
      )}
    </section>
  );
}