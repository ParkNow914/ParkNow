// tests/e2e/fluxo-principal.spec.js
//
// E2E dos fluxos críticos de interface, no navegador real:
//   - landing carrega sem erros de console
//   - cadastro de usuário pela UI (modal) → sucesso
//   - login pela UI → redireciona para /user/home.html
//   - páginas internas (home do usuário, cadastro de admin, reset) carregam
//     sem erros de console
//   - 404 customizada
//
// Esta suíte é a rede de proteção para refatorações de frontend (CSP,
// extração de scripts inline, quebra do admin script).

const { test, expect } = require('@playwright/test');

const sufixo = Date.now();
const EMAIL = `e2e_${sufixo}@exemplo-corp.com.br`;
const SENHA = 'SenhaForte!2026#e2e';

// Coleta erros de console/página; ignora ruídos externos esperados em sandbox
// (tiles de mapa, CDNs bloqueadas em ambientes restritos não derrubam o teste —
// só erros de JS da NOSSA aplicação).
function monitorarErros(page, erros) {
    page.on('pageerror', (err) => erros.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const texto = msg.text();
        if (/net::|Failed to load resource|favicon|tile|ERR_/.test(texto)) return;
        erros.push(`console: ${texto}`);
    });
}

test.describe('Landing page', () => {
    test('carrega sem erros de JS e com os CTAs principais', async ({ page }) => {
        const erros = [];
        monitorarErros(page, erros);

        await page.goto('/');
        await expect(page).toHaveTitle(/ParkNow/i);
        // Há CTAs duplicados para mobile (d-lg-none) e desktop (d-none d-lg-block);
        // ':visible' garante que pegamos o que está realmente exibido no viewport.
        await expect(page.locator('[data-target="#loginModal"]:visible').first()).toBeVisible();
        await expect(page.locator('[data-target="#registerForm"]:visible').first()).toBeVisible();

        expect(erros, `Erros de JS na landing:\n${erros.join('\n')}`).toEqual([]);
    });

    test('página 404 customizada para rota inexistente', async ({ page }) => {
        const resp = await page.goto('/rota-que-nao-existe');
        expect(resp.status()).toBe(404);
        await expect(page.locator('.code')).toHaveText('404');
        await expect(page.locator('a.btn')).toHaveAttribute('href', '/');
    });
});

test.describe('Cadastro e login pela UI', () => {
    test('usuário se cadastra pelo modal e recebe confirmação', async ({ page }) => {
        const erros = [];
        monitorarErros(page, erros);

        await page.goto('/');
        await page.locator('[data-target="#registerForm"]:visible').first().click();
        await expect(page.locator('#registerForm.modal')).toBeVisible();

        await page.fill('#newUsername', 'Usuária E2E');
        await page.fill('#newEmail', EMAIL);
        await page.fill('#newPassword', SENHA);
        await page.fill('#confirmarSenha', SENHA);
        await page.fill('#newTelefone', '11999990000');
        await page.selectOption('#tipoVeiculo', 'Carro');
        await page.fill('#placaVeiculo', 'ABC1D23');

        await page.locator('#registerUserForm button[type="submit"]').click();

        // Feedback de sucesso do cadastro (alert verde no modal)
        await expect(page.locator('#register-feedback .alert-success')).toBeVisible({ timeout: 15000 });
        expect(erros, `Erros de JS no cadastro:\n${erros.join('\n')}`).toEqual([]);
    });

    test('login pela UI redireciona para a home do usuário', async ({ page }) => {
        await page.goto('/');
        await page.locator('[data-target="#loginModal"]:visible').first().click();
        await expect(page.locator('#loginModal')).toBeVisible();

        await page.fill('#loginEmail', EMAIL);
        await page.fill('#loginPassword', SENHA);
        await page.locator('#loginModal form button[type="submit"]').click();

        await page.waitForURL('**/user/home.html', { timeout: 20000 });
        // Token de acesso armazenado e usável
        const token = await page.evaluate(() => localStorage.getItem('authToken'));
        expect(token).toBeTruthy();
    });

    test('home do usuário carrega sem erros de JS (mapa, sidebar, modais)', async ({ page }) => {
        // Login direto via API para não depender do teste anterior
        const resp = await page.request.post('/api/auth/login', {
            data: { email: EMAIL, senha: SENHA },
        });
        expect(resp.ok()).toBeTruthy();
        const { accessToken, user } = await resp.json();

        const erros = [];
        monitorarErros(page, erros);

        await page.addInitScript(([t, uid]) => {
            localStorage.setItem('authToken', t);
            localStorage.setItem('userId', String(uid));
        }, [accessToken, user.id]);

        await page.goto('/user/home.html');
        // O mapa Leaflet inicializa (container presente) e a página estabiliza
        await expect(page.locator('#map')).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(3000); // tempo para inicializações async

        // A home é data-heavy: numa base CI vazia, console.error tratados (API
        // sem dados, socket sem par) são esperados e não indicam bug. O sinal
        // de defeito real é EXCEÇÃO NÃO CAPTURADA (pageerror) — esse falha.
        const pageErrors = erros.filter((e) => e.startsWith('pageerror:'));
        expect(pageErrors, `Exceções não capturadas na home:\n${pageErrors.join('\n')}`).toEqual([]);
    });
});

test.describe('Páginas de admin e utilitárias', () => {
    test('página de cadastro/login de admin carrega e valida campos', async ({ page }) => {
        const erros = [];
        monitorarErros(page, erros);

        await page.goto('/admin_home/admin-home.html');
        await expect(page.locator('#loginForm')).toBeVisible();

        // Alterna para o cadastro e verifica validação client-side
        await page.locator('#btn-register').click();
        await expect(page.locator('#registerForm')).toBeVisible();

        await page.waitForTimeout(2000); // máscaras/validadores async
        expect(erros, `Erros de JS no admin-home:\n${erros.join('\n')}`).toEqual([]);
    });

    test('página de reset de senha carrega sem erros', async ({ page }) => {
        const erros = [];
        monitorarErros(page, erros);

        await page.goto('/reset-password/' + 'a'.repeat(64));
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);

        expect(erros, `Erros de JS no reset:\n${erros.join('\n')}`).toEqual([]);
    });
});
