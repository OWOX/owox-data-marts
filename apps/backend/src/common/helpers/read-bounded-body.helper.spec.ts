import { readBoundedBody } from './read-bounded-body.helper';

function streamOf(chunks: string[], cancel = jest.fn()) {
  const queue = chunks.map(chunk => new TextEncoder().encode(chunk));
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
    cancel,
  });
}

describe('readBoundedBody', () => {
  it('gives null for a declared length over the cap and cancels the body unread', async () => {
    const cancel = jest.fn();
    const response = new Response(streamOf(['ab'], cancel), {
      headers: { 'content-length': '5' },
    });

    await expect(readBoundedBody(response, 4)).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('gives null for a streamed body that grows past the cap and cancels the reader', async () => {
    const cancel = jest.fn();
    const response = new Response(streamOf(['abc', 'de', 'fgh'], cancel));

    await expect(readBoundedBody(response, 4)).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('returns a body of exactly the cap', async () => {
    const response = new Response(streamOf(['ab', 'cd']));

    await expect(readBoundedBody(response, 4)).resolves.toEqual(Buffer.from('abcd'));
  });

  it('gives an empty buffer for a missing body', async () => {
    await expect(readBoundedBody(new Response(null), 4)).resolves.toEqual(Buffer.alloc(0));
  });
});
