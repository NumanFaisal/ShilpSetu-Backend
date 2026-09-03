/**
 * Minimal HTTP error carrying a status code, consumed by the global
 * error handler in app.ts (reads `err.status`).
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
