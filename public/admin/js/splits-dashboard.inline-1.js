// Extraído de public/admin/splits-dashboard.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Escapa valores dinamicos interpolados em templates HTML (anti-XSS)
        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        // Base URL da API
        const API_BASE_URL = window.location.origin;

        // Função para obter o token JWT
        function getAuthToken() {
            return localStorage.getItem('token');
        }

        // Função para fazer requisições autenticadas
        async function fetchWithAuth(url, options = {}) {
            const token = getAuthToken();
            
            if (!token) {
                window.location.href = '/admin/login.html';
                return;
            }

            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            };

            const response = await fetch(API_BASE_URL + url, {
                ...options,
                headers
            });

            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/admin/login.html';
                return;
            }

            return response;
        }

        // Formatar moeda
        function formatarMoeda(valor) {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(valor);
        }

        // Formatar data
        function formatarData(dataStr) {
            const data = new Date(dataStr);
            return data.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Carregar estatísticas
        async function carregarEstatisticas() {
            try {
                const response = await fetchWithAuth('/api/admin/splits/estatisticas');
                const data = await response.json();

                if (data.success) {
                    document.getElementById('receitaTotal').textContent = 
                        formatarMoeda(data.data.receita_total || 0);
                    document.getElementById('totalTransacoes').textContent = 
                        data.data.total_transacoes || 0;
                    document.getElementById('receitaHoje').textContent = 
                        formatarMoeda(data.data.receita_hoje || 0);
                    document.getElementById('receitaMes').textContent = 
                        formatarMoeda(data.data.receita_mes || 0);
                }
            } catch (error) {
                console.error('Erro ao carregar estatísticas:', error);
            }
        }

        // Carregar lista de estacionamentos para o filtro
        async function carregarEstacionamentos() {
            try {
                const response = await fetchWithAuth('/api/admin/estacionamentos');
                const data = await response.json();

                if (data.success) {
                    const select = document.getElementById('estacionamentoFiltro');
                    data.data.forEach(est => {
                        const option = document.createElement('option');
                        option.value = est.id;
                        option.textContent = est.nome;
                        select.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Erro ao carregar estacionamentos:', error);
            }
        }

        // Carregar transações
        async function carregarTransacoes(filtros = {}) {
            try {
                let url = '/api/admin/splits/transacoes?limite=100';
                
                if (filtros.dataInicio) {
                    url += `&data_inicio=${filtros.dataInicio}`;
                }
                if (filtros.dataFim) {
                    url += `&data_fim=${filtros.dataFim}`;
                }
                if (filtros.estacionamento) {
                    url += `&estacionamento_id=${filtros.estacionamento}`;
                }

                const response = await fetchWithAuth(url);
                const data = await response.json();

                const tbody = document.getElementById('tabelaTransacoes');
                tbody.innerHTML = '';

                if (data.success && data.data.length > 0) {
                    data.data.forEach(transacao => {
                        const tr = document.createElement('tr');
                        
                        const statusClass = 
                            transacao.status === 'approved' ? 'status-approved' :
                            transacao.status === 'pending' ? 'status-pending' :
                            'status-rejected';
                        
                        const statusText = 
                            transacao.status === 'approved' ? 'Aprovado' :
                            transacao.status === 'pending' ? 'Pendente' :
                            'Rejeitado';

                        tr.innerHTML = `
                            <td>#${transacao.id}</td>
                            <td>${formatarData(transacao.created_at)}</td>
                            <td>${escapeHtml(transacao.estacionamento_nome || 'N/A')}</td>
                            <td>${escapeHtml(transacao.cliente_nome || 'N/A')}</td>
                            <td><strong>${formatarMoeda(transacao.valor_total)}</strong></td>
                            <td class="text-success">${formatarMoeda(transacao.comissao_plataforma)}</td>
                            <td class="text-primary">${formatarMoeda(transacao.valor_estacionamento)}</td>
                            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        `;
                        
                        tbody.appendChild(tr);
                    });
                } else {
                    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhuma transação encontrada</td></tr>';
                }
            } catch (error) {
                console.error('Erro ao carregar transações:', error);
                const tbody = document.getElementById('tabelaTransacoes');
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Erro ao carregar dados</td></tr>';
            }
        }

        // Aplicar filtros
        function aplicarFiltros() {
            const filtros = {
                dataInicio: document.getElementById('dataInicio').value,
                dataFim: document.getElementById('dataFim').value,
                estacionamento: document.getElementById('estacionamentoFiltro').value
            };
            
            carregarTransacoes(filtros);
        }

        // Exportar para CSV
        function exportarCSV() {
            const tabela = document.getElementById('tabelaTransacoes');
            const linhas = tabela.querySelectorAll('tr');
            
            let csv = 'ID,Data,Estacionamento,Cliente,Valor Total,Comissão ParkNow,Valor Estacionamento,Status\n';
            
            linhas.forEach(linha => {
                const colunas = linha.querySelectorAll('td');
                if (colunas.length > 0) {
                    const dados = Array.from(colunas).map(col => 
                        `"${col.textContent.trim().replace(/"/g, '""')}"`
                    );
                    csv += dados.join(',') + '\n';
                }
            });

            // Criar blob e download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `splits_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        }

        // Inicializar dashboard
        document.addEventListener('DOMContentLoaded', () => {
            carregarEstatisticas();
            carregarEstacionamentos();
            carregarTransacoes();
            
            // Atualizar estatísticas a cada 30 segundos
            setInterval(carregarEstatisticas, 30000);
        });
