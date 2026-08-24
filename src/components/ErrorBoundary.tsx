import { Component, type ReactNode } from "react";

/**
 * Generico, sem nenhuma dependencia de auth/supabase — seguro para App.tsx
 * importar direto. Cobre a falha de carregar o chunk de um modulo lazy
 * (ex: celular sem service worker cacheado ainda tenta abrir em modo aviao):
 * sem isto, o erro nao tratado sobe e desmonta a raiz inteira do React,
 * levando junto a tela de venda que estava por baixo.
 */
export class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
