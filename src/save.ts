export async function saveStream(
  stream: ReadableStream<Uint8Array>,
  output: Pick<FileSystemFileHandle, 'createWritable'>,
): Promise<void> {
  await stream.pipeTo(await output.createWritable());
}
