import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="inicio">
      <div className="cartao">
        <h1>Página não encontrada</h1>
        <p className="mudo">O endereço pode estar errado ou a página foi removida.</p>
        <Link className="botao" href="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
