import { Connection } from "@solana/web3.js";

const DEX_PROGRAM_IDS = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
  PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY: "Phoenix",
  MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky: "Meteora",
  TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM: "Tensor",
  "27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv": "Orca",
};

const hasDexActivity = (transaction) => {
  const message = transaction?.transaction?.message;
  const instructions = message?.instructions; // list of all instructions that transaction performs
  const accountKeys = message?.accountKeys; // list of all acc's transaction might ref ie.. programs, wallets

  if (!instructions || !accountKeys) return [];

  const programIndices = instructions.map(
    (ix) => accountKeys[ix.programIdIndex].toString() //getting dex_program_id
  );

  const usedDexes = new Set();
  for (const programId of programIndices) {
    if (DEX_PROGRAM_IDS[programId]) {
      usedDexes.add(DEX_PROGRAM_IDS[programId]);
    }
  }

  return Array.from(usedDexes);
};

export const getDexTransactions = async () => {
  const connection = new Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const currentSlot = await connection.getSlot();
  console.log("Current slot:", currentSlot);

  const startSlot = currentSlot - 1;
  const endSlot = currentSlot;

  const dexTransactions = [];

  try {
    for (let slot = startSlot; slot <= endSlot; slot++) {
      const block = await connection.getBlock(slot, {
        commitment: "confirmed",
        rewards: false,
        maxSupportedTransactionVersion: 0,
      });

      if (block && block.transactions) {
        console.log(`\nBlock at slot ${slot}:`);

        for (const tx of block.transactions) {
          const dexesUsed = hasDexActivity(tx);
          if (dexesUsed.length > 0) {
            dexTransactions.push({
                slot,
                signature: tx.transaction.signatures[0],
                dexesUsed,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  return dexTransactions;
};
