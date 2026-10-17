{
  lib,
  stdenvNoCC,
  fetchPnpmDeps,
  pnpm_10,
  pnpmConfigHook,
  nodejs,
  typescript,
  esbuild,
  age,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "age-browser";
  version = "0.1.0";
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./pnpm-lock.yaml
      ./tsconfig.json
      ./index.html
      ./src
      ./test
    ];
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    hash = "sha256-ZBfbjz3tva1gdtqEOR49B3kkaWsKl5fvY5JkToA+iC0=";
  };
  nativeBuildInputs = [
    nodejs
    pnpm_10
    pnpmConfigHook
    typescript
    esbuild
  ];
  nativeCheckInputs = [ age ];
  doCheck = true;

  buildPhase = ''
    runHook preBuild
    tsc
    esbuild src/main.ts --bundle --format=esm --platform=browser --target=es2023 --outfile=dist/main.js
    cp index.html src/style.css dist/
    runHook postBuild
  '';
  checkPhase = ''
    runHook preCheck
    pnpm test
    runHook postCheck
  '';
  installPhase = ''
    runHook preInstall
    cp -r dist "$out"
    runHook postInstall
  '';
})
