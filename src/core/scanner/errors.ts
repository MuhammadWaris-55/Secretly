export class InvalidRepoUrlError extends Error {
  constructor(reason: string) {
    super(`Invalid repository URL: ${reason}`);
    this.name = "InvalidRepoUrlError";
  }
}
