# CAD reader build files

The generated JavaScript and TypeScript declarations accompany the exact rebuilt
GFD Studio E WebAssembly reader. Its bytes are stored as deterministic gzip parts
of at most 384 KiB with per-part, combined-stream and uncompressed SHA-256 checksums.

`npm ci` restores the ignored `gfde_cad_reader_bg.wasm` through `postinstall`.
`npm run build` and `npm run build:cli` also verify and restore it before building.
These steps use Node's built-in modules only; no Rust toolchain or asset download
is needed. If install scripts were disabled, run `node scripts/prepare-cad.mjs`.
Missing or corrupt parts fail preparation before replacing an existing reader.
The packaged app carries the restored WebAssembly; compressed source parts are excluded.

For an engine change, run `npm run build:cad` with the Rust target and wasm-bindgen
version documented in `scripts/build-cad.sh`. After compilation and binding generation
succeed, that command regenerates the parts and manifest. Commit them with the generated
JavaScript and declarations. Do not edit compressed parts or checksums manually.

The initial GFD reader is 4,856,791 bytes, SHA-256
`84aee58758154917dc2b1c7161a885b88503721fd6f317ca9f9875b279b4647f`.
