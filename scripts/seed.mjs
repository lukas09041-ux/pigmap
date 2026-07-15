// 착한가격업소 CSV(data/good_price_stores.csv)를 파싱해서 Supabase stores 테이블에 시딩한다.
// 실행 전: supabase/schema.sql을 Supabase SQL Editor에서 먼저 적용해야 한다.
// 실행: npm run seed
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const CSV_PATH = path.join(process.cwd(), "data/good_price_stores.csv");

// 지금은 동작구·관악구만 시딩한다. 다른 구를 추가하려면 이 배열에 { sido, gu }를 더 넣으면 된다.
const TARGET_REGIONS = [
  { sido: "서울특별시", gu: "동작구" },
  { sido: "서울특별시", gu: "관악구" },
];

const GEOCODE_DELAY_MS = 120;
const INSERT_BATCH_SIZE = 50;
const DEFAULT_PIG_TEMPERATURE = 36.5;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 시딩은 RLS를 우회해야 하는 관리 작업이므로 서비스 롤 키가 있으면 그걸 우선 쓴다.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY(또는 SUPABASE_SERVICE_ROLE_KEY)가 .env.local에 필요합니다.",
  );
}
if (!KAKAO_REST_KEY) {
  throw new Error("KAKAO_REST_KEY가 .env.local에 필요합니다 (카카오 로컬 지오코딩용).");
}
if (!existsSync(CSV_PATH)) {
  throw new Error(`CSV 파일을 찾을 수 없습니다: ${CSV_PATH}`);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[seed] SUPABASE_SERVICE_ROLE_KEY가 없어 anon key로 시딩합니다. stores/reviews에 RLS를 켜둔 상태라면 insert가 막힐 수 있습니다.",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parsePrice(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

function pickRepresentativeMenu(row) {
  for (const n of [1, 2, 3, 4]) {
    const menu = row[`메뉴${n}`]?.trim();
    if (menu) {
      return { menuName: menu, price: parsePrice(row[`가격${n}`]?.trim()) };
    }
  }
  return { menuName: null, price: null };
}

async function kakaoRequest(endpoint, query) {
  const url = new URL(`https://dapi.kakao.com/v2/local/search/${endpoint}.json`);
  url.searchParams.set("query", query);

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });

  if (res.status === 429) {
    await sleep(1000);
    return kakaoRequest(endpoint, query);
  }
  if (!res.ok) return null;

  const data = await res.json();
  const doc = data.documents?.[0];
  if (!doc) return null;
  return { latitude: parseFloat(doc.y), longitude: parseFloat(doc.x) };
}

async function geocodeAddress(address, name, gu) {
  const baseAddress = address.split(",")[0].trim();

  let coords = await kakaoRequest("address", baseAddress);
  if (coords) return coords;

  await sleep(GEOCODE_DELAY_MS);
  coords = await kakaoRequest("keyword", `${gu} ${name}`);
  return coords;
}

async function main() {
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  const targetRows = rows.filter((row) =>
    TARGET_REGIONS.some((r) => row["시도"] === r.sido && row["시군"] === r.gu),
  );

  console.log(`[seed] 대상 행: ${targetRows.length} / 전체 ${rows.length}`);

  const stores = [];
  const geocodeFailures = [];

  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i];
    const name = row["업소명"]?.trim();
    const address = row["주소"]?.trim();

    if (!name || !address) {
      console.warn(`[seed] 업소명/주소 누락으로 스킵 (행 ${i + 1})`);
      continue;
    }

    const { menuName, price } = pickRepresentativeMenu(row);
    const coords = await geocodeAddress(address, name, row["시군"]);

    if (!coords) {
      geocodeFailures.push({ name, address, gu: row["시군"] });
      console.warn(`[seed] 지오코딩 실패: ${name} (${address})`);
    }

    stores.push({
      name,
      category: row["업종"]?.trim() || null,
      address,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      menu_name: menuName,
      price,
      phone: row["연락처"]?.trim() || null,
      pig_temperature: DEFAULT_PIG_TEMPERATURE,
    });

    process.stdout.write(`\r[seed] 지오코딩 진행: ${i + 1}/${targetRows.length}`);
    await sleep(GEOCODE_DELAY_MS);
  }
  console.log();

  for (let i = 0; i < stores.length; i += INSERT_BATCH_SIZE) {
    const batch = stores.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase.from("stores").insert(batch);
    if (error) {
      throw new Error(`[seed] Supabase insert 실패 (배치 ${i / INSERT_BATCH_SIZE + 1}): ${error.message}`);
    }
    console.log(`[seed] ${i + batch.length}/${stores.length}건 삽입 완료`);
  }

  if (geocodeFailures.length > 0) {
    const failuresPath = path.join(process.cwd(), "data/geocode_failures.csv");
    const header = "name,address,gu\n";
    const body = geocodeFailures
      .map((f) => `"${f.name}","${f.address}","${f.gu}"`)
      .join("\n");
    writeFileSync(failuresPath, header + body, "utf-8");
    console.warn(
      `[seed] 지오코딩 실패 ${geocodeFailures.length}건 -> ${failuresPath}에 기록 (위경도 null로 저장됨)`,
    );
  }

  console.log(`[seed] 완료: stores ${stores.length}건 삽입 시도`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
