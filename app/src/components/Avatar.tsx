/** Foto de perfil redonda; sem foto, as iniciais do nome. */
export function Avatar({ nome, foto, tamanho = 32 }: { nome: string; foto: string | null; tamanho?: number }) {
  const iniciais = nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.4) };
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" src={foto} alt="" style={estilo} />
  ) : (
    <span className="avatar sem-foto" style={estilo} aria-hidden="true">{iniciais}</span>
  );
}
