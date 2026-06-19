const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Loading chunk',
  'ChunkLoadError',
  'CSS_CHUNK_LOAD_FAILED',
];

const getErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${error.stack ?? ''}`;
  }
  return String(error ?? '');
};

const hashText = (text: string): string => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
};

export const isDynamicImportError = (error: unknown): boolean => {
  const text = getErrorText(error);
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some(pattern => text.includes(pattern));
};

export const reloadOnceForDynamicImportError = (error: unknown, scope = 'app'): boolean => {
  if (typeof window === 'undefined' || !isDynamicImportError(error)) {
    return false;
  }

  const key = `em-box.dynamic-import-reload.${scope}.${window.location.pathname}.${hashText(getErrorText(error))}`;
  if (window.sessionStorage.getItem(key) === '1') {
    return false;
  }

  window.sessionStorage.setItem(key, '1');
  window.setTimeout(() => {
    window.location.reload();
  }, 0);
  return true;
};
