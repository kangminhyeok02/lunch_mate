# 🍚 LUNCH MATE

삼성증권 신입사원 36명의 **메뉴 선호 · 식사 속도 · 과거 만남 이력**을 기반으로 최적의 점심조를 구성하고,
조별 질문과 미션으로 자연스러운 네트워킹을 유도하는 실시간 점심 매칭 웹서비스.

> 오늘 메뉴부터 식사 속도까지, 나에게 맞는 점심 메이트

## 사용자 플로우

```
QR/링크 → 이름 선택 → 메뉴 선택 → 식사 속도 선택 → 대기 화면
                                              ↓ (관리자 배정)
        점심조 공개 → Matching Point → 오늘의 질문 → 오늘의 미션
                                    답변 작성 →
                                    조원 답변 공유 →
                                    (전원 완료 시 미션 화면으로)
```

오늘의 질문 화면에서는 각자 답을 적어 올리고, **자기 답을 올린 사람에게만** 같은 조원들의
답변이 공개됩니다. 남의 답을 보고 따라 쓰는 걸 막아 대화가 다양해지도록 한 장치입니다.
답변은 언제든 수정할 수 있고, 5초마다 갱신되어 새 답변이 올라오면 자동으로 나타납니다.
공개된 답변에는 👍 ❤️ 😂 를 달 수 있습니다(같은 걸 한 번 더 누르면 취소). 아직 쓰지 않은
조원의 이름도 함께 보여 서로 재촉할 수 있습니다.

오늘의 미션은 **조원 전원이 답변을 올린 뒤** `/mission` 화면에서 열립니다. 누군가 자리를 비워
조가 멈췄다면 `/admin`의 **미션 강제 공개**로 조건을 건너뛸 수 있고, 언제든 자동 조건으로
되돌릴 수 있습니다.

## 기술 스택

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase · Vercel

---

## 1. 로컬 실행

```bash
npm install
cp .env.example .env    # 값 채우기
npm run dev             # http://localhost:3000
```

Supabase 없이도 바로 돌아갑니다. 환경변수가 없으면 로컬 JSON 파일(`data/lunch-mate.json`)에
저장하는 어댑터가 자동으로 선택됩니다.

## 2. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 배포 시 | `https://<project-ref>.supabase.co` — 대시보드 주소가 아닙니다 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 배포 시 | anon / public (publishable) 키. 브라우저 노출 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | 선택 | service_role (secret) 키. **`NEXT_PUBLIC_` 금지** |
| `ADMIN_PASSWORD` | ✅ | `/admin` 비밀번호. 없으면 관리자 페이지가 잠깁니다 |
| `LUNCH_MATE_ROSTER` | 선택 | 쉼표로 구분한 36명 이름. 없으면 `src/data/roster.seed.json` 사용 |

Supabase 키 위치: **Project Settings → API**

⚠️ `NEXT_PUBLIC_*` 변수는 **빌드 시점에 번들에 박힙니다.** Vercel에서는 환경변수를 먼저 등록한 뒤
배포(또는 재배포)해야 반영됩니다.

## 3. Supabase 스키마

Supabase Studio → **SQL Editor** → `supabase/migration.sql` 전체 붙여넣기 → Run.

확인:

```bash
npm run check:supabase
```

## 4. 참가자 명단

기본값은 `src/data/roster.seed.json`의 예시 이름 36개입니다. **실제 행사 전에 반드시 교체하세요.**

```bash
# .env
LUNCH_MATE_ROSTER=강민혁,김서준,이도윤,...
```

## 5. 배정 알고리즘

점수가 낮을수록 좋은 조합입니다.

```
score = 이전 조 중복      × 100
      + 식사 속도 차이     × 30
      + 메뉴 불일치        × 10
      + 조 인원 불균형     × 100
```

가중치는 `src/lib/matching.ts`의 `WEIGHTS`에서 조정합니다.

- **메뉴·속도로 초기 클러스터링** 후 **최선 개선 교환(best-improvement swap) 지역 탐색**으로 최적화
- 같은 seed + 같은 입력 → **항상 같은 결과** (재현 가능, 디버깅 가능)
- 제출 순서는 결과에 영향을 주지 않음
- 이전에 같은 조였던 사람은 가능한 한 분리 (해결 가능하면 중복 0쌍)
- 인원이 4의 배수가 아니어도 조별 인원 차이는 최대 1명

## 5.1 메뉴 사진 교체

두 가지 방법이 있습니다.

**① 관리자 페이지에서 업로드** (재배포 없음, 권장)

`supabase/storage.sql` 을 한 번 실행해두면 `/admin` 의 "오늘의 메뉴 설정"에서
사진을 바로 올릴 수 있습니다. 준비 상태는 `npm run check:storage` 로 확인합니다.

**② 저장소에 파일로 넣기** (스토리지 설정 불필요)

`food/1.*` 을 MENU A, `food/2.*` 를 MENU B 사진으로 두고:

```bash
npm run menu:sync    # public/menu/ 로 복사하고 기본 메뉴의 경로를 갱신
npm run build        # 확인
git add -A && git commit -m "메뉴 사진 교체" && git push
```

jpg / jpeg / png / webp 를 지원하며, 확장자가 바뀌면 코드의 `imageUrl` 도 함께 맞춰집니다.
①과 달리 날짜와 무관하게 항상 표시되므로, 행사 당일 설정을 깜빡할 일이 없습니다.

## 6. 관리자 페이지

`/admin` — 비밀번호는 `ADMIN_PASSWORD`.

참여 현황, 메뉴별·속도별 인원, 미제출자 명단, 오늘의 메뉴 2개 설정,
**점심조 배정 시작**, 배정 결과 재생성, 조별 질문·미션 확인.

비밀번호는 브라우저로 전달되지 않고, HMAC 토큰만 httpOnly 쿠키에 저장됩니다.

## 7. 테스트

```bash
npm test              # 단위 테스트 74개
npm run build         # 타입 체크 + 프로덕션 빌드

# 전체 사용자 플로우 E2E (서버를 먼저 띄운 상태에서)
LUNCH_MATE_FORCE_FILE_STORE=1 ADMIN_PASSWORD=test-admin-pw \
  LUNCH_MATE_DATA_FILE=/tmp/lm/db.json npx next start -p 3123 &
ADMIN_PASSWORD=test-admin-pw npm run e2e -- http://127.0.0.1:3123
```

E2E는 36명 동시 제출, 중복 제출 차단, 미인증 배정 요청 차단, 9개 조 배정,
전원 결과 조회, 재배정까지 실제 HTTP로 검증합니다.

답변 공유 기능은 별도 E2E로 검증합니다. 같은 서버를 띄운 상태에서:

```bash
ADMIN_PASSWORD=test-admin-pw npm run e2e:answers -- http://127.0.0.1:3123
```

공개 게이트(내 답을 올리기 전에는 조원 답변이 응답에 포함되지 않는지), 수정 시 중복 생성 여부,
다른 조 답변과의 격리, 빈 답변·300자 초과·명단 외 사용자 거부, 미션 잠금/전원 답변 시 자동 해제/
관리자 강제 공개와 되돌리기까지 확인합니다.

⚠️ 두 E2E는 같은 날짜의 데이터를 쓰므로 **각각 깨끗한 서버에서 돌려야** 합니다. 이어서 돌리면
뒤에 실행한 쪽이 이미 제출·배정된 상태를 만나 실패합니다.

## 8. Vercel 배포

```bash
git init && git add -A && git commit -m "LUNCH MATE"
gh repo create lunch-mate --private --source=. --push
```

1. [vercel.com/new](https://vercel.com/new) → GitHub 저장소 import
2. **Environment Variables**에 위 표의 변수 등록 (`SUPABASE_SERVICE_ROLE_KEY`는 `NEXT_PUBLIC_` 없이)
3. Deploy
4. 배포 URL로 QR 생성:

```bash
npm run qr -- https://your-app.vercel.app
# → public/qr/lunch-mate.png, .svg
```

⚠️ Vercel의 파일 시스템은 요청마다 초기화됩니다. **실제 행사에서는 Supabase 설정이 필수**입니다.
관리자 페이지 상단에 현재 저장소 종류가 표시되니 배포 후 확인하세요.

## 9. 행사 당일 운영

1. `npm run check:supabase`로 스키마 확인
2. `/admin` 로그인 → 오늘의 메뉴 2개 설정
3. QR 배포 → 참가자 제출 (관리자 화면에서 실시간 카운트)
4. 36/36 도달 시 **점심조 배정 시작** (조가 미션 앞에서 멈추면 **미션 강제 공개**)
5. 참가자 화면은 자동으로 결과로 전환 (Supabase Realtime, 미설정 시 폴링)
6. 리허설 후 데이터 초기화: `npm run reset:day`

## 프로젝트 구조

```
src/
  app/            페이지 + API 라우트
  lib/
    matching.ts   배정 알고리즘 (점수 기반 + 지역 탐색)
    prompts.ts    조별 질문/미션 배분
    assignment.ts 알고리즘 ↔ 저장소 연결, 답변 공개 규칙(getAnswerBoard)
    auth.ts       관리자 인증
    store/        저장소 추상화 (파일 / Supabase)
  data/           명단·질문·미션 시드
supabase/         migration.sql
scripts/          QR 생성, E2E, 스키마 확인, 데이터 초기화
tests/            단위 테스트
```
