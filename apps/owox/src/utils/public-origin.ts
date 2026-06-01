export function resolvePublicOrigin(): string {
  const publicOrigin = process.env.PUBLIC_ORIGIN?.trim();
  if (publicOrigin) {
    return publicOrigin;
  }

  return `http://localhost:${process.env.PORT}`;
}
