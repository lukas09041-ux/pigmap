import {
  PIG_BODY_ASSETS,
  PIG_ITEM_ASSETS,
  USER_PIG_DEFAULT_COLOR,
  type PigItemId,
} from "@/lib/pig-avatar";

// 유저 돼지 아바타 — 몸통 레이어 위에 장착 아이템 레이어를 겹쳐 그린다.
// PIG_BODY_ASSETS / PIG_ITEM_ASSETS에 이미지 경로를 넣으면 해당 레이어가
// 코드 SVG 대신 <img>로 렌더링되므로, 디자인 에셋 교체 시 이 파일은 수정할 필요 없다.
// 훅을 쓰지 않는 순수 컴포넌트라 서버/클라이언트 어디서든 렌더 가능.
//
// 몸 디자인 서사(레벨이 곧 나이): 눈 감은 아기(Lv1) → 귀 쫑긋 꼬마(Lv2) →
// 포크 든 청소년(Lv3) → 지도 든 어른(Lv4) → 셰프 모자(Lv5) → 금빛 전설(Lv6).
// 몸집은 전 레벨 동일 — 살집이 변하는 가게 돼지(pig-stage)와 시각 언어를 분리한다.

function darken(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - amount);
  const g = Math.max(0, ((n >> 8) & 255) - amount);
  const b = Math.max(0, (n & 255) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function PigBody({ level, color }: { level: number; color: string }) {
  // Lv6 황금돼지는 색을 금색으로 강제
  const body = level >= 6 ? "#FFD34D" : color;
  const dark = darken(body, 40);
  const earPerk = level >= 2; // Lv2 "쫑긋이"부터 귀가 쫑긋 선다
  const eyesOpen = level >= 2; // 아기(Lv0~1)는 눈을 감고 있다
  const smile = level >= 3;
  const blush = level >= 1;

  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden>
      {/* 귀 */}
      <g fill={body} stroke={dark} strokeWidth="2">
        {earPerk ? (
          <>
            <path d="M32 38 L26 14 L48 26 Z" />
            <path d="M88 38 L94 14 L72 26 Z" />
          </>
        ) : (
          <>
            <path d="M34 40 L22 28 L44 24 Z" />
            <path d="M86 40 L98 28 L76 24 Z" />
          </>
        )}
      </g>
      {/* 얼굴 */}
      <circle cx="60" cy="64" r="38" fill={body} stroke={dark} strokeWidth="2" />
      {/* 볼터치 */}
      {blush && (
        <g fill="#FF8FA3" opacity="0.55">
          <ellipse cx="34" cy="72" rx="6" ry="4" />
          <ellipse cx="86" cy="72" rx="6" ry="4" />
        </g>
      )}
      {/* 눈 */}
      {eyesOpen ? (
        <g fill="#4A3728">
          <circle cx="46" cy="58" r="3.4" />
          <circle cx="74" cy="58" r="3.4" />
        </g>
      ) : (
        <g stroke="#4A3728" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M42 60 q4 4 8 0" />
          <path d="M70 60 q4 4 8 0" />
        </g>
      )}
      {/* 코 */}
      <ellipse cx="60" cy="72" rx="13" ry="10" fill={darken(body, 20)} stroke={dark} strokeWidth="2" />
      <circle cx="55" cy="72" r="2.2" fill={dark} />
      <circle cx="65" cy="72" r="2.2" fill={dark} />
      {/* 입 */}
      {smile && (
        <path d="M52 88 q8 6 16 0" stroke={dark} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}

      {/* Lv3 동네 미식가: 포크 */}
      {level === 3 && (
        <g transform="translate(103 78) rotate(18)">
          <rect x="-1.5" y="0" width="3" height="22" rx="1.5" fill="#8B96A5" />
          <g fill="#8B96A5">
            <rect x="-6" y="-10" width="2.4" height="11" rx="1.2" />
            <rect x="-1.2" y="-11" width="2.4" height="12" rx="1.2" />
            <rect x="3.6" y="-10" width="2.4" height="11" rx="1.2" />
          </g>
          <rect x="-6" y="-1" width="12" height="4" rx="2" fill="#8B96A5" />
        </g>
      )}

      {/* Lv4 골목 탐험가: 지도 */}
      {level === 4 && (
        <g transform="translate(6 84) rotate(-10)">
          <path d="M0 0 L10 -3 L20 0 L30 -3 L30 16 L20 19 L10 16 L0 19 Z" fill="#FDF3D8" stroke="#C9A96A" strokeWidth="1.5" />
          <path d="M10 -3 V16 M20 0 V19" stroke="#C9A96A" strokeWidth="1" />
          <path d="M4 6 q6 4 12 0 q6 -4 10 2" stroke="#E85D4A" strokeWidth="1.5" fill="none" strokeDasharray="2.5 2" />
        </g>
      )}

      {/* Lv5 꿀꿀 셰프: 몸에 내장된 셰프 모자 */}
      {level === 5 && (
        <g>
          <path
            d="M40 36 q-10 -16 6 -20 q2 -10 14 -10 q12 0 14 10 q16 4 6 20 Z"
            fill="#FFFFFF"
            stroke="#D9D9E0"
            strokeWidth="2"
          />
          <rect x="42" y="34" width="36" height="8" rx="3" fill="#F0F0F5" stroke="#D9D9E0" strokeWidth="1.5" />
        </g>
      )}

      {/* Lv6 전설의 황금돼지: 금빛 반짝임 */}
      {level >= 6 && (
        <g fill="#FFF3B0">
          <path d="M18 22 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" />
          <path d="M100 40 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 Z" />
          <path d="M96 96 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 Z" />
        </g>
      )}
    </svg>
  );
}

function PigItem({ item }: { item: PigItemId }) {
  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden>
      {item === "ribbon" && (
        <g transform="translate(60 24)">
          <path d="M0 0 L-14 -8 L-14 8 Z" fill="#FF6B8A" stroke="#E04A6B" strokeWidth="1.5" />
          <path d="M0 0 L14 -8 L14 8 Z" fill="#FF6B8A" stroke="#E04A6B" strokeWidth="1.5" />
          <circle r="4" fill="#E04A6B" />
        </g>
      )}
      {item === "scarf" && (
        <g>
          {/* 알록달록 목도리 — 색동 줄무늬 */}
          <defs>
            <clipPath id="pig-scarf-clip">
              <path d="M28 92 q32 16 64 0 l-2 -10 q-30 13 -60 0 Z" />
            </clipPath>
          </defs>
          <path d="M28 92 q32 16 64 0 l-2 -10 q-30 13 -60 0 Z" fill="#E85D4A" stroke="#C44536" strokeWidth="1.5" />
          <g clipPath="url(#pig-scarf-clip)">
            <rect x="38" y="78" width="9" height="26" fill="#F2B134" />
            <rect x="56" y="78" width="9" height="26" fill="#5B8DEF" />
            <rect x="74" y="78" width="9" height="26" fill="#7ED957" />
          </g>
          <rect x="74" y="90" width="10" height="20" rx="3" fill="#E85D4A" stroke="#C44536" strokeWidth="1.5" />
          <g stroke="#C44536" strokeWidth="1.5">
            <line x1="76" y1="106" x2="76" y2="110" />
            <line x1="79" y1="106" x2="79" y2="110" />
            <line x1="82" y1="106" x2="82" y2="110" />
          </g>
        </g>
      )}
      {item === "napkin" && (
        <g>
          {/* 냅킨 두건 — 체크무늬 삼각 스카프 */}
          <defs>
            <clipPath id="pig-napkin-clip">
              <path d="M32 90 L88 90 L60 112 Z" />
            </clipPath>
          </defs>
          <path d="M32 90 L88 90 L60 112 Z" fill="#FFFFFF" stroke="#D96A6A" strokeWidth="1.5" />
          <g clipPath="url(#pig-napkin-clip)" stroke="#E88B8B" strokeWidth="2.5">
            <line x1="42" y1="86" x2="42" y2="114" />
            <line x1="54" y1="86" x2="54" y2="114" />
            <line x1="66" y1="86" x2="66" y2="114" />
            <line x1="78" y1="86" x2="78" y2="114" />
            <line x1="30" y1="96" x2="90" y2="96" />
            <line x1="30" y1="105" x2="90" y2="105" />
          </g>
        </g>
      )}
      {item === "hat_cap" && (
        <g>
          <path d="M38 34 q22 -22 44 0 l2 6 -48 0 Z" fill="#5B8DEF" stroke="#3F6FD1" strokeWidth="2" />
          <rect x="58" y="36" width="34" height="7" rx="3.5" fill="#3F6FD1" />
        </g>
      )}
      {item === "hat_beret" && (
        <g transform="rotate(-8 60 30)">
          <ellipse cx="60" cy="30" rx="26" ry="11" fill="#D9534F" stroke="#B23B38" strokeWidth="2" />
          <rect x="57" y="15" width="6" height="7" rx="3" fill="#B23B38" />
        </g>
      )}
      {item === "hat_straw" && (
        <g>
          <ellipse cx="60" cy="34" rx="34" ry="8" fill="#F2D06B" stroke="#C9A649" strokeWidth="2" />
          <path d="M42 33 q0 -18 18 -18 q18 0 18 18 Z" fill="#F2D06B" stroke="#C9A649" strokeWidth="2" />
          <path d="M42 30 h36" stroke="#D9534F" strokeWidth="4" />
        </g>
      )}
      {item === "sunglasses" && (
        <g>
          <rect x="34" y="50" width="22" height="15" rx="6" fill="#26262B" />
          <rect x="64" y="50" width="22" height="15" rx="6" fill="#26262B" />
          <line x1="56" y1="56" x2="64" y2="56" stroke="#26262B" strokeWidth="3" />
          <rect x="36.5" y="53" width="8" height="4" rx="2" fill="#4B4B55" />
          <rect x="66.5" y="53" width="8" height="4" rx="2" fill="#4B4B55" />
        </g>
      )}
      {item === "backpack" && (
        <g>
          {/* 어깨끈 + 옆으로 삐져나온 배낭 */}
          <path d="M34 94 q-14 2 -16 14 l10 4 q4 -10 10 -12 Z" fill="#6B8F5E" stroke="#4F6E45" strokeWidth="1.5" />
          <rect x="8" y="96" width="18" height="20" rx="5" fill="#7EA96E" stroke="#4F6E45" strokeWidth="1.5" />
          <rect x="12" y="102" width="10" height="7" rx="2" fill="#4F6E45" />
        </g>
      )}
      {item === "chef_outfit" && (
        <g>
          {/* 셰프복 — 더블버튼 조리복 상의 */}
          <path d="M30 96 q30 14 60 0 l0 18 -60 0 Z" fill="#FFFFFF" stroke="#C9CDD6" strokeWidth="1.5" />
          <path d="M60 100 V114" stroke="#C9CDD6" strokeWidth="1.5" />
          <g fill="#5B6472">
            <circle cx="52" cy="105" r="1.8" />
            <circle cx="52" cy="111" r="1.8" />
            <circle cx="68" cy="105" r="1.8" />
            <circle cx="68" cy="111" r="1.8" />
          </g>
        </g>
      )}
      {item === "golden_fork" && (
        <g transform="translate(14 82) rotate(-18)">
          <rect x="-2" y="0" width="4" height="26" rx="2" fill="#E0A800" />
          <g fill="#FFC93C" stroke="#E0A800" strokeWidth="0.8">
            <rect x="-7.5" y="-12" width="3" height="13" rx="1.5" />
            <rect x="-1.5" y="-13.5" width="3" height="14.5" rx="1.5" />
            <rect x="4.5" y="-12" width="3" height="13" rx="1.5" />
          </g>
          <rect x="-7.5" y="-1.5" width="15" height="5" rx="2.5" fill="#FFC93C" stroke="#E0A800" strokeWidth="0.8" />
        </g>
      )}
      {item === "crown" && (
        <g>
          <path
            d="M40 36 L40 18 L50 28 L60 14 L70 28 L80 18 L80 36 Z"
            fill="#FFC93C"
            stroke="#E0A800"
            strokeWidth="2"
          />
          <circle cx="40" cy="16" r="3" fill="#FF6B8A" />
          <circle cx="60" cy="12" r="3" fill="#5B8DEF" />
          <circle cx="80" cy="16" r="3" fill="#FF6B8A" />
        </g>
      )}
      {item === "sparkle" && (
        <g fill="#FFE066" stroke="#F2C230" strokeWidth="0.8">
          <path d="M14 48 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          <path d="M106 56 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" />
          <path d="M24 100 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
          <path d="M98 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        </g>
      )}
    </svg>
  );
}

// 꾸미기 시트의 아이템 타일용 단독 프리뷰 (몸통 없이 아이템만)
export function PigItemIcon({
  item,
  size = 56,
  className = "",
}: {
  item: PigItemId;
  size?: number;
  className?: string;
}) {
  const asset = PIG_ITEM_ASSETS[item];
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {asset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <PigItem item={item} />
      )}
    </div>
  );
}

// 아이템이 자연스럽게 겹치도록 렌더 순서 고정
// (배낭/옷 → 목 장식 → 머리 장식 → 얼굴/손 소품 → 이펙트)
const ITEM_RENDER_ORDER: PigItemId[] = [
  "backpack",
  "chef_outfit",
  "scarf",
  "napkin",
  "ribbon",
  "hat_cap",
  "hat_beret",
  "hat_straw",
  "crown",
  "sunglasses",
  "golden_fork",
  "sparkle",
];

export default function UserPigAvatar({
  level,
  equipped = [],
  size = 96,
  color = USER_PIG_DEFAULT_COLOR,
  className = "",
}: {
  level: number;
  equipped?: PigItemId[];
  size?: number;
  color?: string;
  className?: string;
}) {
  const bodyAsset = PIG_BODY_ASSETS[level] ?? null;
  const items = ITEM_RENDER_ORDER.filter((i) => equipped.includes(i));

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {bodyAsset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bodyAsset} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <PigBody level={level} color={color} />
      )}
      {items.map((item) => {
        const asset = PIG_ITEM_ASSETS[item];
        return asset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item}
            src={asset}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <PigItem key={item} item={item} />
        );
      })}
    </div>
  );
}
