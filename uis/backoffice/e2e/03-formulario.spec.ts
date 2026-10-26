import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { SCREENSHOTS_DIR, delay, fulfillJson, mockApi } from "./helpers";

const VALID = {
  title: "Zendesk no sincroniza tickets",
  description: "Desde esta mañana los tickets nuevos no aparecen en Zendesk.",
  category: "Fallo técnico",
  origin: "Sede",
  branch: "Miami Office",
};

async function fill(page: Page, values: Partial<typeof VALID> = VALID) {
  if (values.title !== undefined) await page.getByLabel("Título").fill(values.title);
  if (values.description !== undefined)
    await page.getByLabel("Descripción").fill(values.description);
  if (values.category) await page.getByLabel("Categoría").selectOption({ label: values.category });
  if (values.origin) await page.getByLabel("Origen").selectOption({ label: values.origin });
  if (values.branch) await page.getByLabel("Sede").selectOption({ label: values.branch });
}

const submit = (page: Page) =>
  page.getByRole("button", { name: /Registrar incidencia|Registrando…/ }).click();

test.beforeEach(async ({ page }) => {
  await page.goto("/incidencias/nueva");
  await expect(page.getByRole("heading", { name: "Registrar incidencia", level: 1 })).toBeVisible();
});

test("los campos obligatorios bloquean el envío", async ({ page }) => {
  let posts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/incidents") posts++;
  });

  await submit(page);
  for (const message of [
    "El título es obligatorio.",
    "La descripción es obligatoria.",
    "Elige una categoría.",
    "Elige un origen.",
    "Elige una sede.",
  ]) {
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
  }
  await expect(page.getByLabel("Título")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Sede")).toHaveAttribute("aria-invalid", "true");

  // Con todo relleno salvo el título, solo queda ese error
  await fill(page, { ...VALID, title: "" });
  await submit(page);
  await expect(page.locator("#f-title-error")).toHaveText("El título es obligatorio.");
  await expect(page.locator("#f-branch-error")).toHaveCount(0);
  expect(posts).toBe(0);

  await page.locator("form").screenshot({
    path: path.join(SCREENSHOTS_DIR, "formulario-error-validacion.png"),
  });
});

test("con origen «Sede» se resalta el campo de sede", async ({ page }) => {
  const branchBox = page.locator("[data-highlighted]");
  const help = page.getByText("Estás reportando desde una sede");
  await expect(branchBox).toHaveCount(0);
  await expect(help).toHaveCount(0);

  await page.getByLabel("Origen").selectOption({ label: "Sede" });
  await expect(branchBox).toBeVisible();
  await expect(branchBox).toHaveClass(/border-\[#ECA400\]/);
  await expect(help).toBeVisible();
  await expect(page.getByLabel("Sede")).toHaveAttribute(
    "aria-describedby",
    /f-branch-origin-help/,
  );

  // Las 4 sedes con sus etiquetas literales; «Remoto» en un grupo aparte
  await expect(page.locator("#f-branch optgroup").nth(0).locator("option")).toHaveText([
    "Central — Sede Valencia",
    "Valencia — Operaciones",
    "Miami Office",
  ]);
  await expect(page.locator("#f-branch optgroup").nth(1).locator("option")).toHaveText([
    "Remoto (empleado sin sede fija)",
  ]);

  await page.getByLabel("Origen").selectOption({ label: "Cliente" });
  await expect(branchBox).toHaveCount(0);
  await expect(help).toHaveCount(0);
  await expect(page.getByLabel("Sede")).toBeVisible();
});

test("durante el envío el botón se deshabilita y el formulario indica aria-busy", async ({ page }) => {
  await mockApi(page, "/api/incidents", "POST", async (route) => {
    await delay(1500);
    await route.continue();
  });
  await fill(page, { ...VALID, title: "Envío lento de prueba" });
  await submit(page);

  const button = page.getByRole("button", { name: "Registrando…" });
  await expect(button).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");

  await expect(page.getByRole("status")).toContainText("Envío lento de prueba");
  await expect(page.getByRole("button", { name: "Registrar incidencia" })).toBeEnabled();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "false");
});

test("un 400 de la API aparece junto al campo correcto", async ({ page }) => {
  await mockApi(page, "/api/incidents", "POST", (route) =>
    fulfillJson(route, 400, {
      detail: "Datos no válidos",
      code: "validation_error",
      errors: [
        {
          field: "branch",
          code: "invalid_choice",
          message: "La sede no tiene un valor permitido.",
          allowed: ["central", "valencia_operations", "miami_office", "remote"],
        },
      ],
    }),
  );
  await fill(page);
  await submit(page);

  await expect(page.locator("#f-branch-error")).toHaveText("Elige una de las opciones de la lista.");
  await expect(page.getByLabel("Sede")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Título")).not.toHaveAttribute("aria-invalid", "true");
  // Los datos no se pierden
  await expect(page.getByLabel("Título")).toHaveValue(VALID.title);
});

test("un 500 muestra un mensaje comprensible", async ({ page }) => {
  await mockApi(page, "/api/incidents", "POST", (route) =>
    fulfillJson(route, 500, { detail: "Error interno del servidor", code: "internal_error" }),
  );
  await fill(page);
  await submit(page);

  const alert = page.locator("form").getByRole("alert");
  await expect(alert).toHaveText(
    "Ha ocurrido un error en el servidor. Inténtalo de nuevo en unos minutos.",
  );
  await expect(page.getByLabel("Título")).toHaveValue(VALID.title);
});

test("un error de red muestra un mensaje comprensible", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/incidents",
    (route) => route.abort("failed"),
  );
  await fill(page);
  await submit(page);

  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
  );
});

test("tras un alta correcta se limpia el formulario y se confirma", async ({ page }) => {
  await fill(page);
  await submit(page);

  await expect(page.getByRole("status")).toContainText(
    `Incidencia «${VALID.title}» registrada correctamente con estado «Abierta».`,
  );
  await expect(page.getByLabel("Título")).toHaveValue("");
  await expect(page.getByLabel("Descripción")).toHaveValue("");
  await expect(page.getByLabel("Categoría")).toHaveValue("");
  await expect(page.getByLabel("Origen")).toHaveValue("");
  await expect(page.getByLabel("Sede")).toHaveValue("");

  // Aparece en el listado, abierta y en Miami
  await page.getByRole("link", { name: "Ver el listado de incidencias" }).click();
  const row = page.getByTestId("incident-row").filter({ hasText: VALID.title });
  await expect(row).toContainText("Miami Office");
  await expect(row.getByTestId("incident-status")).toHaveText("Abierta");
});
