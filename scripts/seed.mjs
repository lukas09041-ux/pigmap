// 착한가격업소 CSV(data/good_price_stores.csv)를 파싱해서 Supabase stores 테이블에 시딩한다.
// 이미 DB에 있는 가게(이름+주소 기준)는 건너뛰므로 여러 번 실행해도 안전하다(전국 증분 시딩).
// 실행 전: supabase/schema.sql을 Supabase SQL Editor에서 먼저 적용해야 한다.
// 실행: npm run seed             (전국 전체)
//       npm run seed -- --limit 100   (앞에서 100건만)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const CSV_PATH = path.join(process.cwd(), "data/good_price_stores.csv");

// 전국 시딩. 특정 지역만 하려면 [{ sido: "서울특별시", gu: "동작구" }] 형태로 채우면 된다.
const TARGET_REGIONS = [];

const GEOCODE_CONCURRENCY = 4; // 카카오 로컬 API 병렬 호출 수 (QPS 여유 범위)
const INSERT_BATCH_SIZE = 100;
const DEFAULT_PIG_TEMPERATURE = 36.5;

const args = process.argv.slice(2);
const limitFlag = args.indexOf("--limit");
const LIMIT = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) : Infinity;

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
  // "25,000/45,000"처럼 값이 여러 개면 첫 숫자 덩어리만 취한다 (전부 이어붙이면 int 오버플로)
  const m = raw.replace(/,/g, "").match(/\d+/);
  if (!m) return null;
  const value = parseInt(m[0], 10);
  return value > 0 && value < 10_000_000 ? value : null;
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

async function kakaoRequest(endpoint, query, retries = 3) {
  const url = new URL(`https://dapi.kakao.com/v2/local/search/${endpoint}.json`);
  url.searchParams.set("query", query);

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
  });

  if (res.status === 429 && retries > 0) {
    await sleep(1500);
    return kakaoRequest(endpoint, query, retries - 1);
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

  coords = await kakaoRequest("keyword", `${gu} ${name}`);
  return coords;
}

// 이름+주소로 중복 판별하기 위한 키
const storeKey = (name, address) => `${name}::${address}`.replace(/\s+/g, "");

async function fetchExistingKeys() {
  const keys = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("stores")
      .select("name, address")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`기존 stores 조회 실패: ${error.message}`);
    for (const s of data ?? []) keys.add(storeKey(s.name, s.address ?? ""));
    if (!data || data.length < PAGE) break;
  }
  return keys;
}

async function main() {
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  const regionRows =
    TARGET_REGIONS.length === 0
      ? rows
      : rows.filter((row) =>
          TARGET_REGIONS.some((r) => row["시도"] === r.sido && row["시군"] === r.gu),
        );

  const existingKeys = await fetchExistingKeys();
  console.log(`[seed] 기존 DB 가게: ${existingKeys.size}건`);

  const targetRows = regionRows
    .filter((row) => {
      const name = row["업소명"]?.trim();
      const address = row["주소"]?.trim();
      if (!name || !address) return false;
      return !existingKeys.has(storeKey(name, address));
    })
    .slice(0, LIMIT);

  console.log(`[seed] 신규 대상: ${targetRows.length} / CSV 전체 ${rows.length}`);

  const geocodeFailures = [];
  let processed = 0;
  let inserted = 0;
  let buffer = [];

  async function flushBuffer() {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    const { error } = await supabase.from("stores").insert(batch);
    if (error) {
      // 배치에 문제 행이 섞여 있으면 전체를 버리지 말고 한 건씩 재시도
      console.warn(`\n[seed] 배치 insert 실패(${error.message}) — 개별 재시도`);
      for (const row of batch) {
        const { error: rowError } = await supabase.from("stores").insert(row);
        if (rowError) {
          console.warn(`[seed] 행 스킵: ${row.name} — ${rowError.message}`);
        } else {
          inserted += 1;
        }
      }
      return;
    }
    inserted += batch.length;
    process.stdout.write(`  [누적 삽입 ${inserted}]`);
  }

  // 워커 풀: GEOCODE_CONCURRENCY개가 큐를 나눠서 처리
  let cursor = 0;
  async function worker() {
    while (cursor < targetRows.length) {
      const row = targetRows[cursor++];
      const name = row["업소명"].trim();
      const address = row["주소"].trim();
      const { menuName, price } = pickRepresentativeMenu(row);

      let coords = null;
      try {
        coords = await geocodeAddress(address, name, row["시군"] ?? "");
      } catch {
        coords = null;
      }

      if (!coords) {
        geocodeFailures.push({ name, address, gu: row["시군"] ?? "" });
      }

      buffer.push({
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

      processed += 1;
      if (processed % 25 === 0) {
        process.stdout.write(`\r[seed] 지오코딩 진행: ${processed}/${targetRows.length}`);
      }
      if (buffer.length >= INSERT_BATCH_SIZE) {
        await flushBuffer();
      }
    }
  }

  await Promise.all(Array.from({ length: GEOCODE_CONCURRENCY }, () => worker()));
  await flushBuffer();
  console.log();

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

  console.log(`[seed] 완료: 신규 ${inserted}건 삽입`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
