import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Encrypter, Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { saveStream } from '../src/save.ts';
import { trackProgress } from '../src/progress.ts';

function chunkedStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.byteLength) return controller.close();
      const end = Math.min(offset + 32768, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}

test('either recipient can decrypt streamed files in the browser library and age CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'age-browser-'));
  try {
    const identities = await Promise.all([generateIdentity(), generateIdentity()]);
    const recipients = await Promise.all(identities.map(identityToRecipient));
    const keyPath = join(directory, 'key.txt');
    const encryptedPath = join(directory, 'encrypted.age');
    const plain = new Uint8Array(131073).map((_, i) => i % 251);
    const encrypter = new Encrypter();
    for (const recipient of recipients) encrypter.addRecipient(recipient);
    const chunks: Uint8Array[] = [];
    const encryptionProgress: number[] = [];
    await saveStream(await encrypter.encrypt(trackProgress(chunkedStream(plain), bytes => {
      encryptionProgress.push(bytes);
    })), {
      createWritable: async () => new WritableStream({ write: chunk => { chunks.push(chunk); } }),
    } as Pick<FileSystemFileHandle, 'createWritable'>);
    assert.ok(encryptionProgress.length > 1);
    assert.equal(encryptionProgress.at(-1), plain.byteLength);
    await writeFile(encryptedPath, Buffer.concat(chunks));
    const encrypted = execFileSync('age', recipients.flatMap(recipient => ['-r', recipient]), { input: plain });
    for (const identity of identities) {
      await writeFile(keyPath, identity + '\n', { mode: 0o600 });
      assert.deepEqual(new Uint8Array(execFileSync('age', ['-d', '-i', keyPath, encryptedPath])), plain);
      const decrypter = new Decrypter();
      decrypter.addIdentity(identity);
      const decryptionProgress: number[] = [];
      const output = await decrypter.decrypt(trackProgress(chunkedStream(encrypted), bytes => {
        decryptionProgress.push(bytes);
      }));
      assert.deepEqual(new Uint8Array(await new Response(output).arrayBuffer()), plain);
      assert.ok(decryptionProgress.length > 1);
      assert.equal(decryptionProgress.at(-1), encrypted.byteLength);
    }
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
    let finishing = false;
    await assert.rejects(saveStream(await decrypter.decrypt(new Blob([encrypted]).stream()), {
      createWritable: async () => new WritableStream({
        write: chunk => { written += chunk.length; },
        close: () => { closed = true; },
        abort: () => { aborted = true; },
      }),
    } as Pick<FileSystemFileHandle, 'createWritable'>, () => { finishing = true; }));
    assert.ok(written > 0);
    assert.equal(closed, false);
    assert.equal(aborted, true);
    assert.equal(finishing, false);
  });
}

test('an output failure stops the input stream', async () => {
  let cancelled = false;
  const stream = trackProgress(new ReadableStream({
    pull: controller => controller.enqueue(new Uint8Array(1024)),
    cancel: () => { cancelled = true; },
  }), () => {});
  const failure = new Error('The output disk is full.');
  await assert.rejects(saveStream(stream, {
    createWritable: async () => new WritableStream({ write: () => { throw failure; } }),
  } as Pick<FileSystemFileHandle, 'createWritable'>), failure);
  assert.equal(cancelled, true);
});

for (const size of [0, 131073]) {
  test(`finishing a ${size}-byte save waits for the output to close`, async () => {
    const closing = Promise.withResolvers<void>();
    const releaseClose = Promise.withResolvers<void>();
    let finishing = false;
    let saved = false;
    const saving = saveStream(new Blob([new Uint8Array(size)]).stream(), {
      createWritable: async () => new WritableStream({
        close: () => {
          closing.resolve();
          return releaseClose.promise;
        },
      }),
    } as Pick<FileSystemFileHandle, 'createWritable'>, () => { finishing = true; })
      .then(() => { saved = true; });
    await closing.promise;
    assert.equal(finishing, true);
    assert.equal(saved, false);
    releaseClose.resolve();
    await saving;
    assert.equal(saved, true);
  });
}

test('a failure while closing the output rejects the save after finishing starts', async () => {
  const failure = new Error('The output could not be committed.');
  let finishing = false;
  await assert.rejects(saveStream(new Blob([]).stream(), {
    createWritable: async () => new WritableStream({ close: () => { throw failure; } }),
  } as Pick<FileSystemFileHandle, 'createWritable'>, () => { finishing = true; }), failure);
  assert.equal(finishing, true);
});
