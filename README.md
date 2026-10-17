# age-browser

Encrypt and decrypt files in Chrome through [age-encryption][0] for
cryptography and WebAuthn.

Open the online tool in desktop Chrome. File contents stay in the browser.

## Prepare the security key

1. Connect your YubiKey.
2. Open **Create an identity for a new key**. Select **Create identity**.
3. Select your physical security key in the Chrome prompt.
4. Complete the PIN and touch prompts.
5. Select **Save identity**.
6. Keep a separate copy of the identity file.

Give each identity file a name that identifies its key. Repeat these steps for
each additional key. Create all identities on the hostname where you will use
this tool.

Use a YubiKey, not a password manager or a platform passkey.

The identity file contains credential metadata and does not contain a secret.
The identity file, original security key, and PIN are sufficient for decryption
when you approve the key's touch prompt. A security-key reset will prevent
decryption.

## Encrypt a file

1. Select **Load identity files**. Select one or more saved identity files.
2. Check the list. Use **Remove** to exclude an identity.
3. In **Encrypt a file**, select **Select file to encrypt**, then **Encrypt and save**.
4. Select the output file location.
5. Connect the key named in each dialog. Select **Continue** and complete the Chrome prompt.
6. Keep the tab open until the tool reports that it saved the output file.

The tool encrypts one file for all listed identities.
You must approve every selected key. Cancelling any prompt stops the operation.
Any one selected key can decrypt the output with its identity file and PIN.

## Decrypt a file

1. Select **Load identity files** to load an identity used to encrypt the file.
2. In **Decrypt a file**, select that identity from the list.
3. Select **Select file to decrypt**, then **Decrypt and save**.
4. Select the output file location.
5. Connect the named key. Select **Continue** and complete the Chrome prompts.
6. Keep the tab open until the tool reports that it saved the output file.

Only one key is required. Chrome can request that key more than once when a
file has multiple recipients.

This tool processes file data as a stream and does not load the complete file
into memory. Chrome writes to a temporary file before it replaces the output
file. If authentication fails, Chrome does not save the partial output. A
failed operation can leave a new, empty file at the selected location.

Use binary age files with this tool. It does not support password encryption,
ASCII armor, or PIV identities. WebAuthn PRF support depends on the browser and
the security key. The upstream WebAuthn API is experimental.

## Check decryption

First, use a small test file. Encrypt the file with this tool. Reload the page.
Load the saved identity file. Decrypt the encrypted file. Compare the result
with the original file.

For a separate CLI check, install age and upstream's [age-plugin-fido2prf][1].
Connect the same security key. Run:

```sh
age -d -i age-yubikey.txt -o recovered.txt sample.txt.age
cmp sample.txt recovered.txt
```

The plugin must be on `PATH`.
Keep the identity file with your recovery instructions.

## Run locally

With Nix installed, run this command from the project directory:

```sh
nix run path:.#serve
```

Open `http://localhost:8787` in desktop Chrome on the same computer.
Use `localhost`, not `127.0.0.1`. WebAuthn connects each identity to its hostname.
Localhost pages share one relying party across ports.
Only approve prompts from local pages that you trust.

The server accepts local connections only. File contents stay in the browser.
Nix builds and tests the bundle before it starts the server.
Build dependencies and generated files stay outside the working directory.

## Build and test

Run this command from the project directory:

```sh
nix build --no-link --print-out-paths path:.
```

This command checks TypeScript, builds the bundle, and runs the tests.
It prints the path to the static HTML, CSS, and JavaScript files.
The tests do not use a physical security key. Complete the decryption check above with your keys.

## GitHub Pages

The [Pages workflow](.github/workflows/pages.yml) builds and tests pushes and pull requests.
It deploys the static bundle from the default branch.
In repository settings, open **Pages** and set **Source** to **GitHub Actions**.
Push to the default branch or run the workflow manually from that branch.

Default Pages projects share the account's `github.io` origin and relying party, with HTML CSP but without `serve.nix` headers.
An identity created on localhost cannot be used on a GitHub Pages hostname.
Keep access to the original hostname or use the CLI method above to decrypt existing files.

[0]: https://github.com/FiloSottile/typage
[1]: https://github.com/FiloSottile/typage#age-plugin-fido2prf
