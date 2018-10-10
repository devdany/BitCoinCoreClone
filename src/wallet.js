const elliptic = require('elliptic');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const transactions = require('./transaction');

const {getPublicKey, getTxid, signTxIn, TxIn, Transaction, TxOut} = transactions;

const ec = new elliptic.ec('secp256k1');

const privateKeyLocation = path.join(__dirname, "privateKey");

const generatePrivateKey = () => {
    const keyPair = ec.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
}

const getPrivateFromWallet = () => {
    const buffer = fs.readFileSync(privateKeyLocation, "utf8");
    return buffer.toString();
};

const getPublicFromWallet = () => {
    const privateKey = getPrivateFromWallet();
    const key = ec.keyFromPrivate(privateKey, "hex");
    return key.getPublic().encode("hex");
}

const getBalance = (address, uTxOuts) => {


    const balance = _(uTxOuts)
        .filter(uTxO => uTxO.address === address)
        .map(uTxO =>{
            console.log(uTxO);
            return uTxO.amount
        })
        .sum();


    return balance;
}

const initWallet = () => {
    if(fs.existsSync(privateKeyLocation)){
        return;
    }
    const newPrivateKey = generatePrivateKey();

    fs.writeFile(privateKeyLocation, newPrivateKey, (err) => {
        if(err){
            console.log(err);
        }
    });
}

const findAmountInUTxOuts = (amountNeeded, myUTxOuts) => {
    let currentAmount = 0;
    const includedUTxOuts = [];


    for(const myUtxOut of myUTxOuts){
        includedUTxOuts.push(myUtxOut);
        currentAmount = currentAmount + myUtxOut.amount;

        if(currentAmount >= amountNeeded){
            const leftOverAmount = currentAmount - amountNeeded
            return {includedUTxOuts, leftOverAmount}
        }
    }
    throw Error('not enough founds');
    return false;
}

const createTxOuts = (receiverAddress, myAddress, amount, leftOverAmount) => {
    const receiverTxOut = new TxOut(receiverAddress, Number(amount));

    if(leftOverAmount ===0) {
        return [receiverTxOut]
    }else {
        const leftOverTxOut = new TxOut(myAddress, leftOverAmount);

        return [receiverTxOut, leftOverTxOut]
    }
}
/*
const filterUTxOutsFromMemPool = (uTxOutList, memPool) => {
    const txIns = _(memPool).map(tx => tx.txIns).flatten().value();

    const removables = [];

    for(const uTxOut of uTxOutList){
        const txIn = _.find(txIns, txIn => txIn.txOutIndex === uTxOut.txOutIndex && txIn.txOutId === uTxOut.txOutId);

        if(txIn !== undefined){
            removables.push(uTxOut);
        }
    }

    return _.without(uTxOutList, ...removables)
}*/

const filterUTxOutsFromMempool = (uTxOutList, mempool) => {
    const txIns = _(mempool)
        .map(tx => tx.txIns)
        .flatten()
        .value();
    const removables = [];

    for (const uTxOut of uTxOutList) {
        const txIn = _.find(
            txIns,
            txIn =>
                txIn.txOutIndex === uTxOut.txOutIndex && txIn.txOutId === uTxOut.txOutId
        );
        if (txIn !== undefined) {
            removables.push(uTxOut);
        }
    }
    return _.without(uTxOutList, ...removables);
};

const createTx = (receiverAddress, amount, privateKey, uTxOutList, memPool) => {
    const myAddress = getPublicKey(privateKey);

    amount = Number(amount);

    const myUTxOuts = uTxOutList.filter(uTxO => uTxO.address === myAddress);


    const filteredUTxOuts = filterUTxOutsFromMempool(myUTxOuts, memPool);

    const {includedUTxOuts, leftOverAmount} = findAmountInUTxOuts(amount, filteredUTxOuts);

    const toUnsignedTxIn = uTxOut => {
        const txIn = new TxIn();
        txIn.txOutId = uTxOut.txOutId;
        txIn.txOutIndex = uTxOut.txOutIndex;
        return txIn;
    }

    const unsignedTxIns = includedUTxOuts.map(toUnsignedTxIn);



    const tx = new Transaction();
    tx.txIns = unsignedTxIns;
    tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);
    tx.id = getTxid(tx);


    tx.txIns= tx.txIns.map((txIn, index) => {
        txIn.signature = signTxIn(tx, index, privateKey, uTxOutList);
        return txIn;
    });

    return tx;
}



module.exports = {
    initWallet,
    getBalance,
    getPublicFromWallet,
    createTx,
    getPrivateFromWallet
}