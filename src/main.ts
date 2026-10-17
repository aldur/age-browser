import { Encrypter, Decrypter, webauthn } from 'age-encryption';
import { saveStream } from './save.ts';

const controls = document.querySelector<HTMLFieldSetElement>('#controls')!;
const identityList = document.querySelector<HTMLUListElement>('#identities')!;
const decryptIdentity = document.querySelector<HTMLSelectElement>('#decrypt-identity')!;
const keyPrompt = document.querySelector<HTMLDialogElement>('#key-prompt')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
type Mode = 'encrypt' | 'decrypt';
const identities: { value: string; file: FileSystemFileHandle }[] = [];
const inputs: Partial<Record<Mode, FileSystemFileHandle>> = {};
let pendingIdentity = '';
let busy = false;

function update(): void {
  const selected = decryptIdentity.value;
  identityList.replaceChildren();
  decryptIdentity.replaceChildren();
  for (const identity of identities) {
    const item = document.createElement('li');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${identity.file.name}`);
    remove.onclick = () => {
      identities.splice(identities.indexOf(identity), 1);
      update();
      document.querySelector('#identity-status')!.textContent = '';
      button(pendingIdentity ? 'save' : 'load').focus();
    };
    item.append(identity.file.name, ' ', remove);
    identityList.append(item);
    decryptIdentity.add(new Option(identity.file.name, identity.value));
  }
  if (identities.some(identity => identity.value === selected)) decryptIdentity.value = selected;
  decryptIdentity.disabled = identities.length === 0;
  document.querySelector('#no-identities')!.toggleAttribute('hidden', identities.length > 0);
  document.querySelector('#pending-identity')!.toggleAttribute('hidden', !pendingIdentity);
  button('create').disabled = button('load').disabled = !!pendingIdentity;
  button('save').disabled = !pendingIdentity;
  for (const mode of ['encrypt', 'decrypt'] as const) {
    button(mode).disabled = !identities.length || !inputs[mode] || !!pendingIdentity;
  }
}

function action(id: string, task: (status: HTMLParagraphElement) => Promise<string>): void {
  const control = button(id);
  const status = control.closest('section')!.querySelector<HTMLParagraphElement>('[role="status"]')!;
  control.onclick = async () => {
    busy = true;
    controls.disabled = true;
    status.textContent = 'Complete the file or security-key prompt.';
    try {
      status.textContent = await task(status);
    } catch (error) {
      status.textContent = error instanceof DOMException && ['AbortError', 'NotAllowedError'].includes(error.name)
        ? 'The operation stopped. The tool did not save an output file.'
        : `The operation failed. ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
      controls.disabled = false;
      update();
      (control.disabled ? button(pendingIdentity ? 'save' : 'load') : control).focus();
    }
  };
}

async function checkOutput(output: FileSystemFileHandle): Promise<void> {
  for (const file of [...identities.map(identity => identity.file), ...Object.values(inputs)]) {
    if (await output.isSameEntry(file)) {
      throw new Error('Select an output file that is different from the input files and identity files.');
    }
  }
}

function connectKey(name: string, step: string): Promise<void> {
  document.querySelector('#key-step')!.textContent = step;
  document.querySelector('#key-name')!.textContent = `Connect the key for ${name}.`;
  keyPrompt.returnValue = '';
  return new Promise((resolve, reject) => {
    keyPrompt.onclose = () => keyPrompt.returnValue === 'continue'
      ? resolve()
      : reject(new DOMException('The key prompt was cancelled.', 'AbortError'));
    keyPrompt.showModal();
  });
}

action('create', async () => {
  pendingIdentity = await webauthn.createCredential({ type: 'security-key', keyName: 'age file encryption' });
  return 'The identity is ready. Select Save identity.';
});

action('save', async () => {
  const file = await showSaveFilePicker({ suggestedName: 'age-yubikey.txt' });
  await checkOutput(file);
  await saveStream(new Blob([pendingIdentity + '\n']).stream(), file);
  identities.push({ value: pendingIdentity, file });
  pendingIdentity = '';
  return 'The identity file is saved. Keep a separate copy.';
});

action('load', async () => {
  const files = await showOpenFilePicker({ multiple: true });
  const loaded = [];
  for (const handle of files) {
    const file = await handle.getFile();
    if (file.size > 16384) throw new Error(`${file.name}: The identity file is too large. The limit is 16 KiB.`);
    const lines = (await file.text()).split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (lines.length !== 1) throw new Error(`${file.name}: The file must contain one hardware identity.`);
    new webauthn.WebAuthnIdentity({ identity: lines[0] });
    if (![...identities, ...loaded].some(identity => identity.value === lines[0])) {
      loaded.push({ value: lines[0], file: handle });
    }
  }
  identities.push(...loaded);
  return 'The identities are ready. Select Encrypt a file or Decrypt a file.';
});

for (const mode of ['encrypt', 'decrypt'] as const) {
  action(`${mode}-input`, async () => {
    const [file] = await showOpenFilePicker();
    inputs[mode] = file;
    document.querySelector(`#${mode}-file`)!.textContent = file.name;
    return `The input file is ready. Select ${mode === 'encrypt' ? 'Encrypt' : 'Decrypt'} and save.`;
  });

  action(mode, async status => {
    const input = inputs[mode]!;
    const name = mode === 'encrypt' ? `${input.name}.age` : input.name.replace(/\.age$/, '') + '.decrypted';
    const output = await showSaveFilePicker({ suggestedName: name });
    await checkOutput(output);
    const file = await input.getFile();
    let stream: ReadableStream<Uint8Array>;
    if (mode === 'encrypt') {
      const cipher = new Encrypter();
      for (const [index, identity] of identities.entries()) {
        const recipient = new webauthn.WebAuthnRecipient({ identity: identity.value });
        cipher.addRecipient({
          async wrapFileKey(fileKey) {
            await connectKey(identity.file.name, `Encryption key ${index + 1} of ${identities.length}`);
            status.textContent = `Complete the Chrome prompt for ${identity.file.name}.`;
            return recipient.wrapFileKey(fileKey);
          },
        });
      }
      stream = await cipher.encrypt(file.stream());
    } else {
      const identity = identities.find(identity => identity.value === decryptIdentity.value)!;
      await connectKey(identity.file.name, 'Decryption key');
      status.textContent = `Complete the Chrome prompt for ${identity.file.name}.`;
      const cipher = new Decrypter();
      cipher.addIdentity(new webauthn.WebAuthnIdentity({ identity: identity.value }));
      stream = await cipher.decrypt(file.stream());
    }
    status.textContent = 'Wait until the file operation is complete.';
    await saveStream(stream, output);
    return `The output file is saved: ${output.name}`;
  });
}

window.addEventListener('beforeunload', event => {
  if (busy || pendingIdentity) event.preventDefault();
});

update();
if (!window.isSecureContext || !window.PublicKeyCredential
  || !window.showOpenFilePicker || !window.showSaveFilePicker) {
  controls.disabled = true;
  document.querySelector('#identity-status')!.textContent = 'Open this page in current desktop Chrome. Use HTTPS or localhost.';
}
