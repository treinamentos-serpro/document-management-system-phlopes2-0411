import { useEffect, useState } from 'react';
import DocumentList from './components/DocumentList.jsx';
import UploadComponent from './components/UploadComponent.jsx';
import { listDocuments } from './services/documentApi.js';
import './App.css';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadDocuments() {
      setIsLoading(true);
      setError('');

      try {
        const result = await listDocuments();
        if (isActive) {
          setDocuments(result);
        }
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message || 'Não foi possível carregar os documentos.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadDocuments();
    return () => {
      isActive = false;
    };
  }, [reloadToken]);

  function reloadDocuments() {
    setReloadToken((currentToken) => currentToken + 1);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="DMS, início">
          <span className="wordmark__symbol" aria-hidden="true">D</span>
          <span>DOCUM<span className="wordmark__light">ENTOS</span></span>
        </a>
        <span className="workspace-indicator">
          <span className="workspace-indicator__dot" />
          ARQUIVO LOCAL
        </span>
      </header>

      <main className="page-shell">
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">BIBLIOTECA / 01</p>
            <h1 id="page-title">Documentos</h1>
          </div>
          <p className="document-count" aria-live="polite">
            <span className="document-count__number">
              {isLoading ? '—' : String(documents.length).padStart(2, '0')}
            </span>
            <span className="document-count__label">arquivos</span>
          </p>
        </section>

        <div className="workspace-grid">
          <UploadComponent onUploaded={reloadDocuments} />
          <DocumentList
            documents={documents}
            isLoading={isLoading}
            error={error}
            onRetry={reloadDocuments}
          />
        </div>
      </main>
    </div>
  );
}
