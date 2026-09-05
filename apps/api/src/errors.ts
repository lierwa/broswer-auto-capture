export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message) }
}
export function conflict(message: string): never { throw new DomainError("conflict", message) }
