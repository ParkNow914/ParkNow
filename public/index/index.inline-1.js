// Extraído de public/index.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Ano dinâmico no footer
        document.addEventListener('DOMContentLoaded', () => {
            const y = document.getElementById('footer-year');
            if (y) y.textContent = new Date().getFullYear();

            // Scroll suave para âncoras (mantido do index.html anterior)
            $('a[href*="#"]:not([href="#"]):not([data-toggle])').on('click', function(event) {
                if (location.pathname.replace(/^\//, '') == this.pathname.replace(/^\//, '') && location.hostname == this.hostname) {
                    const target = $(this.hash);
                    if (target.length) {
                        event.preventDefault();
                        $('html, body').animate({ scrollTop: target.offset().top - 80 }, 600);
                    }
                }
            });

            // Renderiza ReservaButton onde houver elementos com a classe
            if (typeof React !== 'undefined' && typeof ReactDOM !== 'undefined' && typeof ReservaButton !== 'undefined') {
                document.querySelectorAll('.react-reserva-button').forEach(button => {
                    try {
                        const vagaId = button.getAttribute('data-vaga-id');
                        const estacionamentoId = button.getAttribute('data-estacionamento-id');
                        const valor = button.getAttribute('data-valor');
                        ReactDOM.render(
                            React.createElement(ReservaButton, {
                                vagaId, estacionamentoId, valor,
                                onReservaSuccess: () => {}
                            }),
                            button
                        );
                    } catch (e) { console.error('ReservaButton mount error:', e); }
                });
            }
        });
