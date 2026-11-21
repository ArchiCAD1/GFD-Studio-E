#!/usr/bin/env bash
# Builds the built-in DWG / DXF reader (engines/cad-reader, acadrust) to WebAssembly into electron/cad (packaged with the
# desktop app, and inlined into the CLI).
# Needs Rust with the wasm32-unknown-unknown target and wasm-bindgen-cli at the version pinned in Cargo.toml:
#   rustup target add wasm32-unknown-unknown && cargo install wasm-bindgen-cli --version 0.2.129 --locked
set -euo pipefail
cd "$(dirname "$0")/.."
GFDE_CARGO_DIR="${CARGO_HOME:-$HOME/.cargo}"
GFDE_RUSTUP_DIR="${RUSTUP_HOME:-$HOME/.rustup}"
export PATH="$GFDE_CARGO_DIR/bin:$PATH"
# Keep local folders (home, registry, checkout) out of the WebAssembly's panic messages (privacy check);
# the most specific prefix comes last, because the last match wins.
export RUSTFLAGS="--remap-path-prefix=$HOME=/build --remap-path-prefix=$GFDE_RUSTUP_DIR=/rustup --remap-path-prefix=$GFDE_CARGO_DIR/registry/src=/cargo --remap-path-prefix=$PWD=/gfde"
cargo build --locked --release --target wasm32-unknown-unknown --manifest-path engines/cad-reader/Cargo.toml
wasm-bindgen --target web --out-dir "${GFDE_CAD_OUT_DIR:-electron/cad}" \
  engines/cad-reader/target/wasm32-unknown-unknown/release/gfde_cad_reader.wasm
node scripts/prepare-cad.mjs --pack "${GFDE_CAD_OUT_DIR:-electron/cad}"
