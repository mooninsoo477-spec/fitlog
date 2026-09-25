# FitLog OpenAI API 연결

FitLog은 FactChat API 키를 휴대폰이나 GitHub Pages에 저장하지 않습니다. Supabase Edge Function이 키를 안전하게 보관하고 Mindlogic FactChat Gateway로 식단 분석 요청만 중계합니다.

## 추천 설정

- 모델: `gpt-5.6-luna`
- 추론 강도: `low`
- 최대 출력: 650 tokens (여러 음식 항목을 개별 반환)
- 사진: 텍스트 설명이 있으면 `low`, 사진만 있으면 `high`

## 1. Supabase 함수 올리기

저장소의 `supabase/functions/analyze-meal/index.ts` 파일을 Supabase 프로젝트의 같은 경로에 배포합니다.

Supabase CLI를 쓴다면 프로젝트 폴더에서 다음 순서로 실행합니다.

```bash
supabase login
supabase link --project-ref 프로젝트_REF
supabase functions deploy analyze-meal --no-verify-jwt
```

CLI 없이 대시보드에서 올릴 때는 **Supabase 대시보드 → Edge Functions → smart-endpoint → Code**에 `index.ts` 전체를 붙여넣고 **Deploy**를 누릅니다. 브라우저에서 함수 주소를 열었을 때 `"version": "20260926-coach"`가 보이면 최신 버전입니다.

함수가 지원하는 모드: `analyze`(식단 분석), `recommend`(남은 끼니), `coach`, `plan`(주간 운동 계획), `report`(주간 리포트), `advice`(특별 일정 조언).

## 2. 비밀값 설정

FactChat 개발자 페이지에서 받은 API 키와 직접 정한 긴 임의 문자열을 Supabase Secret으로 설정합니다.

```bash
supabase secrets set FACTCHAT_API_KEY="FactChat_API_키"
supabase secrets set FITLOG_FUNCTION_TOKEN="길고_추측하기_어려운_임의_문자열"
```

`FITLOG_FUNCTION_TOKEN`은 OpenAI 키가 아닙니다. 32자 이상의 무작위 문자열을 권장합니다. GitHub 저장소나 `index.html`에 넣지 마세요.

## 3. FitLog에서 연결

1. FitLog의 **더보기 → 여러 기기 동기화**에 기존 Supabase URL과 publishable/anon 키를 입력합니다.
2. **더보기 → OpenAI GPT 연결**에서 `GPT-5.6 Luna`를 선택합니다.
3. `AI 연결 토큰`에 위에서 만든 `FITLOG_FUNCTION_TOKEN` 값을 입력하고 저장합니다.
4. 식단 기록에서 텍스트나 사진을 넣고 **AI 분석 후 바로 기록**을 누릅니다.

## 보안 주의

- `FACTCHAT_API_KEY`를 `index.html`, `app-v4.js`, GitHub 저장소 또는 브라우저 저장소에 넣지 마세요.
- 키가 노출됐다고 의심되면 OpenAI에서 즉시 폐기하고 새 키로 교체하세요.
- 사용량 상한과 알림은 OpenAI 프로젝트 설정에서 별도로 지정하세요.
