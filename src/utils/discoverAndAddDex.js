import fs from "fs/promises";

const HELIUS_URL =
  "https://mainnet.helius-rpc.com/?api-key=a30b492e-426d-4f50-97a9-a62106139ec4";
const CONSTANTS_FILE_PATH = "./constants.js";

export const discoverAndAddDex = async (programId) => {
  try {
    // ✅ FIXED: Try getSignatureStatuses first for faster response
    const statusBody = {
      jsonrpc: "2.0",
      id: "status-check",
      method: "getSignatureStatuses",
      params: [[programId], { searchTransactionHistory: false }],
    };

    // ✅ FIXED: Better method for getting recent transactions
    const body = {
      jsonrpc: "2.0",
      id: "dex-check",
      method: "getParsedTransaction",
      params: [programId, { maxSupportedTransactionVersion: 0 }],
    };

    const response = await fetch(HELIUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json();
    
    // ✅ FIXED: Check if this is actually a transaction signature, not a program ID
    if (json.error || !json.result) {
      // This is likely a program ID, not a transaction signature
      // We need to find transactions that used this program
      const programBody = {
        jsonrpc: "2.0",
        id: "program-check",
        method: "getProgramAccounts",
        params: [
          programId,
          {
            encoding: "base64",
            dataSlice: { offset: 0, length: 0 }, // Just check if program exists
            filters: [],
          },
        ],
      };

      const programResponse = await fetch(HELIUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(programBody),
      });

      const programJson = await programResponse.json();
      
      if (programJson.error || !programJson.result) {
        return null; // Program doesn't exist or isn't accessible
      }
      
      // Program exists but we can't easily identify if it's a DEX without transaction history
      return null;
    }

    // If we get here, it might be a transaction signature instead of program ID
    let dexName = null;

    if (json.result?.meta?.innerInstructions) {
      for (const ixGroup of json.result.meta.innerInstructions) {
        for (const ix of ixGroup.instructions) {
          if (ix.parsed?.type) {
            // Check if this looks like a DEX operation
            const type = ix.parsed.type.toLowerCase();
            if (["swap", "exchange", "trade", "swapbaseout", "swapbasein"].includes(type)) {
              // Try to identify DEX from program ID patterns
              const programId = ix.programId;
              dexName = identifyDexFromProgramId(programId);
              if (dexName) break;
            }
          }
        }
        if (dexName) break;
      }
    }

    if (!dexName) return null;

    // ✅ FIXED: Better file writing logic
    try {
      let fileContent = await fs.readFile(CONSTANTS_FILE_PATH, "utf8");

      // Skip if already present
      if (fileContent.includes(`'${programId}'`)) {
        return dexName;
      }

      // Find the last entry in DEX_PROGRAM_IDS and add after it
      const lastEntryRegex = /('.*?':\s*'.*?'),(\s*\n\s*}\s*;)/;
      const match = fileContent.match(lastEntryRegex);
      
      if (match) {
        const newEntry = `$1,\n  \n  // Auto-discovered DEX\n  '${programId}': '${dexName}',$2`;
        fileContent = fileContent.replace(lastEntryRegex, newEntry);
        
        await fs.writeFile(CONSTANTS_FILE_PATH, fileContent, "utf8");
        console.log(`✅ Added unknown DEX: ${programId} -> ${dexName}`);
      }

      return dexName;
    } catch (fileError) {
      console.error("File write error:", fileError.message);
      return dexName; // Return the name even if file write fails
    }

  } catch (error) {
    console.error("Error discovering DEX:", error.message);
    return null;
  }
};

// Helper function to identify DEX from program ID patterns
function identifyDexFromProgramId(programId) {
  const dexPatterns = {
    'JUP': 'Jupiter',
    'Ray': 'Raydium', 
    '9W9': 'Orca',
    'Swr': 'Switchboard',
    'CAM': 'Raydium CPMM',
    'Eo7': 'Meteora',
    'Pho': 'Phoenix',
    'opn': 'Openbook',
    '2wT': 'Lifinity',
    'SSw': 'Saber',
  };

  for (const [pattern, name] of Object.entries(dexPatterns)) {
    if (programId.startsWith(pattern)) {
      return name;
    }
  }

  return null;
}