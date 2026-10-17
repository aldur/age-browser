# age-browser

Encrypt and decrypt files in Chrome through [age-encryption][0] for
cryptography and WebAuthn.

## Prepare the security key

1. Connect your YubiKey.
2. Select **Create identity**.
3. Select your physical security key in the Chrome prompt.
4. Complete the PIN and touch prompts.
5. Select **Save identity**.
6. Keep a separate copy of the identity file.

Use a YubiKey, not a password manager or a platform passkey.

The identity file contains credential metadata and does not contain a secret.
The identity file, original security key, and PIN are sufficient for decryption
when you approve the key's touch prompt. A security-key reset will prevent
decryption.

## Encrypt or decrypt a file

1. If necessary, select **Load identity** to load the saved identity file.
2. Select **Select input file**.
3. Select **Encrypt file** or **Decrypt file**.
4. Select the output file location.
5. Complete the Chrome security-key prompt.
6. Keep the tab open until the tool reports that it saved the output file.

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

[0]: https://github.com/FiloSottile/typage
[1]: https://github.com/FiloSottile/typage#age-plugin-fido2prf
