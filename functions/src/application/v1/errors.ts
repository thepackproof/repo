export const applicationErrorCategories = [
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'DEADLINE_EXCEEDED',
  'FAILED_PRECONDITION',
  'RESOURCE_EXHAUSTED',
  'RETRYABLE_CONFLICT',
] as const;

export type ApplicationErrorCategory = (typeof applicationErrorCategories)[number];

export type ApplicationErrorDetail = {
  field?: string;
  code: string;
  message: string;
};

export class ApplicationError extends Error {
  constructor(
    readonly category: ApplicationErrorCategory,
    readonly code: string,
    message: string,
    readonly details: readonly ApplicationErrorDetail[] = [],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
