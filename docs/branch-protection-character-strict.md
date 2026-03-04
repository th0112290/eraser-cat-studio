# Branch Protection: Character Strict Smoke

## Goal
- `main` 브랜치 병합 전에 `Character Strict Smoke` 워크플로 결과를 필수로 통과시킨다.

## Required Workflow
- Workflow file: `.github/workflows/character-strict-smoke.yml`
- Workflow name: `Character Strict Smoke`
- Job id: `smoke-character-strict`

## Setup (GitHub UI)
1. GitHub 저장소에서 `Settings` -> `Branches`로 이동한다.
2. `Branch protection rules`에서 `Add rule`을 선택한다.
3. `Branch name pattern`에 `main`을 입력한다.
4. `Require a pull request before merging`를 활성화한다.
5. `Require status checks to pass before merging`를 활성화한다.
6. 검색/선택 목록에서 strict smoke 체크를 추가한다.
   - 일반적으로 `smoke-character-strict` 또는 `Character Strict Smoke / smoke-character-strict` 형태로 표시된다.
7. 필요하면 `Require branches to be up to date before merging`를 활성화한다.
8. `Create` 또는 `Save changes`를 눌러 규칙을 저장한다.

## Verification
1. 테스트 PR을 열고, `apps/worker` 또는 `scripts/smokeCharacter.mjs`를 수정한다.
2. `Character Strict Smoke` 워크플로가 자동 실행되는지 확인한다.
3. 체크가 실패하면 merge가 차단되는지 확인한다.
4. 체크가 성공하면 merge 가능 상태로 전환되는지 확인한다.

## Troubleshooting
- 체크 항목이 선택 목록에 안 보이면:
  - PR에서 워크플로를 1회 이상 성공 실행한 뒤 다시 확인한다.
- 실행 시간이 길면:
  - 현재 워크플로 `paths` 필터에 포함된 변경만 PR 트리거됨을 확인한다.
- false fail이 반복되면:
  - Actions 로그 아티팩트(`character-strict-smoke-logs`)의 `api.log`, `worker.log`를 먼저 확인한다.
