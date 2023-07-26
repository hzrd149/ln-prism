# ln-prism

## 1.0.0

### Major Changes

- 03a93da: Move payout logic onto Target class

### Minor Changes

- b06e2a6: Add retry failed button
- 64280de: Add QRCode scanner
- ee76f8b: Handle expired invoices correctly
- 9a2132a: Add fancy charts

## 0.1.0

### Minor Changes

- 182b0c0: Support splitting zaps to npubs
- c546c3b: Only keep the last 10 fees per address
- 182b0c0: Add support for paying npub
- 78373d3: Add api keys for updating / deleting splits
- a199c06: Publish zap receipts
- a4ee467: Add split edit view

### Patch Changes

- d6a2fb8: Fix description hash bug with IBEXHub backend
- c546c3b: Fix IBEX invoice pay fee always being 0
- 12f6236: Default DB_PATH to ./splits.json
