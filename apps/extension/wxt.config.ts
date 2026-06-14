import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Auction Tracker',
    description: 'Track saved auctions across eBay, GovDeals, and more in a unified dashboard.',
    // `identity` powers chrome.identity.launchWebAuthFlow for Google sign-in (step 7).
    permissions: ['identity'],
    // Public key derived from extension.pem (private key NOT committed).
    // Pins the extension ID to: bjicpagnabmhmkodglkgjcpdklngdmgo
    // Step 7 OAuth redirect URI: https://bjicpagnabmhmkodglkgjcpdklngdmgo.chromiumapp.org/
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy/4s61+YXLuBNS5MX036++DMFmmTC2fj+RFxyYSCx2Rsuu2I4B5AnlV76NMigtJddGex2pIlrOHophr0A3nt2X5jJCLG2dxLZ1AwieeKJbAskV6AW4njmchK5kmAAYQ84YUqz4xKRlMtekOL2LwfssNKFxUyxfjZHSJhmYw2/gU4UF0AedCLZ+ToT8CpknqFn2HqejmpLr6qi0dMnAaROyqRLAYM6OYpYEyT6oUvpAEkK0LeURGulGp5vRdcvtZxm9u3vGTuk4pbZyZhsGhF0v8BRlHTj5z2gOHyD84NbDL8J9AxO8v393C88NFirA/OfeTBj0sj+YoRriMsSqUGlQIDAQAB',
  },
});
