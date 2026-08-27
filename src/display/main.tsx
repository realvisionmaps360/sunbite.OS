import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { Display } from "./Display";

/**
 * Entrada propria do Customer Display (`display.html`), separada de
 * `src/main.tsx`.
 *
 * E isso que mantem a promessa da Etapa 10: o iPad carrega so o que o iPad
 * precisa, e o pacote do celular **nao engorda um byte** por esta tela
 * existir. Sem `<LangProvider>` de proposito — o display nao tem botao de
 * idioma (ver Display.tsx).
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Display />
  </StrictMode>,
);
