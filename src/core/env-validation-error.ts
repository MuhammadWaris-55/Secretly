export class EnvValidationError extends Error {
  constructor(
    readonly variables: string[],
    message: string,
  ) {
    super(message);
  }
}
