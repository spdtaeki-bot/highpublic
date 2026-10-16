import React, { useEffect, useRef, useState } from "react";

interface SearchFieldProps {
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  "aria-label"?: string;
}

/**
 * 붙여 넣은 글자가 화면에 반영되지 않는 환경(조합 이벤트 없는 붙여넣기 포함)에서도
 * input/paste 값을 검색어로 쓴다. 입력값은 이 칸이 바로 갖고, 부모 값이 따라오기 전에 지우지 않는다.
 */
export function resolvePastedSearchValue(
  before: string,
  pasted: string,
  start: number,
  end: number,
  domValue: string,
): string {
  if (domValue !== before) return domValue;
  if (!pasted) return before;
  return before.slice(0, start) + pasted + before.slice(end);
}

export function SearchField({
  value,
  onValue,
  placeholder,
  className,
  onKeyDown,
  onFocus,
  onClick,
  autoFocus,
  inputRef,
  "aria-label": ariaLabel,
}: SearchFieldProps) {
  const [text, setText] = useState(value);
  const emitted = useRef(value);
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(value);
    }
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    if (next === emitted.current) return;
    emitted.current = next;
    onValueRef.current(next);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      lang="ko"
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      className={className}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={onClick}
      onChange={(event) => commit(event.currentTarget.value)}
      onInput={(event) => commit(event.currentTarget.value)}
      onCompositionEnd={(event) => commit(event.currentTarget.value)}
      onPaste={(event) => {
        const el = event.currentTarget;
        const before = el.value;
        const pasted = event.clipboardData?.getData("text") ?? "";
        const start = el.selectionStart ?? before.length;
        const end = el.selectionEnd ?? start;
        window.setTimeout(() => {
          commit(resolvePastedSearchValue(before, pasted, start, end, el.value));
        }, 0);
      }}
    />
  );
}
