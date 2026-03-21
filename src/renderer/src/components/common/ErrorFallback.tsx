import { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-red-50 dark:bg-red-950">
      <h2 className="text-xl font-semibold text-red-700 dark:text-red-300 mb-4">
        Une erreur est survenue
      </h2>
      <pre className="text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900 p-4 rounded mb-4 max-w-lg overflow-auto">
        {error.message}
      </pre>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}
