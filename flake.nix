{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }: {
    packages = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        age-browser = pkgs.callPackage ./. { };
      in
      {
        default = age-browser;
        serve = pkgs.callPackage ./serve.nix { inherit age-browser; };
      }
    );
  };
}
