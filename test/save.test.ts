import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Encrypter, Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { saveStream } from '../src/save.ts';

test('streamed files work with the age CLI in both directions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'age-browser-'));
  try {
    const identity = await generateIdentity();
    const recipient = await identityToRecipient(identity);
    const keyPath = join(directory, 'key.txt');
    const encryptedPath = join(directory, 'encrypted.age');
    await writeFile(keyPath, identity + '\n', { mode: 0o600 });
    const plain = new Uint8Array(131073).map((_, i) => i % 251);
    const encrypter = new Encrypter();
    encrypter.addRecipient(recipient);
    const chunks: Uint8Array[] = [];
    await saveStream(await encrypter.encrypt(new Blob([plain]).stream()), {
      createWritable: async () => new WritableStream({ write: chunk => { chunks.push(chunk); } }),
    } as Pick<FileSystemFileHandle, 'createWritable'>);
    await writeFile(encryptedPath, Buffer.concat(chunks));
    assert.deepEqual(new Uint8Array(execFileSync('age', ['-d', '-i', keyPath, encryptedPath])), plain);
    const encrypted = execFileSync('age', ['-r', recipient], { input: plain });
    const decrypter = new Decrypter();
    decrypter.addIdentity(identity);
    const output = await decrypter.decrypt(new Blob([encrypted]).stream());
    assert.deepEqual(new Uint8Array(await new Response(output).arrayBuffer()), plain);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const failure of ['damaged final chunk', 'missing final chunk']) {
  test(`a ${failure} stops the output before close`, async () => {
    const identity = await generateIdentity();
    const encrypter = new Encrypter();
    encrypter.addRecipient(await identityToRecipient(identity));
    let encrypted = await encrypter.encrypt(new Uint8Array(131073));
    if (failure === 'missing final chunk') {
      // The last chunk has one data byte and a 16-byte tag.
      encrypted = encrypted.subarray(0, -17);
    } else {
      encrypted[encrypted.length - 1] ^= 1;
    }
    const decrypter = new Decrypter();
    decrypter.addIdentity(identity);
    let written = 0;
    let closed = false;
    let aborted = false;
    await assert.rejects(saveStream(await decrypter.decrypt(new Blob([encrypted]).stream()), {
      createWritable: async () => new WritableStream({
        write: chunk => { written += chunk.length; },
        close: () => { closed = true; },
        abort: () => { aborted = true; },
      }),
    } as Pick<FileSystemFileHandle, 'createWritable'>));
    assert.ok(written > 0);
    assert.equal(closed, false);
    assert.equal(aborted, true);
  });
}

test('an output failure stops the input stream', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull: controller => controller.enqueue(new Uint8Array(1024)),
    cancel: () => { cancelled = true; },
  });
  const failure = new Error('The output disk is full.');
  await assert.rejects(saveStream(stream, {
    createWritable: async () => new WritableStream({ write: () => { throw failure; } }),
  } as Pick<FileSystemFileHandle, 'createWritable'>), failure);
  assert.equal(cancelled, true);
});
