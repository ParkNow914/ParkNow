// Extraído de public/approval-success.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Pegar dados da URL
        const urlParams = new URLSearchParams(window.location.search);
        
        // Se vier como query params
        if (urlParams.has('nome')) {
            document.getElementById('estacionamentoNome').textContent = urlParams.get('nome') || '-';
            document.getElementById('estacionamentoCnpj').textContent = urlParams.get('cnpj') || '-';
            document.getElementById('estacionamentoId').textContent = urlParams.get('estId') || '-';
            document.getElementById('adminEmail').textContent = urlParams.get('email') || '-';
            document.getElementById('adminId').textContent = urlParams.get('adminId') || '-';
        }

        // Criar confetti
        function createConfetti() {
            const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
            for (let i = 0; i < 50; i++) {
                setTimeout(() => {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti';
                    confetti.style.left = Math.random() * 100 + '%';
                    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.animationDelay = Math.random() * 3 + 's';
                    confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
                    document.body.appendChild(confetti);
                    
                    setTimeout(() => confetti.remove(), 5000);
                }, i * 30);
            }
        }

        // Iniciar confetti após carregar
        window.addEventListener('load', () => {
            setTimeout(createConfetti, 500);
        });
