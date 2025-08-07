export const getInitiatorWallet = (transaction) => {
    return transaction?.transaction?.message?.accountKeys?.[0]?.toString();
};