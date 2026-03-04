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

## Auto Capture PR Check Names
- 목적: Branch protection에 넣어야 하는 "정확한 체크 이름"을 자동으로 수집한다.

### Command
1. 환경변수 설정:
   - `GITHUB_TOKEN` (repo read 권한 포함)
   - `GITHUB_REPOSITORY` (예: `owner/repo`)
   - `PR_NUMBER` (예: `123`)
2. 실행:
   - `pnpm ci:checks:capture -- --json`
3. 결과에서 `checkNames` 배열 또는 텍스트 목록을 확인한다.
4. `Character Strict Smoke / smoke-character-strict`에 해당하는 항목을 branch protection required check로 등록한다.

### Example (PowerShell)
```powershell
$env:GITHUB_TOKEN="ghp_xxx"
$env:GITHUB_REPOSITORY="owner/repo"
$env:PR_NUMBER="123"
pnpm ci:checks:capture -- --json
```

### Auto Detect (gh CLI)
- `gh auth login`이 되어 있고, 현재 브랜치가 PR과 연결되어 있으면 인자 없이 자동 탐색 가능:
```powershell
pnpm ci:checks:capture -- --json
```
- 자동 탐색 소스:
  - `gh repo view --json nameWithOwner`
  - `gh pr view --json number`
- 자동 탐색 실패 시 스크립트가 힌트 코드를 함께 출력한다:
  - `gh_not_installed`
  - `gh_not_authenticated`
  - `no_pr_for_current_branch`

## Troubleshooting
- 체크 항목이 선택 목록에 안 보이면:
  - PR에서 워크플로를 1회 이상 성공 실행한 뒤 다시 확인한다.
- 실행 시간이 길면:
  - 현재 워크플로 `paths` 필터에 포함된 변경만 PR 트리거됨을 확인한다.
- false fail이 반복되면:
  - Actions 로그 아티팩트(`character-strict-smoke-logs`)의 `api.log`, `worker.log`를 먼저 확인한다.
