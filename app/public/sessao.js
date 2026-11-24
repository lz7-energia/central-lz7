/* Central LZ7 — sessão nas páginas próprias (colaboradores, comissões, financiamento, conciliação, cronograma).
 * O token já se renova sozinho a cada pedido ao banco (rotas /…/api/token, o proxy renova o login).
 * Aqui: (1) mantém o login vivo enquanto a página fica aberta (a cada 20 min e ao voltar para a aba);
 * (2) se o login acabou de vez, NÃO joga a pessoa para a tela de entrar (perderia o que está na tela):
 *     mostra um aviso para entrar de novo em outra aba e continuar daqui. */
(function () {
  "use strict";
  let aviso = null;
  window.centralSessao = {
    expirou(volta) {
      if (aviso) return;
      aviso = document.createElement("div");
      aviso.setAttribute("role", "alert");
      aviso.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;background:#fff4e5;color:#5c3b00;" +
        "border:1px solid #f0c36d;border-radius:10px;padding:10px 14px;font:14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.15);max-width:560px";
      const a = document.createElement("a");
      a.href = "/entrar?volta=" + encodeURIComponent(volta || location.pathname);
      a.target = "_blank"; a.rel = "noopener"; a.textContent = "Entrar de novo (abre outra aba)";
      a.style.cssText = "color:#124735;font-weight:600;margin-left:6px";
      aviso.append("Seu login terminou. O que está na tela não foi perdido: ", a, ", depois volte aqui e salve.");
      document.body.appendChild(aviso);
    },
    voltou() { if (aviso) { aviso.remove(); aviso = null; } },
    /** Chama a função de token a cada 20 min e quando a aba volta a ficar visível. */
    manterVivo(renovar) {
      setInterval(() => { renovar(true); }, 20 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") renovar(true); });
    },
  };
})();
