export class BadRequestError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class MisconfiguredServiceError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class DynamoPutError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class DynamoGetError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class KMSEncryptError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class KMSDecryptError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class NotFoundError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class SendEmailError extends Error {
  constructor(message?: string) {
    super(message);
  }
}

export class SQSError extends Error {
  constructor(message?: string) {
    super(message);
  }
}