/**
 * Identidade Sunbite.OS (PRD V2 §3.1) — deriva da linguagem do logotipo atual
 * (`Sunbite.ch`, ver Footer.tsx do site): mesmo nome, o domínio trocado por
 * ".OS" e marcado mais claro, do jeito que um tld sempre pesa menos que o
 * nome. Usa `font-display` (Georgia), a mesma fonte que a Home já usava para
 * "Sunbite" — nenhuma fonte nova entra no bundle, e o app continua abrindo
 * offline sem esperar um Google Font.
 */
export function SunbiteLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display ${className}`}>
      Sunbite<span className="opacity-60">.OS</span>
    </span>
  );
}
