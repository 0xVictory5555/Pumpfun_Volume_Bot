import bs58 from "bs58";
import axios from "axios";

export const endpoints = {
  // ams: "https://amsterdam.mainnet.block-engine.jito.wtf",
  // ger: "https://frankfurt.mainnet.block-engine.jito.wtf",
  // ny: "https://ny.mainnet.block-engine.jito.wtf",
  // tokyo: "https://tokyo.mainnet.block-engine.jito.wtf",
  default: "https://mainnet.block-engine.jito.wtf",
};

type Region = "ams" | "ger" | "ny" | "tokyo"; // "default" |
const regions = ["ams", "ger", "ny", "tokyo"] as Region[]; // "default",
let idx = 0;

const MAX_CHECK_JITO = 40;
const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time));
export const tipAccounts = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export class JitoBundleService {
  endpoint: string;

  constructor() {
    idx = (idx + 1) % regions.length;
    const _region = regions[idx];
    // this.endpoint = endpoints[_region];
    this.endpoint = endpoints.default;
  }

  // updateRegion() {
  //   idx = (idx + 1) % regions.length;
  //   const _region = regions[idx];
  //   this.endpoint = endpoints[_region];
  // }
  async sendBundle(rawTxns: Uint8Array[]) {
    const encodedTxns = rawTxns.map(raw => Buffer.from(raw).toString('base64'));
    // return;
    const jitoURL = `${this.endpoint}/api/v1/bundles`;
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [
        encodedTxns,
        {
          "encoding": "base64"
        }
      ],
    };

    try {
      const response = await axios.post(jitoURL, payload, {
        headers: { "Content-Type": "application/json" },
      });
      return response.data.result;
    } catch (error) {
      console.error("cannot send!:", error);
      return null;
    }
  }

  async getBundleStatus(bundleId: string) {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "getBundleStatuses",
      params: [[bundleId]],
    };

    let retries = 0;
    while (retries < MAX_CHECK_JITO) {
      try {
        retries++;
        // this.updateRegion();
        const jitoURL = `${this.endpoint}/api/v1/bundles`;

        const response = await axios.post(jitoURL, payload, {
          headers: { "Content-Type": "application/json" },
        });

        if (!response || response.data.result.value.length <= 0) {
          await wait(1000);
          continue;
        }

        const bundleResult = response.data.result.value[0];
        if (
          bundleResult.confirmation_status === "confirmed" ||
          bundleResult.confirmation_status === "finalized"
        ) {
          retries = 0;
          break;
        }
        break;
      } catch (error) {
        break;
        console.error("GetBundleStatus Failed");
      }

    }
    if (retries === 0) {
      console.log(
        `✨ Bundle confirmed\n https://explorer.jito.wtf/bundle/${bundleId}`
      );
      return true;
    }
    console.log(
      `⚠️ Bundle failed\n https://explorer.jito.wtf/bundle/${bundleId}`
    );
    return false;
  }
}
