export class BadRequestError extends Error {
  status = 400;
}
export class UnauthorizedError extends Error {
  status = 403;
  constructor(message: string = "Unauthorized") {
    super(message);
  }
}
export class NotFountError extends Error {
  status = 404;
  constructor(message: string = "Not Found") {
    super(message);
  }
}
export class ConflictError extends Error {
  status = 409;
}
export class ServerError extends Error {
  status = 500;
}
