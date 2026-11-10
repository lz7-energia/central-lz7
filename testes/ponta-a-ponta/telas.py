import re, sys
from playwright.sync_api import sync_playwright
O = "/tmp/e2e-tools/telas/"
T = "ab" * 24
erros = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1366, "height": 900}, locale="pt-BR")
    pg.on("pageerror", lambda e: erros.append(str(e)))
    # Portal: preencher e enviar pelo navegador
    pg.goto("http://localhost:3000/portal"); pg.screenshot(path=O+"01-portal.png", full_page=True)
    pg.get_by_role("radio", name="Fiscal").click()
    pg.get_by_role("radio", name="Emissão de nota fiscal").click()
    pg.select_option("#solicitante_id", label="Carla Comercial")
    pg.fill("#campo_codigo_projeto", "SP000101RES")
    pg.screenshot(path=O+"02-portal-preenchido.png", full_page=True)
    pg.get_by_role("button", name="Enviar pedido").click()
    pg.wait_for_selector(".protocolo"); pg.screenshot(path=O+"03-portal-enviado.png", full_page=True)
    link = pg.input_value("#link")
    pg.goto(link); pg.screenshot(path=O+"04-consulta.png", full_page=True)
    # Aprovação
    pg.goto(f"http://localhost:3000/aprovacao?t={T}"); pg.screenshot(path=O+"05-aprovacao.png", full_page=True)
    pg.get_by_role("button", name="Aprovar").click(); pg.wait_for_selector(".ok")
    pg.screenshot(path=O+"06-aprovado.png", full_page=True)
    # Login: estranho (sem perfil) é barrado
    pg.goto("http://localhost:3000/entrar")
    pg.fill("#email", "estranho@lz7.com.br"); pg.fill("#senha", "senha-teste-123")
    pg.get_by_role("button", name="Entrar", exact=True).click(); pg.wait_for_selector(".erro")
    print("estranho:", pg.inner_text(".erro"))
    pg.fill("#email", "ana@lz7.com.br"); pg.fill("#senha", "errada")
    pg.get_by_role("button", name="Entrar", exact=True).click(); pg.wait_for_timeout(800)
    print("senha errada:", pg.inner_text(".erro"))
    pg.fill("#senha", "senha-teste-123"); pg.screenshot(path=O+"07-login.png")
    pg.get_by_role("button", name="Entrar", exact=True).click(); pg.wait_for_selector("h1:has-text(\"Pedidos\")")
    pg.screenshot(path=O+"08-fila.png", full_page=True)
    pg.get_by_role("link", name="2026-00002").click(); pg.wait_for_selector("h1")
    pg.screenshot(path=O+"09-detalhe.png", full_page=True)
    pg.select_option("#status", "em_andamento"); pg.fill("#motivo", "Já estamos providenciando.")
    pg.select_option("#responsavel_id", label="Ana Teste")
    pg.get_by_role("button", name="Salvar", exact=True).click(); pg.wait_for_timeout(1500)
    pg.fill("#texto", "Conferir com o financeiro antes"); pg.get_by_role("button", name="Comentar").click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=O+"10-detalhe-atendido.png", full_page=True)
    pg.goto("http://localhost:3000/painel"); pg.screenshot(path=O+"11-painel.png", full_page=True)
    pg.goto("http://localhost:3000/pedidos?busca=2026-00001"); print("busca linhas:", pg.locator("tbody tr").count())
    pg.set_viewport_size({"width": 390, "height": 800}); pg.goto("http://localhost:3000/portal")
    pg.screenshot(path=O+"12-portal-celular.png", full_page=True)
    b.close()
print("erros JS:", erros)
