// Extraído de views/pagamento-sucesso.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Extrair parâmetros da URL
        const urlParams = new URLSearchParams(window.location.search);
        const reservaId = urlParams.get('reserva');
        
        if (reservaId) {
            document.getElementById('reservaId').textContent = `#${reservaId}`;
            
            // Verificar status do pagamento
            verificarStatusPagamento(reservaId);
        } else {
            document.getElementById('reservaId').textContent = 'Não informada';
            document.getElementById('statusText').textContent = 'Concluído';
            document.getElementById('loadingSpinner').style.display = 'none';
        }

        async function verificarStatusPagamento(reservaId) {
            try {
                // Aguardar alguns segundos para o webhook processar
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const token = localStorage.getItem('token');
                
                const response = await fetch(`/api/reservas/${reservaId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const reserva = data.reserva || data.data;
                    
                    document.getElementById('loadingSpinner').style.display = 'none';
                    
                    if (reserva.status_pagamento === 'pago') {
                        document.getElementById('statusText').textContent = '✅ Pagamento Confirmado';
                        document.getElementById('statusText').style.color = '#10b981';
                    } else if (reserva.status_pagamento === 'pendente') {
                        document.getElementById('statusText').textContent = '⏳ Processando...';
                        document.getElementById('statusText').style.color = '#f59e0b';
                        
                        // Tentar novamente após 5 segundos
                        setTimeout(() => verificarStatusPagamento(reservaId), 5000);
                    } else {
                        document.getElementById('statusText').textContent = `Status: ${reserva.status_pagamento}`;
                    }
                } else {
                    throw new Error('Erro ao buscar reserva');
                }
            } catch (error) {
                console.error('Erro ao verificar status:', error);
                document.getElementById('loadingSpinner').style.display = 'none';
                document.getElementById('statusText').textContent = '✅ Concluído';
                document.getElementById('statusText').style.color = '#10b981';
            }
        }

        // Auto-redirecionar após 10 segundos
        setTimeout(() => {
            if (document.getElementById('statusText').textContent.includes('Confirmado')) {
                window.location.href = '/user/home.html';
            }
        }, 10000);
