export class BadRequestError extends Error {
  status = 400;
}
export class UnauthorizedError extends Error {
  status = 403;
}
export class NotFountError extends Error {
  status = 404;
}
export class ConflictError extends Error {
  status = 409;
}
export class ServerError extends Error {
  status = 500;
}
