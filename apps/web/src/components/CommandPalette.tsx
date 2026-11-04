import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cx } from "@hcs-materials/ui";
import { useI18n, type Lang } from "../i18n";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

/**
 * Keyboard-first command palette (Ctrl/Cmd-K).
 *
 * It only exposes actions that already exist elsewhere in the interface —
 * navigation, theme and language — so it cannot become a hidden second UI with
 * different behaviour. Arrow keys move, Enter runs, Escape closes.
 */
export function CommandPalette({
  open,
  onClose,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
}): JSX.Element | null {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    return [
      {
        id: "nav-dashboard",
        label: t("nav.dashboard"),
        group: t("command.navigate"),
        run: go("/"),
      },
      {
        id: "nav-studio",
        label: t("nav.studio"),
        group: t("command.navigate"),
        run: go("/studio"),
      },
      {
        id: "nav-workbench",
        label: t("nav.workbench"),
        group: t("command.navigate"),
        run: go("/workbench"),
      },
      { id: "nav-jobs", label: t("nav.jobs"), group: t("command.navigate"), run: go("/jobs") },
      {
        id: "nav-provenance",
        label: t("nav.provenance"),
        group: t("command.navigate"),
        run: go("/provenance"),
      },
      {
        id: "nav-settings",
        label: t("nav.settings"),
        group: t("command.navigate"),
        run: go("/settings"),
      },
      {
        id: "theme",
        label: t("command.toggleTheme"),
        group: t("command.appearance"),
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
      ...(["en", "de", "fr"] as Lang[]).map((code) => ({
        id: `lang-${code}`,
        label: `${t("common.language")}: ${code.toUpperCase()}`,
        hint: code === lang ? "✓" : undefined,
        group: t("command.language"),
        run: () => {
          setLang(code);
          onClose();
        },
      })),
    ];
  }, [t, lang, navigate, onClose, onToggleTheme, setLang]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.group} ${command.label}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const run = (index: number): void => {
    const command = filtered[index];
    if (command) command.run();
  };

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-labelledby="palette-title">
        <h2 id="palette-title" className="sr-only">
          {t("command.title")}
        </h2>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={filtered[active] ? `palette-${filtered[active]!.id}` : undefined}
          placeholder={t("command.placeholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => (filtered.length ? (current + 1) % filtered.length : 0));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) =>
                filtered.length ? (current - 1 + filtered.length) % filtered.length : 0,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(active);
            }
          }}
        />
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {filtered.length === 0 && (
            <li className="palette-empty" role="presentation">
              {t("command.noResults")}
            </li>
          )}
          {filtered.map((command, index) => (
            <li
              key={command.id}
              id={`palette-${command.id}`}
              role="option"
              aria-selected={index === active}
              className={cx("palette-item", index === active && "active")}
              onMouseEnter={() => setActive(index)}
              onClick={() => run(index)}
            >
              <span>{command.label}</span>
              <span className="palette-group">
                {command.group}
                {command.hint ? ` ${command.hint}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t("command.move")}
          </span>
          <span>
            <kbd>↵</kbd> {t("command.run")}
          </span>
          <span>
            <kbd>esc</kbd> {t("command.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
