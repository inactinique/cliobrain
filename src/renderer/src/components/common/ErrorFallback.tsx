import { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8" style={{ background: 'var(--bg-app)' }}>
      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-danger)' }}>
        Une erreur est survenue
      </h2>
      <pre
        className="text-sm p-4 rounded mb-4 max-w-lg overflow-auto"
        style={{ background: 'var(--bg-card)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}
      >
        {error.message}
      </pre>
      <button onClick={resetErrorBoundary} className="btn-danger">
        Réessayer
      </button>
    </div>
  );
}
