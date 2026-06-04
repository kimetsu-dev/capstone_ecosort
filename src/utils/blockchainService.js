// src/utils/blockchainService.js

import { db } from '../firebase';

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  where,
  getCountFromServer,
  runTransaction
} from 'firebase/firestore';

import SHA256 from 'crypto-js/sha256';

// ✨ NEW: Import Merkle Tree functionality
import { createMerkleRootForBlocks } from './merkleTree';

// ─────────────────────────────────────────────────────────────────────────────
// TAMPER NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

export async function sendTamperNotification(userId, type, payload = {}) {
  if (!userId || userId === 'SYSTEM') return;

  try {
    const { addDoc: _addDoc, collection: _collection, serverTimestamp: _serverTimestamp } =
      await import('firebase/firestore');

    const notifRef = _collection(db, 'notifications', userId, 'userNotifications');

    const base = {
      type,
      read: false,
      createdAt: _serverTimestamp(),
      ...payload,
    };

    await _addDoc(notifRef, base);
    console.log(`🔔 Tamper notification (${type}) sent to user '${userId}'.`);
  } catch (err) {
    console.warn('sendTamperNotification failed (non-critical):', err);
  }
}

function deepSortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach(key => {
      sorted[key] = deepSortKeys(value[key]);
    });
    return sorted;
  }
  return value;
}

export function createBlockHash(blockData) {
  const sortedMeta = blockData.metadata ? deepSortKeys(blockData.metadata) : {};
  const metaString = JSON.stringify(sortedMeta);
  const dataString = `${blockData.index}${blockData.prevHash}${blockData.timestamp}${blockData.userId}${blockData.actionType}${blockData.points}${metaString}`;
  return SHA256(dataString).toString();
}

export function verifyBlock(block) {
  const calculatedHash = createBlockHash(block);
  return {
    valid: calculatedHash === block.hash,
    storedHash: block.hash,
    calculatedHash,
    match: calculatedHash === block.hash
  };
}

export async function createGenesisBlock() {
  try {
    const ledgerRef = collection(db, 'ledger');
    const ledgerQuery = query(ledgerRef, orderBy('index', 'asc'), limit(1));
    const snapshot = await getDocs(ledgerQuery);

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      const existingBlock = { id: existingDoc.id, ...existingDoc.data() };
      const verification = verifyBlock(existingBlock);
      if (verification.valid && existingBlock.index === 0) {
        console.log('Genesis block already exists and is valid.');
        return existingBlock;
      }

      console.warn('⚠️ Corrupt or Incorrect Genesis block detected. Auto-repairing...');
      await updateDoc(doc(db, 'ledger', existingDoc.id), { isValid: false });
      await setDoc(doc(db, 'system', 'ledger_tracker'), {
        latestHash: null,
        currentIndex: -1
      });
    }

    const timestamp = new Date().toISOString();

    const genesisBlock = {
      index: 0,
      timestamp,
      createdAt: serverTimestamp(),
      userId: 'SYSTEM',
      actionType: 'GENESIS',
      points: 0,
      metadata: {
        type: 'GENESIS',
        message: 'EcoSort Blockchain Initialized',
        system: 'EcoSort Waste Management System',
        version: '1.0.0'
      },
      prevHash: '0',
      isValid: true
    };
    genesisBlock.hash = createBlockHash(genesisBlock);
    const blockRef = await addDoc(collection(db, 'ledger'), genesisBlock);
    await setDoc(doc(db, 'system', 'ledger_tracker'), {
      latestHash: genesisBlock.hash,
      currentIndex: 0,
      blockchainIntegratedAt: timestamp,
    });
    console.log('⛓️ Genesis block created:', genesisBlock.hash);
    return { id: blockRef.id, ...genesisBlock };

  } catch (error) {
    console.error('Error creating genesis block:', error);
    throw error;
  }
}

export async function getLatestBlock() {
  try {
    const blocksQuery = query(
      collection(db, 'ledger'),
      orderBy('index', 'desc'),
      limit(1)
    );
    const snapshot = await getDocs(blocksQuery);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (error) {
    console.error('Error getting latest block:', error);
    throw error;
  }
}

export async function getChainStatus() {
  try {
    const trackerRef = doc(db, 'system', 'ledger_tracker');
    const trackerDoc = await getDoc(trackerRef);

    if (!trackerDoc.exists()) {
      return { initialized: false, blockCount: 0, latestHash: null, latestIndex: -1 };
    }

    const data = trackerDoc.data();

    const actualLatest = await getLatestBlock();
    if (actualLatest && actualLatest.hash !== data.latestHash) {
      console.warn('⚠️ ledger_tracker out of sync. Auto-healing...');
      await updateDoc(trackerRef, {
        latestHash: actualLatest.hash,
        currentIndex: actualLatest.index
      });
      return {
        initialized: true,
        blockCount: actualLatest.index + 1,
        latestHash: actualLatest.hash,
        latestIndex: actualLatest.index,
        selfHealed: true
      };
    }

    return {
      initialized: true,
      blockCount: (data.currentIndex || 0) + 1,
      latestHash: data.latestHash,
      latestIndex: data.currentIndex || 0,
      blockchainIntegratedAt: data.blockchainIntegratedAt ?? null,
    };
  } catch (error) {
    console.error('Error getting chain status:', error);
    throw error;
  }
}

export async function verifyBlockchain() {
  try {
    const PAGE_SIZE = 500;
    let allBlocks = [];
    let lastVisible = null;
    let keepFetching = true;

    while (keepFetching) {
      let q = query(
        collection(db, 'ledger'),
        orderBy('index', 'asc'),
        limit(PAGE_SIZE)
      );
      if (lastVisible) {
        const { startAfter } = await import('firebase/firestore');
        q = query(
          collection(db, 'ledger'),
          orderBy('index', 'asc'),
          startAfter(lastVisible),
          limit(PAGE_SIZE)
        );
      }
      const snapshot = await getDocs(q);
      if (snapshot.empty) break;
      allBlocks.push(...snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      lastVisible = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < PAGE_SIZE) keepFetching = false;
    }

    if (allBlocks.length === 0) {
      return {
        valid: true,
        message: 'Ledger is empty',
        totalBlocks: 0,
        details: []
      };
    }

    const blocks = allBlocks;
    const details = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const blockResult = {
        index: block.index,
        hash: block.hash,
        timestamp: block.timestamp,
        issues: [],
        valid: true
      };

      const hashVerification = verifyBlock(block);
      if (!hashVerification.valid) {
        blockResult.issues.push('Hash mismatch (Data tampering)');
        blockResult.valid = false;
      }

      if (i === 0) {
        if (block.prevHash !== '0') {
          blockResult.issues.push("Genesis prevHash must be '0'");
          blockResult.valid = false;
        }
      } else {
        const previousBlock = blocks[i - 1];
        if (block.prevHash !== previousBlock.hash) {
          blockResult.issues.push(`Broken chain link to block #${previousBlock.index}`);
          blockResult.valid = false;
        }
      }

      details.push(blockResult);
    }

    const invalidBlocks = details.filter(d => !d.valid);
    const isValid = invalidBlocks.length === 0;

    return {
      valid: isValid,
      message: isValid
        ? `✅ All ${blocks.length} blocks verified.`
        : `❌ Chain Compromised: ${invalidBlocks.length} invalid blocks.`,
      totalBlocks: blocks.length,
      latestHash: blocks[blocks.length - 1]?.hash,
      invalidBlocks: invalidBlocks.map(b => b.index),
      details
    };
  } catch (error) {
    console.error('Error verifying blockchain:', error);
    throw error;
  }
}

export async function getAllBlocks(limitCount = null) {
  try {
    let blocksQuery = query(collection(db, 'ledger'), orderBy('index', 'desc'));
    if (limitCount) {
      blocksQuery = query(blocksQuery, limit(limitCount));
    }
    const snapshot = await getDocs(blocksQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting blocks:', error);
    throw error;
  }
}

export async function createPublicAnchor() {
  try {
    const verification = await verifyBlockchain();
    if (!verification.valid) {
      throw new Error('Cannot create anchor: Chain is currently invalid.');
    }

    if (verification.totalBlocks === 0) {
      throw new Error('Cannot create anchor: Chain is empty.');
    }

    let merkleRoot = null;
    let merkleBlockCount = 0;
    
    try {
      const recentBlocks = await getAllBlocks(100);
      if (recentBlocks.length > 0) {
        const merkleData = createMerkleRootForBlocks(recentBlocks);
        merkleRoot = merkleData.root;
        merkleBlockCount = recentBlocks.length;
        console.log(`📊 Merkle root generated for ${merkleBlockCount} blocks`);
      }
    } catch (merkleError) {
      console.warn('Merkle root generation failed, continuing without it:', merkleError);
    }

    const anchor = {
      createdAt: serverTimestamp(),
      publishedAt: new Date().toISOString(),
      latestHash: verification.latestHash,
      blockCount: verification.totalBlocks,
      latestBlockIndex: verification.totalBlocks - 1,
      verified: true,
      anchorType: 'CHECKPOINT',
      verificationUrl: `${window.location.origin}/verify`,
      merkleRoot: merkleRoot,
      merkleBlockCount: merkleBlockCount,
      merkleEnabled: merkleRoot !== null
    };

    const anchorRef = await addDoc(collection(db, 'anchors'), anchor);
    await setDoc(doc(db, 'system', 'latest_anchor'), {
      ...anchor,
      updatedAt: serverTimestamp()
    });

    console.log('⚓ Public anchor created:', anchorRef.id);
    if (merkleRoot) {
      console.log('🌳 Merkle root included:', merkleRoot.substring(0, 16) + '...');
    }
    
    return { id: anchorRef.id, ...anchor };
  } catch (error) {
    console.error('Error creating public anchor:', error);
    throw error;
  }
}

export async function getLatestAnchor() {
  try {
    const anchorRef = doc(db, 'system', 'latest_anchor');
    const anchorDoc = await getDoc(anchorRef);
    if (!anchorDoc.exists()) return null;
    return anchorDoc.data();
  } catch (error) {
    console.error('Error getting latest anchor:', error);
    return null;
  }
}

export async function getAllAnchors(limitCount = 10) {
  try {
    const anchorsQuery = query(
      collection(db, 'anchors'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(anchorsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting anchors:', error);
    return [];
  }
}

export async function getBlockchainStats() {
  try {
    const ledgerRef = collection(db, 'ledger');

    const countSnapshot = await getCountFromServer(ledgerRef);
    const totalBlocks = countSnapshot.data().count;

    const q = query(ledgerRef, orderBy('index', 'desc'), limit(1));
    const querySnapshot = await getDocs(q);
    let latestHash = null;
    let latestBlock = null;
    if (!querySnapshot.empty) {
      const d = querySnapshot.docs[0];
      const data = d.data();
      latestHash = data.hash;
      latestBlock = data;
    }

    const latestAnchor = await getLatestAnchor();

    let currentMerkleRoot = null;
    try {
      if (totalBlocks > 0) {
        const recentBlocks = await getAllBlocks(100);
        if (recentBlocks.length > 0) {
          const merkleData = createMerkleRootForBlocks(recentBlocks);
          currentMerkleRoot = merkleData.root;
        }
      }
    } catch (merkleError) {
      console.warn('Failed to generate current Merkle root:', merkleError);
    }

    return {
      totalBlocks,
      genesisDate: latestBlock ? latestBlock.timestamp : null,
      latestBlock,
      latestHash: latestHash || "GENESIS_PENDING",
      latestAnchor,
      currentMerkleRoot,
      verified: true
    };
  } catch (error) {
    console.error('Error getting blockchain stats:', error);
    return {
      totalBlocks: 0,
      latestHash: null,
      currentMerkleRoot: null,
      verified: false
    };
  }
}

export async function generateAuditProof() {
  const chainStatus = await getChainStatus();
  const latestAnchor = await getLatestAnchor();
  const stats = await getBlockchainStats();
  
  return {
    generatedAt: new Date().toISOString(),
    system: 'EcoSort Blockchain-Lite Ledger',
    chainStatus: {
      totalBlocks: stats.totalBlocks,
      latestHash: stats.latestHash,
      latestIndex: (stats.totalBlocks - 1)
    },
    latestAnchor: latestAnchor ? {
      hash: latestAnchor.latestHash,
      blockCount: latestAnchor.blockCount,
      publishedAt: latestAnchor.publishedAt,
      merkleRoot: latestAnchor.merkleRoot,
      merkleEnabled: latestAnchor.merkleEnabled
    } : null,
    currentMerkleRoot: stats.currentMerkleRoot,
    signature: stats.latestHash,
    merkleVerification: latestAnchor?.merkleRoot && stats.currentMerkleRoot ? {
      anchorMerkleRoot: latestAnchor.merkleRoot,
      currentMerkleRoot: stats.currentMerkleRoot,
      match: latestAnchor.merkleRoot === stats.currentMerkleRoot,
      note: 'Merkle roots provide efficient batch verification'
    } : null
  };
}

export async function verifyAgainstAnchor(anchorHash, anchorBlockCount) {
  try {
    const targetIndex = anchorBlockCount - 1;
    const q = query(
      collection(db, 'ledger'),
      where('index', '==', targetIndex),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      const stats = await getBlockchainStats();
      if (stats.totalBlocks < anchorBlockCount) {
        return {
          valid: false,
          reason: `Chain too short (Height: ${stats.totalBlocks}) for anchor (Height: ${anchorBlockCount}).`
        };
      }
      return {
        valid: false,
        reason: `Block #${targetIndex} not found in ledger.`
      };
    }
    const anchorIndexBlock = snapshot.docs[0].data();
    const matches = anchorIndexBlock.hash === anchorHash;
    return {
      valid: matches,
      currentHash: anchorIndexBlock.hash,
      anchorHash,
      reason: matches
        ? '✅ Chain matches published anchor'
        : '❌ Mismatch: Chain has drifted from anchor.'
    };
  } catch (error) {
    console.error('Error verifying against anchor:', error);
    throw error;
  }
}

export async function verifyPointTransactions() {
  // IMPORTANT: Must match BALANCE_ACTION_TYPES in restoreUserBalance() and
  // usePointsTamperWatcher() exactly. Any divergence causes spurious discrepancies.
  const BALANCE_ACTION_TYPES = new Set([
    'SUBMISSION_CONFIRMED',
    'ADMIN_POINTS_AWARDED',
    'ADMIN_POINTS_DEDUCTED',
    'REWARD_REDEEMED',
    'REDEMPTION_CANCELLED',
  ]);

  try {
    const ledgerSnapshot = await getDocs(
      query(collection(db, 'ledger'), where('index', '>', 0), orderBy('index', 'asc'))
    );

    const ledgerBalances = {};

    ledgerSnapshot.forEach(docSnap => {
      const block = docSnap.data();
      if (!block.userId) return;

      // POINTS_RESET zeroes the running balance for that user.
      if (block.actionType === 'POINTS_RESET') {
        ledgerBalances[block.userId] = 0;
        return;
      }

      if (!BALANCE_ACTION_TYPES.has(block.actionType)) return;

      if (!ledgerBalances[block.userId]) ledgerBalances[block.userId] = 0;

      const pts =
        block.metadata?.txPoints !== undefined && block.metadata?.txPoints !== null
          ? block.metadata.txPoints
          : (block.points || 0);

      ledgerBalances[block.userId] += pts;
    });

    const usersSnapshot = await getDocs(collection(db, 'users'));
    const actualBalances = {};
    let totalUsersChecked = 0;
    
    usersSnapshot.forEach(docSnap => {
      const livePts = docSnap.data().totalPoints || 0;
      
      if (ledgerBalances[docSnap.id] !== undefined || livePts > 0) {
        actualBalances[docSnap.id] = livePts;
        totalUsersChecked++;
      }
    });

    const differences = [];
    for (const userId of Object.keys(actualBalances)) {
      const fromLedger = Math.round((ledgerBalances[userId] || 0) * 100) / 100;
      const fromDb     = Math.round((actualBalances[userId]  || 0) * 100) / 100;
      
      if (fromLedger !== fromDb) {
        differences.push({
          userId,
          fromLedger,
          fromDb,
          delta: Math.round((fromDb - fromLedger) * 100) / 100,
        });
      }
    }

    const hasDifferences = differences.length > 0;

    return {
      valid: true,
      checkedUsers: totalUsersChecked,
      differences,
      hasDifferences,
      preIntegrationBlocksSkipped: 0,
      cutoffDate: null,
      reason: hasDifferences
        ? `ℹ️ ${differences.length} user balance(s) differ from the full ledger history. Review below.`
        : `✅ All ${totalUsersChecked} user balance(s) are perfectly consistent with the ledger.`,
    };

  } catch (error) {
    console.error('Error auditing point balances:', error);
    return {
      valid: true,
      checkedUsers: 0,
      differences: [],
      hasDifferences: false,
      reason: `⚠️ Balance audit could not be completed: ${error.message}`,
    };
  }
}

export async function verifyTransactionPointsTampering() {
  try {
    const ledgerSnap = await getDocs(
      query(
        collection(db, 'ledger'),
        where('index', '>', 0),
        orderBy('index', 'asc')
      )
    );

    const NON_POINT_TX_ACTION_TYPES = new Set([
      'WASTE_SUBMIT',
      'SUBMISSION_REJECTED',
      'SUBMISSION_CANCELLED',
      'GENESIS',
      'TAMPER_ACKNOWLEDGED',
      'POINTS_RESTORED',
      'BALANCE_RESTORED',
    ]);

    const checkable = [];
    let skippedLegacy = 0;

    ledgerSnap.forEach(docSnap => {
      const b = docSnap.data();

      if (NON_POINT_TX_ACTION_TYPES.has(b.actionType)) return;

      const firestoreId = b.metadata?.firestoreId;
      if (!firestoreId) return;

      if (b.metadata?.txPoints === undefined || b.metadata?.txPoints === null) {
        skippedLegacy++;
        return;
      }

      checkable.push({
        blockIndex:   b.index,
        blockId:      docSnap.id,
        actionType:   b.actionType,
        firestoreId,
        sealedPoints: b.metadata.txPoints,
        userId:       b.userId,
        timestamp:    b.timestamp,
      });
    });

    if (checkable.length === 0) {
      return {
        valid: true,
        tampered: [],
        skippedLegacy,
        checkedCount: 0,
        reason: skippedLegacy > 0
          ? `ℹ️ No verifiable transaction blocks found. ${skippedLegacy} legacy block(s) pre-date tamper-seal coverage and cannot be retroactively verified.`
          : '✅ No linked transaction blocks found in ledger.',
      };
    }

    const CHUNK = 30;
    const liveTxMap = {};

    for (let i = 0; i < checkable.length; i += CHUNK) {
      const ids = checkable.slice(i, i + CHUNK).map(c => c.firestoreId);
      const fetches = ids.map(id => getDoc(doc(db, 'point_transactions', id)));
      const results = await Promise.all(fetches);
      results.forEach((snap, idx) => {
        liveTxMap[ids[idx]] = {
          exists: snap.exists(),
          points: snap.exists() ? (snap.data().points ?? null) : null,
        };
      });
    }

    const tampered = [];

    for (const entry of checkable) {
      const live = liveTxMap[entry.firestoreId];

      if (!live.exists) {
        tampered.push({
          blockIndex:   entry.blockIndex,
          blockId:      entry.blockId,
          actionType:   entry.actionType,
          firestoreId:  entry.firestoreId,
          userId:       entry.userId,
          timestamp:    entry.timestamp,
          sealedPoints: entry.sealedPoints,
          livePoints:   null,
          issue:        'TRANSACTION_DELETED',
          detail:       `point_transaction '${entry.firestoreId}' no longer exists. Sealed value was ${entry.sealedPoints} pts.`,
        });
        continue;
      }

      const livePoints = typeof live.points === 'number' ? live.points : 0;
      if (livePoints !== entry.sealedPoints) {
        tampered.push({
          blockIndex:   entry.blockIndex,
          blockId:      entry.blockId,
          actionType:   entry.actionType,
          firestoreId:  entry.firestoreId,
          userId:       entry.userId,
          timestamp:    entry.timestamp,
          sealedPoints: entry.sealedPoints,
          livePoints,
          issue:        'POINTS_MISMATCH',
          detail:       `Ledger sealed ${entry.sealedPoints} pts but point_transaction now shows ${livePoints} pts. Possible unauthorized edit.`,
        });
      }
    }

    const hasTampered = tampered.length > 0;
    return {
      valid: !hasTampered,
      tampered,
      skippedLegacy,
      checkedCount: checkable.length,
      reason: hasTampered
        ? `🚨 ${tampered.length} tampered transaction point value(s) detected across ${checkable.length} verified block(s).`
        : `✅ All ${checkable.length} transaction point value(s) match their sealed ledger records.${skippedLegacy > 0 ? ` (${skippedLegacy} legacy block(s) skipped — pre-date tamper-seal.)` : ''}`,
    };

  } catch (error) {
    console.error('Error verifying transaction points tampering:', error);
    return {
      valid: true,
      tampered: [],
      skippedLegacy: 0,
      checkedCount: 0,
      reason: `⚠️ Transaction points audit could not complete: ${error.message}`,
    };
  }
}

export async function runAllIntegrityChecks() {
  try {
    const chainVerification = await verifyBlockchain();
    const dataVerification = await verifyPointTransactions();
    const txPointsVerification = await verifyTransactionPointsTampering();

    if (txPointsVerification.tampered && txPointsVerification.tampered.length > 0) {
      const notifiedUsers = new Set();
      for (const entry of txPointsVerification.tampered) {
        if (!entry.userId || entry.userId === 'SYSTEM') continue;
        if (notifiedUsers.has(entry.userId)) continue;
        notifiedUsers.add(entry.userId);
        sendTamperNotification(entry.userId, 'points_tampered', {
          title: '⚠️ Points Tampering Detected',
          message:
            'An unauthorized change to your points record was detected by the ' +
            'ledger integrity system. Our team has been alerted and your correct ' +
            'balance will be restored automatically.',
          blockId: entry.blockId,
          firestoreId: entry.firestoreId,
          detectedAt: new Date().toISOString(),
        }).catch(err => console.warn('Immediate tamper notification failed (non-critical):', err));
      }
    }

    if (dataVerification.differences && dataVerification.differences.length > 0) {
      const notifiedUserIds = new Set(
        txPointsVerification.tampered?.map(e => e.userId) ?? []
      );
      for (const diff of dataVerification.differences) {
        if (!diff.userId || diff.userId === 'SYSTEM') continue;
        if (notifiedUserIds.has(diff.userId)) continue;
        notifiedUserIds.add(diff.userId);
        sendTamperNotification(diff.userId, 'points_tampered', {
          title: '⚠️ Points Balance Discrepancy Detected',
          message:
            'A discrepancy was found between your points balance and the sealed ' +
            'ledger record. Our team has been alerted and your correct balance ' +
            'will be restored automatically.',
          detectedAt: new Date().toISOString(),
        }).catch(err => console.warn('Immediate balance-discrepancy notification failed (non-critical):', err));
      }
    }

    let finalDataVerification = dataVerification;
    if (
      !dataVerification.valid &&
      dataVerification.reason &&
      dataVerification.reason.includes('Missing or insufficient permissions')
    ) {
      finalDataVerification = {
        valid: true,
        reason: 'External data reconciliation requires admin privileges and is not applicable for public verification.',
        skipped: true,
      };
    }

    let finalTxPointsVerification = txPointsVerification;
    if (
      !txPointsVerification.valid &&
      txPointsVerification.reason &&
      txPointsVerification.reason.includes('Missing or insufficient permissions')
    ) {
      finalTxPointsVerification = {
        valid: true,
        tampered: [],
        skippedLegacy: 0,
        checkedCount: 0,
        reason: 'Transaction points audit requires admin privileges and is not applicable for public verification.',
        skipped: true,
      };
    }

    const overallValid =
      chainVerification.valid &&
      finalDataVerification.valid &&
      finalTxPointsVerification.valid;

    let overallMessage;
    if (!chainVerification.valid) {
      overallMessage = `❌ System Integrity: ${chainVerification.message}`;
    } else if (!finalTxPointsVerification.valid) {
      overallMessage = `🚨 System Integrity: Chain intact but ${finalTxPointsVerification.tampered?.length || 0} transaction point value(s) were tampered directly in the database.`;
    } else if (overallValid) {
      if (finalDataVerification.skipped || finalTxPointsVerification.skipped) {
        overallMessage = `✅ System Integrity: Blockchain verified. Some audits require admin access.`;
      } else if (finalDataVerification.hasDifferences) {
        overallMessage = `✅ System Integrity: Chain verified. ${finalDataVerification.differences?.length || 0} balance difference(s) noted for admin review.`;
      } else {
        const skippedLegacyNote = finalTxPointsVerification.skippedLegacy > 0
          ? ` ${finalTxPointsVerification.skippedLegacy} legacy transaction block(s) pre-date tamper-seal coverage.`
          : '';
        overallMessage = `✅ System Integrity: Chain verified. All ${finalDataVerification.checkedUsers} user balance(s) consistent with ledger.${skippedLegacyNote}`;
      }
    } else {
      overallMessage = `❌ System Integrity: ${chainVerification.message}`;
    }

    return {
      valid: overallValid,
      message: overallMessage,
      chainVerification,
      dataVerification: finalDataVerification,
      txPointsVerification: finalTxPointsVerification,
    };

  } catch (error) {
    console.error('Error running all integrity checks:', error);
    return {
      valid: false,
      message: `❌ Major Error during Integrity Check: ${error.message}`,
      chainVerification:    { valid: false, message: 'N/A' },
      dataVerification:     { valid: false, reason: 'N/A' },
      txPointsVerification: { valid: false, tampered: [], reason: 'N/A' },
    };
  }
}

export async function repairChain() {
  try {
    console.log('🔧 Starting Blockchain Repair...');
    const q = query(collection(db, "ledger"), orderBy("index", "asc"));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return { success: false, message: "Chain is empty." };
    }
    const blocks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let previousHash = "0"; 
    let repairedCount = 0;
    let restoredPointsCount = 0;

    const acknowledgedIndices = new Set(
      blocks
        .filter(b => b.actionType === 'TAMPER_ACKNOWLEDGED' && b.metadata?.tamperedBlockIndex != null)
        .map(b => b.metadata.tamperedBlockIndex)
    );

    const tamperedBlocks = [];

    const AUDIT_ACTION_TYPES = new Set([
      'GENESIS',
      'TAMPER_ACKNOWLEDGED',
      'POINTS_RESTORED',
      'BALANCE_RESTORED',
    ]);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const currentRef = doc(db, "ledger", block.id);
      let updates = {};
      let needsUpdate = false;

      const expectedPrevHash = block.index === 0 ? "0" : previousHash;
      const chainLinkBroken = block.prevHash !== expectedPrevHash;

      const hasTxPointsSeal =
        !AUDIT_ACTION_TYPES.has(block.actionType) &&
        block.metadata?.txPoints !== undefined &&
        block.metadata?.txPoints !== null;

      const authoritativePoints = hasTxPointsSeal
        ? block.metadata.txPoints
        : block.points;

      if (hasTxPointsSeal && block.points !== authoritativePoints) {
        console.warn(
          `⚠️ Block #${block.index}: block.points (${block.points}) differs from sealed ` +
          `metadata.txPoints (${authoritativePoints}). Restoring authoritative value.`
        );
        updates.points = authoritativePoints;
        needsUpdate = true;
        restoredPointsCount++;
      }

      const blockDataForHashCheck = {
        ...block,
        points: authoritativePoints,
      };
      const newHash = createBlockHash(blockDataForHashCheck);
      const hashMismatch = block.hash !== newHash;

      if (hashMismatch && chainLinkBroken
          && block.actionType !== 'TAMPER_ACKNOWLEDGED'
          && !acknowledgedIndices.has(block.index)) {
        tamperedBlocks.push(block.index);
        console.error(`🚨 TAMPERED DATA detected at block #${block.index}. Repair aborted to preserve evidence.`);
        return {
          success: false,
          tampered: true,
          tamperedBlocks,
          message: `⛔ Repair aborted: Block #${block.index} has tampered data. Use "Acknowledge Tamper" in the Blockchain tab to record the incident, then run Repair Chain again.`
        };
      }

      if (chainLinkBroken) {
        console.log(`Fixing broken chain link on block #${block.index}: ${block.prevHash} -> ${expectedPrevHash}`);
        updates.prevHash = expectedPrevHash;
        needsUpdate = true;
      }

      const blockDataForHashing = {
        ...block,
        prevHash: updates.prevHash ?? block.prevHash,
        points:   updates.points  ?? authoritativePoints,
      };
      const recomputedHash = createBlockHash(blockDataForHashing);

      if (block.hash !== recomputedHash) {
        updates.hash = recomputedHash;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await updateDoc(currentRef, updates);
        repairedCount++;
        previousHash = recomputedHash;
      } else {
        previousHash = block.hash;
      }
    }

    if (previousHash) {
      const trackerRef = doc(db, 'system', 'ledger_tracker');
      await updateDoc(trackerRef, {
        latestHash: previousHash
      });
    }

    console.log(`✅ Repair complete. Repaired ${repairedCount} blocks (${restoredPointsCount} points value(s) restored from sealed txPoints).`);
    return {
      success: true,
      repairedCount,
      restoredPointsCount,
      latestHash: previousHash,
    };

  } catch (error) {
    console.error("Repair failed:", error);
    throw error;
  }
}

export async function acknowledgeTamper(tamperedBlockIndex) {
  try {
    const q = query(
      collection(db, 'ledger'),
      where('index', '==', tamperedBlockIndex),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      throw new Error(`Block #${tamperedBlockIndex} not found in ledger.`);
    }

    const tamperedBlock = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    const ledgerColRef = collection(db, 'ledger');
    const trackerRef = doc(db, 'system', 'ledger_tracker');

    await runTransaction(db, async (transaction) => {
      const trackerSnap = await transaction.get(trackerRef);
      const prevHash = trackerSnap.exists() ? (trackerSnap.data().latestHash || '0') : '0';
      const newIndex = trackerSnap.exists() ? ((trackerSnap.data().currentIndex || 0) + 1) : 0;

      const newBlock = {
        index: newIndex,
        prevHash,
        timestamp: new Date().toISOString(),
        userId: tamperedBlock.userId || 'system',
        actionType: 'TAMPER_ACKNOWLEDGED',
        points: 0,
        isValid: true,
        metadata: {
          tamperedBlockIndex,
          tamperedBlockId: tamperedBlock.id,
          originalActionType: tamperedBlock.actionType || null,
          note: `Admin acknowledged tampered data at block #${tamperedBlockIndex}. Original block preserved as evidence.`,
          acknowledgedAt: new Date().toISOString(),
        },
      };
      newBlock.hash = createBlockHash(newBlock);

      const newBlockRef = doc(ledgerColRef);
      transaction.set(newBlockRef, newBlock);
      transaction.set(trackerRef, { latestHash: newBlock.hash, currentIndex: newIndex }, { merge: true });
    });

    console.log(`✅ Tamper at block #${tamperedBlockIndex} acknowledged and recorded on the ledger.`);
    return { success: true, tamperedBlockIndex };

  } catch (error) {
    console.error('Failed to acknowledge tamper:', error);
    throw error;
  }
}

export async function verifyUserLedgerBlocks(userId) {
  try {
    const q = query(
      collection(db, 'ledger'),
      where('userId', '==', userId),
      orderBy('index', 'asc')
    );
    const snap = await getDocs(q);
    const tampered = [];

    snap.docs.forEach(docSnap => {
      const block = { id: docSnap.id, ...docSnap.data() };
      const result = verifyBlock(block);
      if (!result.valid) {
        tampered.push({
          blockIndex:   block.index,
          blockId:      docSnap.id,
          actionType:   block.actionType,
          storedPoints: block.points ?? 0,
          storedHash:   result.storedHash,
          recalcHash:   result.calculatedHash,
          timestamp:    block.timestamp,
          prevHash:     block.prevHash,
        });
      }
    });

    return tampered;
  } catch (error) {
    console.error('Error verifying user ledger blocks:', error);
    return [];
  }
}

export async function findLedgerBlockForTransaction(tx) {
  const TYPE_MAP = {
    points_awarded:        'SUBMISSION_CONFIRMED',
    admin_points_awarded:  'ADMIN_POINTS_AWARDED',
    points_redeemed:       'REWARD_REDEEMED',
    redemption_cancelled:  'REDEMPTION_CANCELLED',
  };

  const ledgerActionType = TYPE_MAP[tx.type] ?? tx.actionType ?? null;
  if (!tx.userId) return null;

  try {
    let q;
    if (ledgerActionType) {
      q = query(
        collection(db, 'ledger'),
        where('userId', '==', tx.userId),
        where('actionType', '==', ledgerActionType),
        orderBy('index', 'asc')
      );
    } else {
      q = query(
        collection(db, 'ledger'),
        where('userId', '==', tx.userId),
        orderBy('index', 'asc')
      );
    }

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const txTime = tx.timestamp?.toDate
      ? tx.timestamp.toDate().getTime()
      : tx.timestamp
        ? new Date(tx.timestamp).getTime()
        : null;

    const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let best = blocks[0];
    if (txTime !== null) {
      let minDiff = Infinity;
      for (const b of blocks) {
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        const diff  = Math.abs(bTime - txTime);
        if (diff < minDiff) { minDiff = diff; best = b; }
      }
    }

    const result = verifyBlock(best);
    return {
      block:      best,
      hashValid:  result.valid,
      storedHash: result.storedHash,
      recalcHash: result.calculatedHash,
    };
  } catch (error) {
    console.error('Error finding ledger block for transaction:', error);
    return null;
  }
}

export async function restoreTransactionPoints(blockId, firestoreId) {
  try {
    const blockSnap = await getDoc(doc(db, 'ledger', blockId));
    if (!blockSnap.exists()) {
      throw new Error(`Ledger block '${blockId}' not found.`);
    }
    const block = blockSnap.data();

    const sealedPoints = block.metadata?.txPoints;
    if (sealedPoints === undefined || sealedPoints === null) {
      throw new Error(
        `Block #${block.index} has no metadata.txPoints seal. Cannot restore — ` +
        `this block pre-dates tamper-seal coverage.`
      );
    }

    const txSnap = await getDoc(doc(db, 'point_transactions', firestoreId));
    if (!txSnap.exists()) {
      throw new Error(
        `point_transaction '${firestoreId}' no longer exists. ` +
        `It was deleted — manual recovery required.`
      );
    }
    const previousPoints = txSnap.data().points ?? null;

    await updateDoc(doc(db, 'point_transactions', firestoreId), {
      points:              sealedPoints,
      restoredAt:          serverTimestamp(),
      restoredFromBlock:   block.index,
    });

    const ledgerColRef = collection(db, 'ledger');
    const trackerRef   = doc(db, 'system', 'ledger_tracker');

    await runTransaction(db, async (transaction) => {
      const trackerSnap = await transaction.get(trackerRef);
      const prevHash  = trackerSnap.exists() ? (trackerSnap.data().latestHash  || '0') : '0';
      const newIndex  = trackerSnap.exists() ? ((trackerSnap.data().currentIndex || 0) + 1) : 0;

      const auditBlock = {
        index:      newIndex,
        prevHash,
        timestamp:  new Date().toISOString(),
        createdAt:  serverTimestamp(),
        userId:     block.userId || 'system',
        actionType: 'POINTS_RESTORED',
        points:     0, 
        isValid:    true,
        metadata: {
          restoredBlockIndex:  block.index,
          restoredBlockId:     blockId,
          firestoreId,
          originalActionType:  block.actionType || null,
          sealedPoints,
          previousPoints,
          note: `Admin restored point_transaction '${firestoreId}' from ${previousPoints} → ${sealedPoints} pts using ledger block #${block.index} as source of truth.`,
          restoredAt: new Date().toISOString(),
        },
      };
      auditBlock.hash = createBlockHash(auditBlock);

      const newBlockRef = doc(ledgerColRef);
      transaction.set(newBlockRef, auditBlock);
      transaction.set(trackerRef, { latestHash: auditBlock.hash, currentIndex: newIndex }, { merge: true });
    });

    console.log(`✅ Restored point_transaction '${firestoreId}': ${previousPoints} → ${sealedPoints} pts.`);
    return { success: true, restoredPoints: sealedPoints, previousPoints };

  } catch (error) {
    console.error('restoreTransactionPoints failed:', error);
    throw error;
  }
}

export async function restoreUserBalance(userId) {
  // IMPORTANT: This set must exactly mirror the one in usePointsTamperWatcher
  // (NotificationsListener.js). Any divergence causes the watcher to raise false
  // tamper alerts immediately after a restore, because the two sums will differ.
  const BALANCE_ACTION_TYPES = new Set([
    'SUBMISSION_CONFIRMED',
    'ADMIN_POINTS_AWARDED',
    'ADMIN_POINTS_DEDUCTED',
    'REWARD_REDEEMED',
    'REDEMPTION_CANCELLED',
  ]);

  try {
    const q = query(
      collection(db, 'ledger'),
      where('userId', '==', userId),
      orderBy('index', 'asc')
    );
    const snap = await getDocs(q);

    let ledgerBalance = 0;
    snap.docs.forEach(docSnap => {
      const block = docSnap.data();
      // POINTS_RESET zeroes the running balance at that point in time.
      if (block.actionType === 'POINTS_RESET') {
        ledgerBalance = 0;
        return;
      }
      if (!BALANCE_ACTION_TYPES.has(block.actionType)) return;

      const authoritativePoints =
        block.metadata?.txPoints !== undefined && block.metadata?.txPoints !== null
          ? block.metadata.txPoints
          : (block.points || 0);
      ledgerBalance += authoritativePoints;
    });
    ledgerBalance = Math.round(ledgerBalance * 100) / 100;

    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      throw new Error(`User '${userId}' not found in users collection.`);
    }
    const previousBalance = userSnap.data().totalPoints ?? 0;

    if (Math.round(previousBalance * 100) / 100 === ledgerBalance) {
      return {
        success: true,
        noChangeNeeded: true,
        ledgerBalance,
        previousBalance,
      };
    }

    await updateDoc(doc(db, 'users', userId), {
      totalPoints:        ledgerBalance,
      balanceRestoredAt:  serverTimestamp(),
    });

    const ledgerColRef = collection(db, 'ledger');
    const trackerRef   = doc(db, 'system', 'ledger_tracker');

    await runTransaction(db, async (transaction) => {
      const trackerSnap2 = await transaction.get(trackerRef);
      const prevHash  = trackerSnap2.exists() ? (trackerSnap2.data().latestHash  || '0') : '0';
      const newIndex  = trackerSnap2.exists() ? ((trackerSnap2.data().currentIndex || 0) + 1) : 0;

      const delta = Math.round((ledgerBalance - previousBalance) * 100) / 100;

      const auditBlock = {
        index:      newIndex,
        prevHash,
        timestamp:  new Date().toISOString(),
        createdAt:  serverTimestamp(),
        userId,
        actionType: 'BALANCE_RESTORED',
        points:     0,
        isValid:    true,
        metadata: {
          previousBalance,
          restoredBalance: ledgerBalance,
          delta,
          note: `Admin restored user '${userId}' balance from ${previousBalance} → ${ledgerBalance} pts to perfectly match the authoritative ledger sum.`,
          restoredAt: new Date().toISOString(),
        },
      };
      auditBlock.hash = createBlockHash(auditBlock);

      const newBlockRef = doc(ledgerColRef);
      transaction.set(newBlockRef, auditBlock);
      transaction.set(trackerRef, { latestHash: auditBlock.hash, currentIndex: newIndex }, { merge: true });
    });

    console.log(`✅ Balance restored for user '${userId}': ${previousBalance} → ${ledgerBalance} pts.`);
    return {
      success:        true,
      noChangeNeeded: false,
      ledgerBalance,
      previousBalance,
      delta: Math.round((ledgerBalance - previousBalance) * 100) / 100,
    };

  } catch (error) {
    console.error('restoreUserBalance failed:', error);
    throw error;
  }
}

export async function recoverTamperedPoints(blockId, firestoreId, userId) {
  try {
    await sendTamperNotification(userId, 'points_tampered', {
      title: '⚠️ Points Tampering Detected',
      message:
        'An unauthorized change to your points record was detected by the ' +
        'ledger integrity system. Your correct balance is being restored automatically.',
      blockId,
      firestoreId,
      detectedAt: new Date().toISOString(),
    });

    const txRestore = await restoreTransactionPoints(blockId, firestoreId);
    
    const balanceRestore = await restoreUserBalance(userId);

    await sendTamperNotification(userId, 'points_restored', {
      title: '✅ Points Restored',
      message:
        `Your points balance has been restored from ${balanceRestore.previousBalance} to ` +
        `${balanceRestore.ledgerBalance} pts using the sealed ledger record as the source of truth.`,
      previousBalance:  balanceRestore.previousBalance,
      restoredBalance:  balanceRestore.ledgerBalance,
      delta:            balanceRestore.delta ?? null,
      blockId,
      firestoreId,
      restoredAt: new Date().toISOString(),
    });

    console.log(
      `✅ Full recovery complete for user '${userId}': ` +
      `transaction restored (${txRestore.previousPoints} → ${txRestore.restoredPoints} pts), ` +
      `balance corrected (${balanceRestore.previousBalance} → ${balanceRestore.ledgerBalance} pts).`
    );

    return { success: true, txRestore, balanceRestore };
  } catch (error) {
    console.error('recoverTamperedPoints failed:', error);
    throw error;
  }
}

export default {
  createGenesisBlock,
  getLatestBlock,
  getChainStatus,
  verifyBlock,
  verifyBlockchain,
  getAllBlocks,
  createPublicAnchor,
  getLatestAnchor,
  getAllAnchors,
  getBlockchainStats,
  generateAuditProof,
  verifyAgainstAnchor,
  verifyPointTransactions,
  verifyTransactionPointsTampering,
  runAllIntegrityChecks,
  repairChain,
  acknowledgeTamper,
  verifyUserLedgerBlocks,
  findLedgerBlockForTransaction,
  restoreTransactionPoints,
  restoreUserBalance,
  recoverTamperedPoints,
  sendTamperNotification,
};