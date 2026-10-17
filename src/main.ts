import { Encrypter, Decrypter, webauthn } from 'age-encryption';
import { saveStream } from './save.ts';

const controls = document.querySelector<HTMLFieldSetElement>('#controls')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const identityStatus = document.querySelector<HTMLParagraphElement>('#identity-status')!;
const fileStatus = document.querySelector<HTMLParagraphElement>('#file-status')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
let identity = '';
let identityFile: FileSystemFileHandle | undefined;
let inputFile: FileSystemFileHandle | undefined;
let busy = false;

function action(id: string, task: () => Promise<string>): void {
  button(id).onclick = async () => {
    busy = true;
    controls.disabled = true;
    status.textContent = 'Complete the Chrome prompt.';
    try {
      status.textContent = await task();
    } catch (error) {
      status.textContent = error instanceof DOMException && ['AbortError', 'NotAllowedError'].includes(error.name)
        ? 'The operation stopped. The tool did not save an output file.'
        : `The operation failed. ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
      controls.disabled = false;
      button('save').disabled = !identity;
      button('encrypt').disabled = button('decrypt').disabled = !identityFile || !inputFile;
    }
  };
}

action('create', async () => {
  identity = await webauthn.createCredential({ type: 'security-key', keyName: 'age file encryption' });
  identityFile = undefined;
  identityStatus.textContent = 'The identity is ready. Save the identity file before you continue.';
  return 'The security key is ready. Select Save identity.';
});

action('load', async () => {
  const [handle] = await showOpenFilePicker();
  const file = await handle.getFile();
  if (file.size > 16384) throw new Error('The identity file is too large. The limit is 16 KiB.');
  const lines = (await file.text()).split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (lines.length !== 1) throw new Error('Select a file that contains one hardware identity.');
  new webauthn.WebAuthnIdentity({ identity: lines[0] });
  identity = lines[0];
  identityFile = handle;
  identityStatus.textContent = `Identity file: ${file.name}`;
  return 'The identity is ready.';
});

action('save', async () => {
  const handle = await showSaveFilePicker({ suggestedName: 'age-yubikey.txt' });
  if (inputFile && await handle.isSameEntry(inputFile)) throw new Error('Select a different output file.');
  await saveStream(new Blob([identity + '\n']).stream(), handle);
  identityFile = handle;
  identityStatus.textContent = `Identity file: ${handle.name}`;
  return 'The identity file is saved. Keep a separate copy.';
});

action('input', async () => {
  const [handle] = await showOpenFilePicker();
  inputFile = handle;
  fileStatus.textContent = `Input file: ${handle.name}`;
  return 'Select Encrypt file or Decrypt file.';
});

for (const mode of ['encrypt', 'decrypt'] as const) {
  action(mode, async () => {
    const input = inputFile!;
    const name = mode === 'encrypt' ? `${input.name}.age` : input.name.replace(/\.age$/, '') + '.decrypted';
    const output = await showSaveFilePicker({ suggestedName: name });
    if (await output.isSameEntry(input) || (identityFile && await output.isSameEntry(identityFile))) {
      throw new Error('Select an output file that is different from the input file and the identity file.');
    }
    const file = await input.getFile();
    const options = { identity };
    let stream: ReadableStream<Uint8Array>;
    if (mode === 'encrypt') {
      const cipher = new Encrypter();
      cipher.addRecipient(new webauthn.WebAuthnRecipient(options));
      stream = await cipher.encrypt(file.stream());
    } else {
      const cipher = new Decrypter();
      cipher.addIdentity(new webauthn.WebAuthnIdentity(options));
      stream = await cipher.decrypt(file.stream());
    }
    status.textContent = 'Wait until the file operation is complete.';
    await saveStream(stream, output);
    return `The output file is saved: ${output.name}`;
  });
}

window.addEventListener('beforeunload', event => {
  if (busy || (identity && !identityFile)) event.preventDefault();
});

if (!window.isSecureContext || !window.PublicKeyCredential
  || !window.showOpenFilePicker || !window.showSaveFilePicker) {
  controls.disabled = true;
  status.textContent = 'Open this page in current desktop Chrome. Use HTTPS or localhost.';
}
