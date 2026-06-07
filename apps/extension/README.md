# Auction Tracker — Browser Extension

WXT + React browser extension (Chrome MV3).

## Development

From the repo root:

```bash
pnpm install
pnpm --filter @dvl/extension dev   # or: turbo dev
pnpm --filter @dvl/extension build
```

## Pinned extension ID

The extension ID is deterministic and must not change — the Step 7 OAuth redirect URI is baked to it.

| | Value |
|---|---|
| **Extension ID** | `bjicpagnabmhmkodglkgjcpdklngdmgo` |
| **OAuth redirect URI** (Step 7) | `https://bjicpagnabmhmkodglkgjcpdklngdmgo.chromiumapp.org/` |

The manifest `key` in `wxt.config.ts` is the **public key** (safe to commit).
The private key lives in `extension.pem` — this file is gitignored. Keep a copy somewhere safe (e.g. 1Password).

### Re-deriving the ID from extension.pem

```bash
node -e "
const {execSync} = require('child_process');
const {createHash} = require('crypto');
const der = execSync('openssl rsa -in extension.pem -pubout -outform DER 2>/dev/null');
const id = [...createHash('sha256').update(der).digest('hex').slice(0,32)]
  .map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
console.log('Extension ID:', id);
"
```

### Regenerating the manifest key

```bash
openssl rsa -in extension.pem -pubout -outform DER 2>/dev/null | openssl base64 -A
```

Paste the output into `wxt.config.ts` under `manifest.key`.
