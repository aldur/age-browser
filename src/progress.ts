export function trackProgress(
  stream: ReadableStream<Uint8Array>,
  onRead: (bytes: number) => void,
): ReadableStream<Uint8Array> {
  let bytes = 0;
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      onRead(bytes);
      controller.enqueue(chunk);
    },
  }));
}
