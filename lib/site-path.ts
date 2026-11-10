/** Keep the same source working at a domain root and a GitHub Pages project path. */
export function sitePath(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}
