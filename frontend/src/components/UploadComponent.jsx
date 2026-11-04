import { useId, useRef, useState } from 'react';
import { uploadDocument } from '../services/documentApi.js';

export default function UploadComponent({ onUploaded }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function handleFileChange(event) {
    setSelectedFile(event.target.files?.[0] || null);
    setFeedback(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedFile || isUploading) {
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      await uploadDocument(selectedFile);
      setSelectedFile(null);
      inputRef.current.value = '';
      setFeedback({ type: 'success', message: 'Documento enviado.' });
      await onUploaded?.();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Não foi possível enviar o documento.',
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="upload-panel" aria-labelledby="upload-title">
      <div className="section-heading">
        <p className="eyebrow">NOVO ARQUIVO</p>
        <h2 id="upload-title">Adicionar documento</h2>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="visually-hidden"
          id={inputId}
          type="file"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <label className="file-picker" htmlFor={inputId}>
          <span className="file-picker__symbol" aria-hidden="true">+</span>
          <span className="file-picker__text">
            <strong>{selectedFile?.name || 'Selecionar arquivo'}</strong>
            <span>{selectedFile ? 'Pronto para envio' : 'Escolha no seu dispositivo'}</span>
          </span>
          <span className="file-picker__arrow" aria-hidden="true">↗</span>
        </label>

        <button className="primary-button" type="submit" disabled={!selectedFile || isUploading}>
          <span>{isUploading ? 'Enviando' : 'Enviar documento'}</span>
          <span className="primary-button__symbol" aria-hidden="true">{isUploading ? '…' : '↑'}</span>
        </button>

        {feedback && (
          <p className={`form-feedback form-feedback--${feedback.type}`} role="status">
            {feedback.message}
          </p>
        )}
      </form>
    </section>
  );
}