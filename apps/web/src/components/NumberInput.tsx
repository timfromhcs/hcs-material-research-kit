import { useEffect, useState } from "react";

/**
 * Locale-tolerant numeric input.
 *
 * `type="number"` silently yields an empty value for entries its locale cannot
 * parse (e.g. "8,5" in en-US), which would reset a physical parameter without
 * telling the user. This input accepts both decimal separators and only calls
 * `onChange` for finite values.
 */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel,
  className = "input num",
  disabled,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}): JSX.Element {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = Number(next.replace(",", ".").trim());
        if (!Number.isFinite(parsed)) return;
        let clamped = parsed;
        if (min !== undefined) clamped = Math.max(min, clamped);
        if (max !== undefined) clamped = Math.min(max, clamped);
        onChange(clamped);
      }}
      onBlur={() => setText(String(value))}
      data-step={step}
    />
  );
}
