import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/");
  // Every test starts from a clean workspace; IndexedDB is origin-scoped.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("hcs-materials");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "HCS Material Research Kit" })).toBeVisible();
});

async function createSilicon(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Silicon \(diamond\)/ }).click();
  await expect(page).toHaveURL(/#\/studio/);
  await expect(page.getByRole("heading", { name: "Structure Studio" })).toBeVisible();
}

async function createArgonRun(page: Page, task: "energy" | "md" = "energy"): Promise<void> {
  await page.goto("/#/");
  await page.getByRole("button", { name: /Argon \(fcc, LJ reference\)/ }).click();
  await expect(page).toHaveURL(/#\/studio/);
  await page.getByRole("link", { name: "Simulation Workbench" }).click();
  await expect(page.getByRole("heading", { name: "Simulation Workbench" })).toBeVisible();
  if (task === "md") {
    await page.getByRole("combobox", { name: "Task" }).selectOption("md.run");
    await expect(page.getByText("NVE only. There is no thermostat")).toBeVisible();
  }
  await page.getByRole("button", { name: "Run calculation" }).click();
  await expect(page.getByText("Result stored in this project.")).toBeVisible({ timeout: 60_000 });
}

test("creates a documented crystal and validates it", async ({ page }) => {
  await createSilicon(page);
  await expect(page.getByText("8 atoms", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("valid", { exact: true }).first()).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("No unphysical overlaps", { exact: false })).toBeVisible();

  // Distance measurement between the first two sites (diamond nearest neighbour
  // across the fcc translation = a/sqrt(2) = 3.840 Å).
  const rows = page.locator(".site-table tbody tr");
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.getByText("Distance 0–1")).toBeVisible();
  await expect(page.getByText("3.840", { exact: false }).first()).toBeVisible();
});

test("refuses a calculation when the model has no parameters for the element", async ({ page }) => {
  await createSilicon(page);
  await page.getByRole("link", { name: "Simulation Workbench" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no parameters for the selected element" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run calculation" })).toBeDisabled();
});

test("runs a single-point energy and reports units and limits", async ({ page }) => {
  await createArgonRun(page);
  await expect(page.getByRole("heading", { name: "Quantities" })).toBeVisible();
  await expect(page.getByText("total_potential_energy")).toBeVisible();
  await expect(page.getByText("eV/atom")).toBeVisible();
  await expect(page.getByRole("cell", { name: "eV", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Limitations and assumptions" })).toBeVisible();
  await expect(
    page.getByText("Two-body only: no three-body, many-body, electrostatic or quantum contributions."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cross-implementation check" })).toBeVisible();
  await expect(page.getByText("Both implementations agree within tolerance.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "wasm", exact: true })).toBeVisible();
});

test("runs NVE dynamics, computes the MSD and downloads a report", async ({ page }) => {
  await createArgonRun(page, "md");
  await expect(page.getByText("energy_drift_per_atom").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "wasm", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compute MSD from trajectory" })).toBeEnabled();
  await page.getByRole("button", { name: "Compute MSD from trajectory" }).click();
  await expect(page.getByText("cm²/s")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download reproducibility report" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const html = await (await import("node:fs/promises")).readFile(path!, "utf8");
  expect(html).toContain("Reproducibility report");
  expect(html).toContain("classical_model");
  expect(html).toContain("not experimental proof");
});

test("exports a project archive, re-imports it and verifies the checksums", async ({ page }) => {
  await createArgonRun(page);
  await page.getByRole("link", { name: "Dashboard" }).click();

  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  const archive = await exportPromise;
  expect(archive.suggestedFilename()).toMatch(/\.hcsproj$/);
  const path = await archive.path();
  expect(path).toBeTruthy();

  await page.locator('input[type="file"][accept=".hcsproj"]').setInputFiles(path!);
  await expect(page.getByText("Checksums verified. Archive content is unchanged.")).toBeVisible();
  await expect(page.getByText("108 atoms").first()).toBeVisible();
});

test("switches language and theme, and persists the choice", async ({ page }) => {
  await page.getByRole("button", { name: "DE", exact: true }).click();
  await expect(page.getByRole("link", { name: "Übersicht" })).toBeVisible();
  const before = await page.locator("html").getAttribute("data-theme");
  await page.getByTestId("theme-toggle").click();
  const expected = before === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
  await page.reload();
  await expect(page.getByRole("link", { name: "Übersicht" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps navigation and the viewer usable without horizontal overflow", async ({ page }) => {
    await createSilicon(page);
    const nav = page.getByRole("navigation", { name: "HCS Material Research Kit" });
    await expect(nav.getByRole("link", { name: "Structure Studio" })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator(".status-bar")).toBeVisible();
  });
});
