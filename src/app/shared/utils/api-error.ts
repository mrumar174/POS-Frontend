export function extractErrorMessage(err: any, defaultMessage: string): string {
  if (err?.response) {
    try {
      const parsed = JSON.parse(err.response);
      if (parsed.message) return parsed.message;
      if (parsed.detail) return parsed.detail;
      if (parsed.title) return parsed.title;
    } catch {
      if (typeof err.response === 'string' && err.response.trim() !== '') return err.response;
    }
  }
  if (err?.error) {
    if (typeof err.error === 'string') return err.error;
    if (err.error.message) return err.error.message;
    if (err.error.detail) return err.error.detail;
    if (err.error.title) return err.error.title;
  }
  return err?.message || defaultMessage;
}