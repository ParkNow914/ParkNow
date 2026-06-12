// Extraído de views/pagamento-cancelado.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Extrair parâmetros da URL
        const urlParams = new URLSearchParams(window.location.search);
        const reservaId = urlParams.get('reserva');
        
        // Configurar botão "Tentar Novamente" para redirecionar para a reserva específica
        if (reservaId) {
            const btnTentarNovamente = document.getElementById('btnTentarNovamente');
            btnTentarNovamente.href = `/user/home.html?reserva=${reservaId}&action=pagar`;
        }
