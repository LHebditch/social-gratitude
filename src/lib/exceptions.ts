export class BadRequestError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class MisconfiguredServiceError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class DynamoPutError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}
