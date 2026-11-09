import { expect, test as setup } from "@playwright/test";

import { API_URL, AUTH_STATE } from "./ports.mjs";

export const TEST_USER = {
  email: "e2e@example.com",
  password: "Password123",
};

// Crea el usuario de test en la BD temporal y entra por el formulario de login real.
// El token queda en localStorage y se reutiliza en todos los specs.
setup("login con el usuario de test", async ({ page, request }) => {
  const res = await request.post(`${API_URL}/users`, { data: TEST_USER });
  expect([201, 409]).toContain(res.status());

  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Contraseña").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.context().storageState({ path: AUTH_STATE });
});
