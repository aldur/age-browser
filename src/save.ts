export async function saveStream(
  stream: ReadableStream<Uint8Array>,
  output: Pick<FileSystemFileHandle, 'createWritable'>,
  onFinishing?: () => void,
): Promise<void> {
  const writable = await output.createWritable();
  if (onFinishing) {
    stream = stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => controller.enqueue(chunk),
      flush: onFinishing,
    }));
  }
  await stream.pipeTo(writable);
}
