# 할 일 관리 앱 구현 계획 (Next.js + TS + MongoDB)

**Status: 구현됨 (ralph 실행, 2026-11-01)** — 아래 "구현 현황" 참고

## 구현 현황 (2026-11-01)
- 완료·자동 검증됨: 모델/DB, Goal·Week·Todo API(필수 부모 400, 삭제 차단 409, 주간·목표 진행률, 기간 쿼리), 칸반 보드·할 일/주간/목표 CRUD UI, 일일/주간/1년 탭. `npm test`(48개: API 통합 21, 모델 4, 진행률 4, 보드 로직 6, UI 13), `tsc --noEmit`, `npm run lint`, `npm run build` 통과. 실제 Next 서버 + 임시 MongoDB로 API 스모크 테스트 수행. 이월/적색 날짜(§6-5) 반영.
- 리뷰어 지적 반영: 1년 탭 연도 입력(문자열 draft), 할 일 폼 기본값(날짜·주간계획) 추종, 낙관적 이동 롤백을 해당 카드로 한정 + 오래된 응답 무시, 저장 실패 시 편집 폼 유지, 토스트 자동 닫힘, 실제 달력 날짜 검증.
- 구현 시 변경: `mongoose` 9 / Next 16 사용(`params`는 Promise), 앱은 `next/dynamic`(ssr:false)로 클라이언트에서만 렌더(오늘 날짜 사용), `@types/node` ^22(vitest peer), 목록 응답 DTO에 `weekTitle`/`goalTitle` 포함.
- **미검증**: 실제 브라우저에서의 포인터 드래그 앤 드롭(이동 판정·롤백 로직과 상태 select 경로는 테스트됨, `@dnd-kit` 포인터 조작 자체는 jsdom에서 검증 불가), 실제 Atlas/로컬 MongoDB 연결(메모리 서버로만 확인), 모바일 터치.
- 미구현: 레이스 컨디션 방어(삭제 검사와 삭제 사이), Playwright e2e.

### GitHub OAuth 로그인 (docs/LOGIN.md, 2026-11-01)
- **구현됨**: `GET /auth/github`(난수 state를 HttpOnly 쿠키에 저장 후 GitHub로 302), `GET /auth/github/callback`(state 검증 후에만 코드 교환 → 사용자 조회 → `githubId` 기준 upsert로 username/avatarUrl 저장 → 새 세션 발급), `POST /auth/logout`(Session 문서 삭제 + 쿠키 만료), `GET /api/me`. 세션은 MongoDB `sessions`에 **sha256 해시만** 저장(TTL 7일). 시크릿은 `process.env`(`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`APP_URL`)에서만 읽는다.
- **소유권 격리**: `Goal`/`Week`/`Todo`에 `userId`(필수, 인덱스)를 추가했다(필드명은 Mongoose 관례상 `user_id`가 아닌 `userId`). 모든 `/api/goals|weeks|todos` 핸들러는 `authed()` 래퍼로 감싸 세션이 없으면 본문 실행 전에 401을 반환하고, 모든 조회/수정/삭제 쿼리에 `userId` 조건을 더했다. 타인 문서 접근은 존재하지 않는 id와 동일한 404, 타인 소유 부모(`weekId`/`goalId`) 지정은 400. 본문의 `userId`는 거부(400).
- **"기존 CRUD 로직 변경 금지"와의 관계**: 검증·삭제 차단(409)·진행률 집계·기간/이월 쿼리·에러 문구는 바꾸지 않았다. 다만 "본인 데이터만 조회/수정/삭제"를 만족하려면 기존 쿼리에 `userId` 조건을 추가하고 핸들러를 `authed()`로 감싸야 해서 **각 라우트 파일을 수정했다**(로직이 아니라 소유자 스코프 추가). 기존 API 테스트는 로그인 헬퍼만 추가해 통과시켰고, 테스트 본문은 바꾸지 않았다(직접 `Request`를 만들던 1건에 쿠키 헤더 추가, 모델 테스트의 문서에 `userId` 추가).
- **마이그레이션**: `scripts/migrate-user-id.mjs` / `npm run migrate:user-id -- --username <name> [--dry-run]`. `userId`가 없거나 null인 문서만 지정 사용자에게 귀속, 멱등, 존재하지 않는/중복 username은 변경 없이 실패. **사용자의 실제 DB(Atlas)에는 실행하지 않았다.**
- **쿠키 Secure 속성**: https 주소이거나 production+비-localhost일 때만 Secure(production 빌드를 http://localhost에서 `next start`로 돌릴 때 로그인이 조용히 실패하는 문제를 실서버 확인 중 발견해 수정).
- **자동 검증**: 인증 코어·OAuth 라우트(GitHub 호출은 fetch 모킹)·격리·마이그레이션·로그인 UI 테스트 포함 `npm test` 118개, `tsc`/`lint`/`build` 통과. 소유자 조건을 일부러 제거한 변이 테스트 2건으로 격리 테스트가 실제 결함을 잡는지 확인했다.
- **미검증 (실제 환경)**: ① **실제 GitHub 로그인 왕복**(승인 화면 → callback → 세션 발급)은 GitHub 계정으로 브라우저에서 직접 로그인해야 하므로 수행하지 못했다. 실서버에서 확인한 것은 `/auth/github`가 올바른 authorize URL과 state 쿠키로 302 하는 것, 잘못된 state 거부, 비로그인 401까지다. ② `.env`의 Client ID/Secret이 유효하고 GitHub OAuth App의 callback URL이 `http://localhost:3000/auth/github/callback`으로 등록되어 있는지는 확인하지 못했다(GitHub는 잘못된 client_id도 로그인 화면으로 먼저 302 하여 외부에서 구분 불가). ③ 사용자의 Atlas DB에 대한 마이그레이션·로그인 동작. ④ 쿠키 `Secure` 동작의 실제 브라우저 확인.
- **알려진 한계**: CSRF 방어는 `SameSite=Lax` 세션 쿠키(교차 사이트 POST/PATCH/DELETE에는 쿠키가 전송되지 않음)에만 의존한다. `Content-Type` 검사, CSRF 토큰, Origin 검사는 없다. 로그인 시도 횟수 제한(rate limit) 없음. GitHub access token은 저장하지 않는다(사용자 조회 직후 폐기).
**Source:** `docs/PRD.md` (최신 개정 반영: 필수 부모 연결, 삭제 차단, 주간 기간 시작·종료일, 목표/주간 CRUD가 P0)
**Stack (사용자 확정):** Next.js + TypeScript + MongoDB + Next.js API Routes
**Stack (계획자 제안, 확인 필요):** App Router Route Handlers, Mongoose, `@dnd-kit/core`, Tailwind CSS, zod, Vitest + `mongodb-memory-server`

## 0. PRD 개정에 따른 변경점 (이전 계획 대비)
| PRD 변경 | 계획 반영 |
|---|---|
| 할 일→주간계획, 주간계획→목표 연결 **필수** | `weekId`, `goalId` required (null 불가). API·UI·DB 3중 강제 |
| 하위 항목 있으면 **삭제 차단 + 안내** | 고아 허용(참조 null 처리) 폐기 → 삭제 API가 409 + 메시지 반환, UI가 안내 표시 |
| 주간계획 **시작일·종료일** | `weekStart`(월요일 고정) → `startDate`, `endDate`로 교체 |
| 목표/주간 CRUD가 **P0** | 단계 앞당김, P1에서 제외 |
| 기간별 조회가 **P0** (일일=날짜, 주간=주간계획, 1년=목표) | 필터/탭을 P0 단계로 승격 |
| 목표에서 연결된 주간계획 식별 | 목표 조회 시 주간계획 목록 포함 |
| P1은 **1년 목표 진행률(주간 진행률 기반)** 만 | 연결 탐색·편집 편의 P1 항목 삭제(과도한 창작 방지) |

## 1. Requirements Summary
- 목표/주간/할 일 CRUD, 상태(todo/doing/done), 칸반 드래그 앤 드롭
- 계층: 할 일 → 주간계획 → 1년 목표 (각 부모 필수)
- 주간 진행률 = done / 연결된 전체 × 100, 0개면 0%
- 삭제는 하위 항목이 없을 때만 (할 일은 하위가 없으므로 항상 삭제 가능)
- 기간별 조회: 일일(날짜), 주간(주간계획), 1년(목표)
- P1: 1년 목표 진행률(주간 진행률 기반)
- 인증은 PRD에 없었으나 이후 `docs/LOGIN.md`로 GitHub OAuth 로그인이 추가됨 (위 "구현 현황" 참고)

## 2. 데이터 모델 (MongoDB, Mongoose)
```
Goal: { _id, title, year:number }
Week: { _id, title, goalId: ObjectId(required), startDate:'YYYY-MM-DD', endDate:'YYYY-MM-DD' }
Todo: { _id, title, status:'todo'|'doing'|'done'(default 'todo'), weekId: ObjectId(required), date:'YYYY-MM-DD', createdAt }
```
- 검증: `endDate >= startDate`; 생성·수정 시 참조 대상(goalId/weekId) **존재 확인** 후 저장(없으면 400)
- 인덱스: `Todo.weekId`, `Todo.date`, `Week.goalId`, `Week.startDate`
- 진행률은 저장하지 않고 조회 시 집계(`$group`)로 계산
- 날짜는 문자열 `YYYY-MM-DD` (타임존 어긋남 방지)
- 삭제 규칙: Goal은 Week가 0개일 때만, Week는 Todo가 0개일 때만 삭제. 위반 시 **409** `{ error: "연결된 주간계획 N개가 있어 삭제할 수 없습니다. 먼저 …" }`

## 3. API (Route Handlers, JSON, zod 검증)
| Method/Path | 기능 |
|---|---|
| `GET/POST /api/goals` | 목록(쿼리 `year`; 연결 주간계획 + 목표 진행률 포함) / 생성(title, year) |
| `PATCH/DELETE /api/goals/[id]` | 수정(title, year) / 삭제(주간계획 0개일 때만, 아니면 409) |
| `GET/POST /api/weeks` | 목록(쿼리 `goalId`, `date`; 진행률·할 일 수 포함) / 생성(title, startDate, endDate, goalId **필수**) |
| `PATCH/DELETE /api/weeks/[id]` | 수정(title, 기간, goalId) / 삭제(할 일 0개일 때만, 아니면 409) |
| `GET/POST /api/todos` | 목록(쿼리 `date`, `weekId`, `status`, `includeOverdue=true` → 선택 날짜 이전의 미완료 할 일 포함) / 생성(title, date, weekId **필수**) |
| `PATCH/DELETE /api/todos/[id]` | 수정(title, date, weekId, status) / 삭제 |

- 에러: 400(검증 실패·잘못된 ObjectId·존재하지 않는 부모), 404, 409(삭제 차단), 500. 응답 `{ error: string }`.
- 응답 타입은 `src/types/index.ts`에서 서버·클라이언트 공유.

## 4. 파일 구조
```
todo/
  src/app/page.tsx              # 메인(탭: 일일/주간/1년)
  src/app/api/{goals,weeks,todos}/route.ts, [id]/route.ts
  src/components/Board.tsx      # 칸반 3컬럼 + DndContext + 카드(상태 select/수정/삭제)
  src/components/TodoForm.tsx
  src/components/PlanPanel.tsx, PlanForms.tsx   # 목표/주간계획 목록·진행률·CRUD 폼(GoalForm, WeekForm)
  src/components/App.tsx, AppClient.tsx         # 탭(일일/주간/1년)·상태·데이터 로딩 / ssr:false 래퍼
  src/components/ProgressBar.tsx, Toast.tsx
  src/components/Toast.tsx      # 삭제 차단/에러 안내
  src/lib/db.ts, models/{goal,week,todo}.ts, progress.ts, schemas.ts, api.ts
  tests/                        # vitest
  .env.example                  # MONGODB_URI=
```

## 5. 구현 단계
1. **세팅**: `create-next-app`(TS, App Router, Tailwind, ESLint), mongoose/zod/@dnd-kit/vitest/mongodb-memory-server 설치, `.env.example`, `.gitignore`에 `.env.local`.
2. **DB/모델**: `lib/db.ts`(global 연결 캐시), 3 모델(required 참조, 날짜 형식·순서 검증), 인덱스.
3. **Goal API + UI(P0)**: CRUD, 삭제 차단 409, 조회 시 연결 주간계획 표시. 폼은 제목·연도.
4. **Week API + UI(P0)**: CRUD, goalId 필수·존재 확인, 시작/종료일 입력, 삭제 차단, 진행률 집계(`progress.ts` `calcPercent`).
5. **Todo API + UI(P0)**: CRUD, weekId 필수·존재 확인. 생성 폼에서 주간계획 select 미선택 시 제출 불가. 주간계획이 없으면 "먼저 주간계획을 만드세요" 안내.
6. **드래그 앤 드롭**: `@dnd-kit` 컬럼=droppable, 카드=draggable, 드롭 시 낙관적 업데이트 → `PATCH status` → 실패 시 롤백 + 토스트 → 성공 시 주간 진행률 재조회. 같은 컬럼은 no-op. 키보드 센서 포함.
7. **기간별 조회(P0)**: 일일=선택 날짜의 할 일 + 그 이전 날짜의 미완료 할 일(이월, §6-5) / 주간=선택 주간계획의 할 일+진행률 / 1년=선택 연도 목표→주간계획 트리.
8. **삭제 차단 UX**: 409 메시지를 토스트/다이얼로그로 표시(하위 항목 개수 포함).
9. **P1 목표 진행률**: 아래 §6 정의에 따라 목표 목록 응답에 `progress` 추가, PlanPanel의 목표 카드에 표시.
10. **테스트 & 검증** (§9).

## 6. 확인이 필요한 PRD 해석 (가정 → 승인 시 확정)
1. **목표 진행률 계산식**: PRD는 "주간 진행률 기반"이라고만 함. 가정 = 목표에 연결된 **주간계획 진행률의 단순 평균**(할 일 0개 주간계획은 0%로 포함, 주간계획 0개면 0%). 대안: 할 일 합산 done/전체. 이전 계획의 합산 방식에서 PRD 문구에 맞춰 변경.
2. **할 일 날짜와 주간계획 기간**: PRD는 둘의 관계를 규정하지 않음 → 가정 = 날짜가 주간 기간 밖이어도 허용(검증 안 함, 임의 규칙 추가 금지).
3. **주간계획 기간 길이/겹침**: 규정 없음 → 가정 = `endDate >= startDate`만 검증, 7일 고정·겹침 금지 없음.
4. **일일/주간/1년 조회에서 "주간" 대상**: 주간계획 선택 방식 = 사이드의 주간계획 목록에서 선택.
5. **미완료 할 일 이월 (사용자 추가 요구, PRD 미반영)**: 일일 조회에서 `date`가 선택 날짜보다 이전이고 `status != done`인 할 일도 함께 표시한다(`done`이 되면 이후 날짜에서 사라짐). 오늘(실제 날짜)보다 이전 날짜의 미완료 할 일은 카드의 날짜를 **적색 굵게** 표시한다. 주간 탭(`weekId`)·API 기본 `date` 조회는 이월하지 않는다. 구현: `src/app/api/todos/route.ts`, `src/components/Board.tsx`.

## 7. RALPLAN-DR 요약
**Principles:** ① PRD 문구 우선, 규정 없는 규칙은 추가하지 않음, ② 진행률은 파생값(단일 진실 원천), ③ 무결성(필수 부모·삭제 차단)은 서버가 최종 강제, ④ 낙관적 UI는 롤백 가능, ⑤ 최소 의존성.
**Decision Drivers:** ① 진행률 정확성·즉시 반영, ② 참조 무결성(PRD 개정의 핵심), ③ 사용자 지정 스택 준수.
**Options**
- A. Mongoose + 조회 시 집계 + 서버 무결성 검사 (선택): 스키마·검증 편리 / 의존성 1개 추가, 삭제 검사 시 추가 count 쿼리.
- B. 공식 드라이버 + 직접 검증: 의존성 적음 / required·타입 보일러플레이트 증가.
- C. 진행률 비정규화 저장: 읽기 빠름 / 4경로 갱신 필요, 불일치 위험 → 기각.
- 무결성 방식: DB 트랜잭션/FK는 MongoDB에 없어 앱 레벨 검사 채택(개인용, 동시성 낮음) — 레이스 가능성은 Follow-up.

## 8. Risks & Mitigations
| 리스크 | 대응 |
|---|---|
| 0 나누기 NaN% | `calcPercent(0,0)=0` 단위 테스트 |
| 삭제 차단 우회(동시 요청: 검사 후 하위 생성) | 개인용 규모에서 수용, ADR Follow-up에 기록 |
| 존재하지 않는 부모 참조 | 생성·수정 시 존재 확인 → 400 |
| 부모 변경(weekId) 시 이전/새 주간 진행률 불일치 | 진행률 파생 계산 + UI 양쪽 재조회 |
| DnD 낙관적 업데이트 불일치 | 실패 롤백 + 재조회 |
| dev 모드 Mongo 연결 폭증 | global 캐시 |
| 잘못된 ObjectId 500 | `isValidObjectId` → 400 |
| MongoDB 미설치 | `.env.example` + README에 로컬/Atlas 안내 |

## 9. Acceptance Criteria & Verification (PRD 검증 기준 매핑)
- [x] 목표·주간계획·할 일 각각 생성→조회→수정→삭제가 목록에 반영 (API 통합 테스트 + 수동)
- [x] 할 일이 있는 주간계획 DELETE → 409, 문서 유지; 주간계획이 있는 목표 DELETE → 409, 문서 유지; 하위 없으면 200
- [x] 409 응답 시 UI에 하위 항목 개수가 포함된 안내 표시
- [x] `POST /api/todos`에 weekId 없음/존재하지 않음 → 400; `POST /api/weeks`에 goalId 없음/존재하지 않음 → 400
- [x] 주간계획 `endDate < startDate` → 400
- [x] 4개 중 1개 done → 25, 2개 → 50 (PATCH status 직후 GET 주간계획)
- [x] 연결 0개 주간계획 → `{done:0,total:0,percent:0}`
- [x] 할 일 weekId 변경 시 이전/새 주간 진행률 모두 변동
- [ ] (미검증: 실제 브라우저 포인터 드래그. 상태 select 경로·롤백·진행률 재조회는 테스트됨) 브라우저에서 doing→done 드롭 후 새로고침해도 done, 진행률 즉시 갱신
- [x] 카드에서 주간계획명, 주간계획에서 목표명, 목표에서 주간계획 목록이 화면에 표시
- [x] 일일(날짜)/주간(주간계획)/1년(목표) 조회가 각 기준으로 올바르게 필터
- [x] (P1) 주간 진행률이 50%, 100%인 두 주간계획을 가진 목표 → 75 (§6-1 가정 기준)
- [~] (tsc/lint/build 통과. 브라우저 콘솔 에러는 미확인) `tsc --noEmit`, `next lint`, `next build` 오류 0건; 브라우저 콘솔 에러 0건

## 10. ADR
- **Decision:** Next.js App Router + Route Handlers + Mongoose; 진행률은 조회 시 집계; 필수 참조·삭제 차단은 서버(zod + 존재/하위 count 검사)에서 강제.
- **Drivers:** 진행률 정확성, 참조 무결성, 사용자 지정 스택.
- **Alternatives:** 공식 드라이버(B), 비정규화 진행률(C), 고아 허용 삭제(PRD 개정으로 기각).
- **Why chosen:** 파생 계산이 "즉시 재계산"을 구조적으로 보장하고, 서버 검사가 UI 우회와 무관하게 무결성을 지킴.
- **Consequences:** 조회마다 집계 비용(개인용 규모에서 무시 가능); 삭제 검사와 삭제 사이 경쟁 가능성.
- **Follow-ups:** (인증/다중 사용자는 구현됨 — 남은 것: CSRF 토큰/Origin 검사, 로그인 rate limit, 실제 GitHub 왕복 검증), 목표 진행률 공식 확정(§6-1), 할 일 날짜-주간 기간 일치 검증 필요 여부, 모바일 터치 DnD, Playwright e2e.

## Changelog
- v2: 스택 재선정(Next.js/MongoDB) 반영
- v3: PRD 개정 반영 — 필수 부모, 삭제 차단(409), 주간 시작·종료일, 목표/주간 P0 승격, 기간별 조회 P0, 연결 탐색 P1 삭제, 목표 진행률 계산식을 PRD 문구 기준으로 변경, 해석 가정 §6 명시
