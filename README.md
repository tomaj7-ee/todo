# 할 일 관리 앱

1년 목표 → 주간계획 → 할 일을 연결해 관리하는 칸반형 할 일 앱.
Next.js(App Router) + TypeScript + MongoDB(Mongoose) + Route Handlers.

- 요구사항: [docs/PRD.md](docs/PRD.md)
- 구현 계획: [docs/PLAN.md](docs/PLAN.md)

## 준비

1. Node.js 20+ 와 MongoDB(로컬 또는 Atlas)가 필요합니다.
2. `.env.example`을 `.env.local`로 복사하고 `MONGODB_URI`를 설정합니다.

   ```
   MONGODB_URI=mongodb://127.0.0.1:27017/todo-app
   ```

   Atlas를 쓰는 경우 `mongodb+srv://<user>:<password>@<cluster>/<db>` 형식의 연결 문자열을 넣으세요.
   `.env.local`은 git에 포함되지 않습니다.
3. 의존성 설치: `npm install`

## GitHub 로그인 설정

앱은 GitHub OAuth 로그인이 필요합니다. 로그인하지 않으면 할 일 API는 401을 반환하고 화면에는 로그인 버튼만 보입니다.

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** 을 엽니다.
2. 다음과 같이 입력합니다.
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
3. 생성 후 **Client ID** 를 복사하고, **Generate a new client secret** 으로 시크릿을 만들어 복사합니다.
4. `.env.local`(또는 `.env`)에 넣습니다. **시크릿은 코드나 git에 넣지 마세요.**

   ```
   GITHUB_CLIENT_ID=<Client ID>
   GITHUB_CLIENT_SECRET=<Client secret>
   APP_URL=http://localhost:3000
   ```

5. 다른 주소/포트로 실행하면 `APP_URL`과 GitHub에 등록한 callback URL을 둘 다 같은 값으로 바꾸세요. 서버를 재시작해야 환경변수가 반영됩니다.

로그인 흐름: `GET /auth/github` → GitHub 승인 → `GET /auth/github/callback`(state 검증, 사용자 저장, 세션 쿠키 발급) → `/`.
세션은 MongoDB에 저장되며(원본 토큰이 아닌 해시만 저장) 7일 후 만료됩니다. `POST /auth/logout`은 세션을 DB에서 삭제하고 쿠키를 만료시킵니다.

### 기존 데이터 마이그레이션

로그인 도입 전에 만든 데이터에는 `userId`가 없어 아무에게도 보이지 않습니다. GitHub로 한 번 로그인한 뒤, 그 데이터를 해당 사용자에게 귀속시키려면:

```
npm run migrate:user-id -- --username <GitHub 사용자명> --dry-run   # 대상 개수만 확인 (DB 변경 없음)
npm run migrate:user-id -- --username <GitHub 사용자명>             # 실제 적용
```

- `userId`가 없는 goals / weeks / todos만 갱신하며, 이미 소유자가 있는 데이터는 건드리지 않습니다. 여러 번 실행해도 결과가 같습니다.
- 연결 대상은 `MONGODB_URI`(`.env` / `.env.local`)입니다. 실행 시 대상 `host/db`가 출력되니 먼저 확인하세요.

## 실행

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run migrate:user-id -- --username <name> [--dry-run]` | 기존 데이터에 userId 채우기 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 |
| `npm test` | 테스트 (API 통합 테스트는 `mongodb-memory-server`가 임시 MongoDB를 내려받아 사용하므로 최초 1회 네트워크가 필요) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint |

## 사용 흐름

1. 1년 목표 생성(제목·연도)
2. 주간계획 생성(제목·시작일·종료일, 1년 목표 필수)
3. 할 일 생성(제목·날짜, 주간계획 필수)
4. 카드를 다른 컬럼(할 일/진행 중/완료)으로 드래그하거나 카드의 상태 선택으로 상태 변경 → 주간 진행률 즉시 갱신
5. 하위 항목이 있는 주간계획·1년 목표는 삭제할 수 없고 안내 메시지가 표시됩니다.
6. 상단 탭으로 일일(날짜) / 주간(주간계획) / 1년(연도) 단위 조회

## API

`/api/goals`, `/api/weeks`, `/api/todos` (각각 `GET`/`POST`, `/[id]`에서 `PATCH`/`DELETE`).
조회 쿼리: goals `?year=`, weeks `?goalId=&date=`, todos `?date=&weekId=&status=&includeOverdue=true`.
오류 응답은 `{ "error": string }` (400 검증 실패, 401 로그인 필요, 404 없음, 409 삭제 차단).

모든 데이터 API는 로그인한 사용자 본인의 데이터만 다룹니다. 다른 사용자의 id로 접근하면 존재하지 않는 id와 똑같이 404를 반환합니다.

인증: `GET /auth/github`, `GET /auth/github/callback`, `POST /auth/logout`, `GET /api/me`(로그인 사용자 정보, 비로그인은 401).

## 구현 가정 (PRD에 명시되지 않은 부분)

- 1년 목표 진행률 = 연결된 주간계획 진행률의 단순 평균 (주간계획이 없으면 0%)
- 할 일 날짜가 주간계획 기간 밖이어도 허용
- 로그인은 GitHub OAuth만 지원합니다. 소유자 필드 이름은 Mongoose 관례에 맞춰 `user_id`가 아닌 `userId`입니다(`goalId`, `weekId`와 동일한 규칙).
