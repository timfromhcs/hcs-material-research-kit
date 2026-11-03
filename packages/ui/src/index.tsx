import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  flush,
  className,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}): JSX.Element {
  return (
    <section
      className={cx("panel", className)}
      id={id}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {(title || actions) && (
        <header className="panel-header">
          <div>
            {title && <div className="panel-title">{title}</div>}
            {subtitle && <div className="panel-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={cx("panel-body", flush && "flush")}>{children}</div>
    </section>
  );
}

export type BadgeTone = "ok" | "warn" | "err" | "info" | "neutral";

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}): JSX.Element {
  return (
    <span className={cx("badge", `badge-${tone}`)} title={title}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
}): JSX.Element {
  return (
    <dl className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </dd>
      {hint && (
        <div className="tiny muted" style={{ marginTop: 6 }}>
          {hint}
        </div>
      )}
    </dl>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Callout({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "error" | "info";
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={cx(
        "callout",
        tone === "error" && "callout-error",
        tone === "info" && "callout-info",
      )}
      role={tone === "error" ? "alert" : "note"}
    >
      {children}
    </div>
  );
}

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";

export function Button({
  variant = "default",
  size = "md",
  disabled,
  onClick,
  children,
  type = "button",
  title,
  ariaLabel,
}: {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  title?: string;
  ariaLabel?: string;
}): JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "btn-ghost",
        variant === "danger" && "btn-danger",
        size === "sm" && "btn-sm",
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
