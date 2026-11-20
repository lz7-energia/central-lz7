"use client";

/** Abre o "Criar tarefa" (public/tarefa-app/tarefa.js): a tarefa vai para o planner com link de volta para esta tela. */
type Props = {
  titulo?: string; obs?: string; data?: string; importante?: boolean;
  link?: { href: string; rotulo: string };
  className?: string; children?: React.ReactNode; title?: string;
};

declare global {
  interface Window { centralTarefa?: { abrir: (o: Omit<Props, "className" | "children" | "title">) => void } }
}

export function BotaoTarefa({ className = "link-acao", children = "Criar tarefa", title = "Criar tarefa no planner com link para cá", ...o }: Props) {
  return (
    <button type="button" className={className} title={title}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.centralTarefa?.abrir(o); }}>
      {children}
    </button>
  );
}
