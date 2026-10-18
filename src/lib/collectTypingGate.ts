const pending = new Map<string, () => void>();
let active = false;

export function isCollectInputActive() {
  return active;
}

export function markCollectInputActive() {
  active = true;
}

export function markCollectInputIdle() {
  active = false;
  const tasks = [...pending.values()];
  pending.clear();
  for (const task of tasks) task();
}

/**
 * 수금 칸을 치는 동안 Firestore 스냅샷이 미수 목록 전체를 다시 그리면
 * 메인 스레드가 막혀 숫자 '19' 다음에 '31'이 늦게 붙는다.
 * 같은 키의 갱신은 마지막 것만 남기고, 입력이 끝난 뒤에 한 번 적용한다.
 */
export function deferWhileCollectTyping(key: string, apply: () => void) {
  if (!active) {
    apply();
    return;
  }
  pending.set(key, apply);
}
