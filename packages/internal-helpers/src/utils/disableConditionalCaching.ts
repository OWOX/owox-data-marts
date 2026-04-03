interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: number | string | readonly string[]): unknown;
  vary(field: string): unknown;
}

export function disableConditionalCaching(req: RequestLike, res: ResponseLike): void {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.vary('Cookie');
  res.vary('Authorization');
  res.vary('X-OWOX-Authorization');
}
