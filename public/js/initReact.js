// Inicializa os componentes React
document.addEventListener('DOMContentLoaded', function() {
    // Verifica se o React e ReactDOM estão disponíveis
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
        console.error('React ou ReactDOM não foram carregados corretamente');
        return;
    }

    // Função para renderizar componentes React
    function renderReactComponents() {
        // Verifica se já existe um elemento raiz para o PixPaymentModal
        let rootElement = document.getElementById('pix-payment-root');
        
        // Se não existir, cria um
        if (!rootElement) {
            rootElement = document.createElement('div');
            rootElement.id = 'pix-payment-root';
            document.body.appendChild(rootElement);
        }
        
        // Renderiza o componente ReservaButton
        const reservaButtons = document.querySelectorAll('.reserva-button');
        
        reservaButtons.forEach((button, index) => {
            const buttonId = `reserva-button-${index}`;
            button.id = buttonId;
            
            // Verifica se já foi renderizado
            if (!button.getAttribute('data-react-rendered')) {
                try {
                    // Extrai os atributos de dados
                    const vagaId = button.getAttribute('data-vaga-id');
                    const estacionamentoId = button.getAttribute('data-estacionamento-id');
                    
                    // Renderiza o componente ReservaButton
                    ReactDOM.render(
                        React.createElement(ReservaButton, {
                            vagaId: vagaId,
                            estacionamentoId: estacionamentoId,
                            buttonText: button.textContent.trim() || 'Reservar Agora',
                            buttonClass: button.className,
                            onReservaSuccess: function() {
                                // Lógica após reserva bem-sucedida
                            }
                        }),
                        button
                    );
                    
                    // Marca como renderizado
                    button.setAttribute('data-react-rendered', 'true');
                } catch (error) {
                    console.error(`Erro ao renderizar botão de reserva ${buttonId}:`, error);
                }
            }
        });
    }
    
    // Espera um pouco para garantir que tudo esteja carregado
    setTimeout(renderReactComponents, 500);
    
    // Também tenta renderizar quando a janela for redimensionada
    window.addEventListener('resize', renderReactComponents);
});
