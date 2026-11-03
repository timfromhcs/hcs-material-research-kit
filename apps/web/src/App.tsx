import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useI18n, type Lang } from "./i18n";
import { WorkspaceProvider, useWorkspace } from "./state/store";
import { useHardware } from "./lib/useHardware";
import { CORE_VERSION, describeBackend } from "@hcs-materials/core";
import { Badge, cx } from "@hcs-materials/ui";
import {
  IconAtoms,
  IconDashboard,
  IconJobs,
  IconMoon,
  IconPlay,
  IconSettings,
  IconShield,
  IconSun,
} from "./components/icons";
import { Dashboard } from "./routes/Dashboard";
import { StructureStudio } from "./routes/StructureStudio";
import { Workbench } from "./routes/Workbench";
import { JobsPage } from "./routes/JobsPage";
import { ProvenancePage } from "./routes/ProvenancePage";
import { SettingsPage } from "./routes/SettingsPage";

type Theme = "dark" | "light";
const THEME_KEY = "hcs.theme";

function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore blocked storage */
    }
  }, [theme]);
  return [theme, setTheme];
}

const NAV_ITEMS = [
  { to: "/", key: "nav.dashboard", icon: IconDashboard, group: "research" },
  { to: "/studio", key: "nav.studio", icon: IconAtoms, group: "research" },
  { to: "/workbench", key: "nav.workbench", icon: IconPlay, group: "research" },
  { to: "/jobs", key: "nav.jobs", icon: IconJobs, group: "research" },
  { to: "/provenance", key: "nav.provenance", icon: IconShield, group: "system" },
  { to: "/settings", key: "nav.settings", icon: IconSettings, group: "system" },
] as const;

function TopBar(): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const { project, structures, activeStructureId, jobs } = useWorkspace();
  const { report } = useHardware();
  const [theme, setTheme] = useTheme();
  const active = structures.find((structure) => structure.structure_id === activeStructureId);
  const running = jobs.filter((job) => job.job.state === "running").length;

  return (
    <div className="topbar">
      <div className="topbar-context">
        <span className="topbar-title">{project.name}</span>
        <span className="muted small">·</span>
        {active ? (
          <span className="small secondary">
            {active.composition?.reduced_formula ?? active.display_name ?? active.structure_id} ·{" "}
            {active.sites.length} {t("common.atoms")}
          </span>
        ) : (
          <span className="small muted">{t("dashboard.projectEmpty")}</span>
        )}
        {running > 0 && <Badge tone="info">{`${running} ${t("common.running")}`}</Badge>}
      </div>
      <div className="row">
        {report && (
          <Badge tone={report.webgpu.available ? "info" : "neutral"} title={report.webgpu.reason}>
            {report.selectedBackend.toUpperCase()}
          </Badge>
        )}
        <div className="lang-switch" role="group" aria-label={t("common.language")}>
          {(["en", "de", "fr"] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? t("common.light") : t("common.dark")}
          title={theme === "dark" ? t("common.light") : t("common.dark")}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </div>
  );
}

function StatusBar(): JSX.Element {
  const { t } = useI18n();
  const { report } = useHardware();
  return (
    <footer className="status-bar">
      <div className="status-cluster">
        <span>{report ? describeBackend(report) : `${t("common.loading")}…`}</span>
        {report?.storage.quotaBytes !== undefined && (
          <span>
            {t("dashboard.storage")}:{" "}
            {((report.storage.usageBytes ?? 0) / 1024 / 1024).toFixed(1)} /{" "}
            {(report.storage.quotaBytes / 1024 / 1024).toFixed(0)} MB
          </span>
        )}
      </div>
      <div className="status-cluster">
        <span>{t("science.localOnly")}</span>
        <span>v{CORE_VERSION}</span>
      </div>
    </footer>
  );
}

function Shell(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <div className="brand">
        <img className="brand-mark" src="./brand/mark.svg" alt="" />
        <div>
          <div className="brand-name">{t("app.short")}</div>
          <div className="brand-sub">{t("app.tagline")}</div>
        </div>
      </div>
      <TopBar />
      <nav className="rail" aria-label={t("app.name")}>
        {NAV_ITEMS.map((item, index) => {
          const previous = NAV_ITEMS[index - 1];
          const showGroup = !previous || previous.group !== item.group;
          const Icon = item.icon;
          return (
            <div key={item.to} style={{ display: "contents" }}>
              {showGroup && (
                <div className="rail-group">
                  {item.group === "research" ? t("nav.groupResearch") : t("nav.groupSystem")}
                </div>
              )}
              <NavLink
                to={item.to}
                end={item.to === "/"}
                aria-label={t(item.key)}
                title={t(item.key)}
                className={({ isActive }) => cx("rail-item", isActive && "active")}
              >
                <Icon className="rail-icon" />
                <span className="rail-label">{t(item.key)}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>
      <main className="workspace">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/studio" element={<StructureStudio />} />
          <Route path="/workbench" element={<Workbench />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/provenance" element={<ProvenancePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <StatusBar />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
