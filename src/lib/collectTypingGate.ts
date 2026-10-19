const pending = new Map<string, () => void>();
let active = false;
let quietTimer: ReturnType<typeof setTimeout> | null = null;

/** 글자 사이의 쉼보다 길게 잡아, 다음 글자가 오기 전에 목록 갱신이 시작되지 않게 한다. */
export const COLLECT_TYPING_QUIET_MS = 800;

export function isCollectInputActive() {
  return active;
}

export function markCollectInputActive() {
  active = true;
  if (quietTimer !== null) {
    clearTimeout(quietTimer);
    quietTimer = null;
  }
}

export function markCollectInputIdle() {
  if (quietTimer !== null) {
    clearTimeout(quietTimer);
    quietTimer = null;
  }
  active = false;
  const tasks = [...pending.values()];
  pending.clear();
  for (const task of tasks) task();
}

/**
 * 칸을 벗어난 직후가 아니라, 한동안 입력이 없을 때 갱신한다.
 * 한글 조합이나 포커스 이동이 blur를 일으켜도 그 자리에서 미수 목록을 다시 그리지 않는다.
 */
export function scheduleCollectInputIdle() {
  if (quietTimer !== null) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quietTimer = null;
    markCollectInputIdle();
  }, COLLECT_TYPING_QUIET_MS);
}

/**
 * 수금 칸을 치는 동안 Firestore 스냅샷이 미수 목록 전체를 다시 그리면
 * 메인 스레드가 막혀 '김민'이나 '101' 다음에 나머지 글자가 1초쯤 늦게 붙는다.
 * 문서 변환까지 이 안으로 넣고, 같은 키는 마지막 것만 남긴다.
 */
export function deferWhileCollectTyping(key: string, apply: () => void) {
  if (!active) {
    apply();
    return;
  }
  pending.set(key, apply);
}
