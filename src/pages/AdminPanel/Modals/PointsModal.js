import { useState } from "react";
import { db } from "../../../firebase";
import {
  doc,
  addDoc,
  collection,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { addToLedger } from "../../../utils/ledgerService";

export default function PointsModal({
  pointsModal,
  setPointsModal,
  pointsForm,
  setPointsForm,
  users,
  setUsers,
  transactions,
  setTransactions,
  showToast,
}) {
  const [loading, setLoading] = useState(false);

  const handleAwardPoints = async () => {
    const amount = parseInt(pointsForm.amount);
    if (!amount || amount <= 0) {
      showToast("Please enter a valid positive amount", "error");
      return;
    }

    if (!pointsForm.reason.trim()) {
      showToast("Please enter a reason for awarding points", "error");
      return;
    }

    const targetUser = pointsModal.user;
    setLoading(true);

    try {
      // Step 1: Atomically update the user's totalPoints in Firestore.
      // Using runTransaction ensures no race condition if two admins
      // award points to the same user at the same time.
      const userRef = doc(db, "users", targetUser.id);
      let newTotal;

      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("User not found in Firestore.");
        const currentPoints = Number(userSnap.data().totalPoints) || 0;
        newTotal = currentPoints + amount;
        transaction.update(userRef, { totalPoints: newTotal });
      });

      // Step 2: Write a point_transactions record for the audit mirror.
      await addDoc(collection(db, "point_transactions"), {
        userId: targetUser.id,
        type: "points_awarded",
        points: amount,
        description: `Admin manual award — ${pointsForm.reason.trim()}`,
        reason: pointsForm.reason.trim(),
        awardedBy: "admin",
        timestamp: serverTimestamp(),
      });

      // Step 3: ⛓️ Record the manual award on the immutable ledger.
      // This is critical — manual admin adjustments are the highest-risk
      // action in the system and must always have a ledger entry.
      await addToLedger(
        targetUser.id,
        "ADMIN_POINTS_AWARDED",
        amount,
        {
          reason: pointsForm.reason.trim(),
          awardedBy: "admin",
          previousTotal: (targetUser.totalPoints || 0),
          newTotal,
        }
      );

      // Step 4: Update local React state so the UI reflects immediately
      // without requiring a page refresh.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, totalPoints: newTotal } : u
        )
      );

      setTransactions((prev) => [
        {
          id: `trans_${Date.now()}`,
          type: "points_awarded",
          userName: targetUser.email,
          amount,
          reason: pointsForm.reason.trim(),
          timestamp: { seconds: Date.now() / 1000 },
        },
        ...prev,
      ]);

      setPointsModal({ visible: false, user: null });
      setPointsForm({ amount: "", reason: "" });
      showToast(`${amount} points awarded to ${targetUser.email}`, "success");

    } catch (error) {
      console.error("Failed to award points:", error);
      showToast(
        error.message || "Failed to award points. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setPointsModal({ visible: false, user: null });
    setPointsForm({ amount: "", reason: "" });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-300">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-800">Award Points</h3>
          <p className="text-slate-500 text-sm mt-1">
            Give points to {pointsModal.user?.email}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Points Amount
            </label>
            <input
              type="number"
              value={pointsForm.amount}
              onChange={(e) =>
                setPointsForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              disabled={loading}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 disabled:opacity-50"
              placeholder="Enter points to award"
              min="1"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Reason
            </label>
            <input
              type="text"
              value={pointsForm.reason}
              onChange={(e) =>
                setPointsForm((prev) => ({ ...prev, reason: e.target.value }))
              }
              disabled={loading}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 disabled:opacity-50"
              placeholder="Reason for awarding points"
            />
          </div>
        </div>
        <div className="p-6 bg-slate-50 rounded-b-2xl flex space-x-3">
          <button
            onClick={handleAwardPoints}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 px-4 rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Awarding...
              </>
            ) : (
              "Award Points"
            )}
          </button>
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 bg-slate-200 text-slate-700 py-3 px-4 rounded-xl hover:bg-slate-300 transition-all duration-200 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}