"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PIG_ITEMS,
  PIG_ITEM_IDS,
  getPigLevel,
  type PigItemId,
} from "@/lib/pig-avatar";
import UserPigAvatar, { PigItemIcon } from "./UserPigAvatar";

export default function PigDressupSheet({
  open,
  onClose,
  userId,
  certCount,
  unlocked,
  equipped,
  onEquippedChange,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  certCount: number;
  unlocked: PigItemId[];
  equipped: PigItemId[];
  onEquippedChange: (items: PigItemId[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const level = getPigLevel(certCount).level;

  if (!open) return null;

  async function toggleItem(item: PigItemId) {
    if (saving) return;
    const next = equipped.includes(item)
      ? equipped.filter((i) => i !== item)
      : [...equipped, item];

    // 즉시 프리뷰 반영 후 저장 — 실패하면 원복
    onEquippedChange(next);
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ equipped_items: next })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      onEquippedChange(equipped);
      alert("저장에 실패했어요: " + error.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white px-5 pb-8 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-gray-900">꿀꿀이 꾸미기</p>
          <button type="button" onClick={onClose} className="text-gray-400" aria-label="닫기">
            ✕
          </button>
        </div>

        {/* 장착 결과 즉시 프리뷰 */}
        <div className="mt-4 flex justify-center rounded-2xl bg-orange-50/60 py-5">
          <UserPigAvatar level={level} equipped={equipped} size={128} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {PIG_ITEM_IDS.map((item) => {
            const meta = PIG_ITEMS[item];
            const isUnlocked = unlocked.includes(item);
            const isEquipped = equipped.includes(item);

            return (
              <button
                key={item}
                type="button"
                disabled={!isUnlocked}
                onClick={() => toggleItem(item)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition ${
                  isEquipped
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 bg-white"
                } ${!isUnlocked ? "opacity-90" : ""}`}
              >
                {/* 잠긴 아이템은 실루엣 처리 */}
                <PigItemIcon
                  item={item}
                  size={56}
                  className={!isUnlocked ? "brightness-0 opacity-25" : ""}
                />
                <span className="text-xs font-semibold text-gray-700">{meta.name}</span>
                {isUnlocked ? (
                  <span
                    className={`text-[10px] font-bold ${
                      isEquipped ? "text-orange-500" : "text-gray-400"
                    }`}
                  >
                    {isEquipped ? "장착 중" : "탭해서 장착"}
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400">
                    {meta.unlockCerts}번 인증 시 해금
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
