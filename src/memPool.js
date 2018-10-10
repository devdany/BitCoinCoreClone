const _ = require('lodash');
const Transaction = require('./transaction');

const {validateTx} = Transaction;

let memPool = [];

const getMemPool = () => _.cloneDeep(memPool);

const getTxInsInPool = memPool => {
    return _(memPool)
        .map(tx => tx.txIns)
        .flatten()
        .value()
}

const isTxValidForPool = (tx, memPool) => {
    const txInsInPool = getTxInsInPool(memPool);

    const isTxInAlreadyInPool = (txIns, txIn) => {
       return _.find(txIns, txInInPool => {
           return (
               txIn.txOutIndex === txInInPool.txOutIndex && txIn.txOutId === txInInPool.txOutId

           )
       })
    }


    for(const txIn of tx.txIns){
        if(isTxInAlreadyInPool(txInsInPool, txIn)){
            return false;
        }
    }

    return true;
}

const updateMempool = uTxOutList => {
    const invalidTx = [];

    for(const tx of memPool){
        for(const txIn of tx.txIns) {
            if(!hasTxIn(txIn, uTxOutList)){
                invalidTx.push(tx);
                break;
            }
        }
    }

    if(invalidTx.length > 0){
        memPool = _.without(memPool, ... invalidTx);
    }
}

const hasTxIn = (txIn, uTxOutList) => {
    const foundTxIn = uTxOutList.find(uTxO => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex);

    return foundTxIn !== undefined;
}

const addToMemPool = (tx, uTxOutList) => {
    if(!validateTx(tx, uTxOutList)){
        throw Error('This tx is invalid')
    }else if(!isTxValidForPool(tx, memPool)){
        throw Error('This tx is invalid for memPool')
    }
    memPool.push(tx);

}

module.exports = {
    addToMemPool,
    getMemPool,
    updateMempool
}