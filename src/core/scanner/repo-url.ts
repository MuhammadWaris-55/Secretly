import { InvalidRepoUrlError } from "./errors";

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
}

// GitHub owners: alphanumeric or hyphen, must start with an alphanumeric (this also
// blocks anything that could be parsed as a git option like "--upload-pack").
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Accepts only https://github.com/<owner>/<repo>. The clone URL is rebuilt from the
 * validated parts, never passed through from the input.
 */
export function parseRepoUrl(input: string): RepoRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidRepoUrlError("not a valid URL");
  }

  if (url.protocol !== "https:") throw new InvalidRepoUrlError("must use https");
  if (url.hostname !== "github.com") throw new InvalidRepoUrlError("host must be github.com");
  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new InvalidRepoUrlError("unexpected URL parts");
  }

  const [leading, owner, rawName, ...rest] = url.pathname.replace(/\/+$/, "").split("/");
  if (leading !== "" || !owner || !rawName || rest.length > 0) {
    throw new InvalidRepoUrlError("expected /<owner>/<repo>");
  }

  const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
  if (!OWNER_RE.test(owner)) throw new InvalidRepoUrlError("invalid owner");
  if (!NAME_RE.test(name) || name === "." || name === "..") {
    throw new InvalidRepoUrlError("invalid repository name");
  }

  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
}
