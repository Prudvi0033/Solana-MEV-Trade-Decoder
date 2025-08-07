import { Connection } from "@solana/web3.js";

export const getAnalyzedDexTransactions = async () => {
  const connection = new Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const currentSlot = await connection.getSlot();
  console.log("Current slot:", currentSlot);

  const startSlot = currentSlot - 1;
  const endSlot = currentSlot;

  const analyzedTransactions = [];

  try {
    for (let slot = startSlot; slot <= endSlot; slot++) {
      console.log(`Fetching block ${slot}`);
      
      const block = await connection.getBlock(slot, {
        commitment: "confirmed",
        rewards: false,
        maxSupportedTransactionVersion: 0,
      });

      if (block && block.transactions) {
        console.log(`Found ${block.transactions.length} transactions in slot ${slot}`);

        let dexCount = 0;
        for (const tx of block.transactions) {
          const dexesUsed = hasDexActivity(tx);
          if (dexesUsed.length > 0) {
            dexTransactions.push(dexesUsed);
            dexCount++;
          }
        }

        console.log(`${dexCount} DEX transactions found`);
        
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  return analyzedTransactions;
};


//we are getting mutiple transations because there are many people transacting by the those slots so even tho we are only checking for two slots we are getting many transactions