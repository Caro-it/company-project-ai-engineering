import { formatMoney, programmeLabel, weekLabel } from "@/lib/reporting";

describe("presentación del reporte semanal", () => {
  test("etiqueta de la semana ISO", () => {
    expect(weekLabel("2026-11-09")).toBe("semana del 9 al 15 de noviembre de 2026");
    expect(weekLabel("2026-11-30")).toBe("semana del 30 de noviembre de 2026 al 6 de diciembre de 2026");
  });

  test("cada oficina en su moneda", () => {
    expect(formatMoney(185, "EUR")).toMatch(/185,00\s€/);
    expect(formatMoney(300, "USD")).toMatch(/300,00\sUS\$/);
  });

  test("nombre legible del programa", () => {
    expect(programmeLabel("ventas-b2b")).toBe("Ventas b2b");
  });
});
