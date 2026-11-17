// lib/useApiResource.ts: carga, error, reintento, datos locales y respuestas obsoletas.
// Sin Testing Library: se monta un componente mínimo con react-dom/client y act().
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useApiResource,
  type ApiResource,
  type ApiResourceOptions,
} from "@/lib/useApiResource";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Promesa que el test resuelve o rechaza cuando quiere
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const options: ApiResourceOptions<string[]> = {
  initialData: [],
  toMessage: (e) => `fallo: ${(e as Error).message}`,
};

let container: HTMLDivElement;
let root: Root;
let current: ApiResource<string[]>;

// El componente entrega el valor del hook al test en cada render
function Probe(props: {
  requestKey: string;
  fetcher: () => Promise<string[]>;
  opts: ApiResourceOptions<string[]>;
  report: (value: ApiResource<string[]>) => void;
}) {
  props.report(useApiResource(props.requestKey, props.fetcher, props.opts));
  return null;
}

function report(value: ApiResource<string[]>) {
  current = value;
}

async function render(
  requestKey: string,
  fetcher: () => Promise<string[]>,
  opts = options,
) {
  await act(async () => {
    root.render(createElement(Probe, { requestKey, fetcher, opts, report }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
});

test("empieza cargando con initialData y guarda la respuesta", async () => {
  const req = deferred<string[]>();
  await render("a", () => req.promise);
  expect(current).toMatchObject({ data: [], error: null, loading: true });

  await act(async () => req.resolve(["uno", "dos"]));
  expect(current).toMatchObject({ data: ["uno", "dos"], error: null, loading: false });
});

test("un error deja el mensaje de toMessage y vuelve a initialData", async () => {
  const fetcher = jest
    .fn<Promise<string[]>, []>()
    .mockResolvedValueOnce(["uno"])
    .mockRejectedValueOnce(new Error("500"));
  await render("a", fetcher);
  expect(current.data).toEqual(["uno"]);

  await render("b", fetcher);
  expect(current).toMatchObject({ data: [], error: "fallo: 500", loading: false });
});

test("con keepDataOnError conserva los últimos datos buenos", async () => {
  const fetcher = jest
    .fn<Promise<string[]>, []>()
    .mockResolvedValueOnce(["uno"])
    .mockRejectedValueOnce(new Error("timeout"));
  const opts = { ...options, keepDataOnError: true };
  await render("a", fetcher, opts);
  await render("b", fetcher, opts);
  expect(current).toMatchObject({ data: ["uno"], error: "fallo: timeout", loading: false });
});

test("retry repite la petición con la misma clave", async () => {
  const fetcher = jest
    .fn<Promise<string[]>, []>()
    .mockRejectedValueOnce(new Error("red"))
    .mockResolvedValueOnce(["ok"]);
  await render("a", fetcher);
  expect(current.error).toBe("fallo: red");

  await act(async () => current.retry());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(current).toMatchObject({ data: ["ok"], error: null, loading: false });
});

test("descarta la respuesta de una petición que ya no es la actual", async () => {
  const lenta = deferred<string[]>();
  const rapida = deferred<string[]>();
  await render("filtro-a", () => lenta.promise);
  await render("filtro-b", () => rapida.promise);

  await act(async () => rapida.resolve(["b"]));
  await act(async () => lenta.resolve(["a"]));
  expect(current).toMatchObject({ data: ["b"], loading: false });
});

test("setData cambia los datos en local sin otra petición", async () => {
  const fetcher = jest.fn<Promise<string[]>, []>().mockResolvedValue(["uno", "dos"]);
  await render("a", fetcher);

  await act(async () => current.setData((prev) => prev.filter((x) => x !== "uno")));
  expect(current.data).toEqual(["dos"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
