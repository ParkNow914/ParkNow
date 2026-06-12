// Extraído de public/admin_home/admin/home.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Script para proteger a página e lidar com logout
    (function() {
        /** Obtém o token de admin do localStorage */
        function getAdminAuthToken() {
            const token = localStorage.getItem('adminAuthToken');
            if (!token) {
                console.warn("[Auth Admin] Token não encontrado. Redirecionando para login.");
                window.location.href = '/admin_home/admin-home.html'; // Página de login admin
            }
            return token;
        }

        /** Função de Logout Admin */
        async function logoutAdmin(redirectToLogin = true) {
            const token = localStorage.getItem('adminAuthToken');
            try {
                // Chama API de logout para invalidar refresh token (via cookie) e blacklist (via JTI)
                await fetch('/api/auth/logout', { // Endpoint genérico de logout
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` } // Envia token de acesso atual
                });
                
                // Remove o token do localStorage
                localStorage.removeItem('adminAuthToken');
                
                // Redireciona para a página de login se necessário
                if (redirectToLogin) {
                    window.location.href = '/admin_home/admin-home.html';
                }
            } catch (error) {
                console.error('Erro ao fazer logout:', error);
                // Mesmo em caso de erro, remove o token e redireciona
                localStorage.removeItem('adminAuthToken');
                if (redirectToLogin) {
                    window.location.href = '/admin_home/admin-home.html';
                }
            }
        }

        // Adiciona o evento de clique ao botão de logout
        document.addEventListener('DOMContentLoaded', function() {
            const logoutButton = document.getElementById('logoutButton');
            if (logoutButton) {
                logoutButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    logoutAdmin(); // Chama a função de logout
                });
            }

            // --- Inicialização dos Gráficos ---
            console.log("Inicializando gráficos...");
            
            // Dados de exemplo (substituir por dados reais da API)
            // Função para obter os últimos 7 dias
            function getLast7Days() {
                const result = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    result.push(d.toLocaleDateString('pt-BR', { weekday: 'short' }));
                }
                return result;
            }

            const chartData = {
                months: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                revenueData: [12000, 19000, 15000, 25000, 22000, 30000, 28000, 26000, 29000, 35000, 32000, 40000],
                topParkingSpots: ['Vaga A1', 'Vaga B2', 'Vaga C3', 'Vaga D4', 'Vaga E5'],
                spotAccessData: [120, 98, 85, 72, 60],
                vehicleTypes: ['Carros', 'Motos', 'Vans'],
                vehicleCounts: [65, 25, 10],
                last7Days: getLast7Days(),
                dailyReservations: [12, 19, 15, 25, 22, 30, 28]
            };
            
            // Gráfico de Faturamento Mensal
            const revenueCtx = document.getElementById('revenueChart').getContext('2d');
            new Chart(revenueCtx, {
                type: 'line',
                data: {
                    labels: chartData.months,
                    datasets: [{
                        label: 'Faturamento (R$)',
                        data: chartData.revenueData,
                        borderColor: 'rgba(78, 115, 223, 1)',
                        backgroundColor: 'rgba(78, 115, 223, 0.05)',
                        pointBackgroundColor: 'rgba(78, 115, 223, 1)',
                        pointBorderColor: '#fff',
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: 'rgba(78, 115, 223, 1)',
                        pointHoverBorderColor: '#fff',
                        pointHitRadius: 10,
                        pointBorderWidth: 2,
                        borderWidth: 2,
                        fill: true
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: {
                                font: {
                                    family: '"Days One", sans-serif',
                                    size: 12
                                },
                                color: '#5a5c69'
                            },
                            grid: {
                                display: false
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                font: {
                                    family: '"Days One", sans-serif',
                                    size: 12
                                },
                                color: '#5a5c69',
                                callback: function(value) {
                                    return 'R$ ' + value.toLocaleString('pt-BR');
                                }
                            },
                            grid: {
                                color: 'rgba(0,0,0,0.05)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                font: {
                                    family: '"Days One", sans-serif',
                                    size: 12
                                },
                                color: '#5a5c69'
                            }
                        },
                        tooltip: {
                            backgroundColor: '#ffffff',
                            titleColor: '#004080',
                            bodyColor: '#5a5c69',
                            borderColor: '#e3e6f0',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: true,
                            titleFont: {
                                family: '"Days One", sans-serif',
                                size: 12
                            },
                            bodyFont: {
                                family: '"Days One", sans-serif',
                                size: 12
                            },
                            callbacks: {
                                label: function(context) {
                                    return 'R$ ' + context.raw.toLocaleString('pt-BR');
                                }
                            }
                        }
                    }
                }
            });

            // Gráfico de Vagas Mais Acessadas
            const popularSpotsCtx = document.getElementById('popularSpotsChart').getContext('2d');
            new Chart(popularSpotsCtx, {
                type: 'doughnut',
                data: {
                    labels: chartData.topParkingSpots,
                    datasets: [{
                        data: chartData.spotAccessData,
                        backgroundColor: [
                            '#004080', // Azul escuro principal
                            '#1976d2', // Azul médio
                            '#54C87D', // Verde
                            '#2196f3', // Azul claro
                            '#002850'  // Azul mais escuro
                        ],
                        hoverBackgroundColor: [
                            '#002850', // Azul mais escuro (hover)
                            '#0d47a1', // Azul escuro (hover)
                            '#43a047', // Verde mais escuro (hover)
                            '#0d8aee', // Azul claro mais escuro (hover)
                            '#001a33'  // Azul mais escuro ainda (hover)
                        ],
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        hoverBorderColor: '#ffffff',
                    }],
                },
                options: {
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: '#5a5c69',
                                font: {
                                    family: '"Days One", sans-serif',
                                    size: 12,
                                    weight: 'normal'
                                },
                                padding: 20,
                                usePointStyle: true,
                                boxWidth: 10
                            }
                        },
                        tooltip: {
                            backgroundColor: '#ffffff',
                            titleColor: '#004080',
                            bodyColor: '#5a5c69',
                            borderColor: '#dddfeb',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: true,
                            titleFont: {
                                family: '"Days One", sans-serif',
                                size: 12
                            },
                            bodyFont: {
                                family: '"Days One", sans-serif',
                                size: 12
                            },
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} acessos (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateScale: true,
                        animateRotate: true
                    }
                },
            });

            // Gráfico de Vagas por Tipo de Veículo
            const vehicleTypeCtx = document.getElementById('vehicleTypeChart').getContext('2d');
            const vehicleTypeChart = new Chart(vehicleTypeCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Carros', 'Motos', 'Vans'],
                    datasets: [{
                        data: [65, 25, 10], // Valores de exemplo - substituir por dados reais
                        backgroundColor: [
                            '#00C853', // Verde principal para carros
                            '#2962FF', // Azul principal para motos
                            '#00B8D4'  // Ciano para vans (tom mais claro da paleta)
                        ],
                        hoverBackgroundColor: [
                            '#00E676', // Verde mais claro (hover)
                            '#448AFF', // Azul mais claro (hover)
                            '#18FFFF'  // Ciano mais claro (hover)
                        ],
                        borderColor: '#ffffff',
                        borderWidth: 2,
                        hoverBorderColor: '#ffffff',
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            display: false, // Desativamos a legenda padrão pois já temos a legenda personalizada no HTML
                        },
                        tooltip: {
                            backgroundColor: '#ffffff',
                            titleColor: '#004080',
                            bodyColor: '#5a5c69',
                            borderColor: '#dddfeb',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} vagas (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateScale: true,
                        animateRotate: true
                    }
                },
                plugins: [{
                    id: 'centerText',
                    beforeDraw: function(chart) {
                        if (chart.config && chart.config.options && chart.config.options.elements && chart.config.options.elements.center) {
                            // Obtém o contexto do canvas
                            const ctx = chart.ctx;
                            
                            // Obtém as opções do centro do gráfico
                            const centerConfig = chart.config.options.elements.center;
                            const fontStyle = centerConfig.fontStyle || 'Arial';
                            const color = centerConfig.color || '#000';
                            const text = centerConfig.text;
                            const sidePadding = centerConfig.sidePadding || 20;
                            const sidePaddingCalculated = (sidePadding / 100) * (chart.innerRadius * 2);
                            
                            // Se não houver texto, não faz nada
                            if (!text) return;
                            
                            // Configuração da fonte
                            const titleFontSize = Math.round(chart.height / 8);
                            const subTitleFontSize = Math.round(chart.height / 12);
                            
                            // Configura o contexto
                            ctx.font = `600 ${titleFontSize}px ${fontStyle}`;
                            
                            // Obtém o tamanho do texto e as posições
                            const textX = Math.round((chart.width - ctx.measureText(text).width) / 2);
                            const textY = chart.height / 2 - titleFontSize / 2;
                            
                            // Desenha o texto no centro
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = color;
                            
                            // Texto principal (total)
                            ctx.font = `600 ${titleFontSize}px 'Open Sans', sans-serif`;
                            ctx.fillText(text, chart.width / 2, chart.height / 2 - titleFontSize / 2);
                            
                            // Subtítulo
                            if (centerConfig.subText) {
                                ctx.font = `400 ${subTitleFontSize}px 'Open Sans', sans-serif`;
                                ctx.fillText(centerConfig.subText, chart.width / 2, chart.height / 2 + titleFontSize / 2);
                            }
                            
                            // Restaura o contexto
                            ctx.save();
                        }
                    }
                }]
            });

            // Atualiza o texto central do gráfico com o total de vagas
            const totalVagas = chartData.vehicleCounts.reduce((a, b) => a + b, 0);
            vehicleTypeChart.options.elements = {
                center: {
                    text: totalVagas.toString(),
                    subText: 'Total',
                    color: '#004080',
                    fontStyle: 'Open Sans',
                    sidePadding: 20
                }
            };
            vehicleTypeChart.update();

            // Gráfico de Reservas nos Últimos 7 Dias
            const dailyReservationsCtx = document.getElementById('dailyReservationsChart').getContext('2d');
            
            // Criar gradiente mais bonito
            const gradientBg = dailyReservationsCtx.createLinearGradient(0, 0, 0, 400);
            gradientBg.addColorStop(0, 'rgba(25, 95, 223, 1)');      // Azul mais escuro e opaco
            gradientBg.addColorStop(0.5, 'rgba(56, 132, 255, 0.9)');  // Azul médio com alta opacidade
            gradientBg.addColorStop(1, 'rgba(86, 162, 255, 0.7)');    // Azul mais claro mas ainda forte

            // Dados para a linha de tendência
            const dailyReservations = chartData.dailyReservations;
            const labels = chartData.last7Days;
            const totalReservations = dailyReservations.reduce((a, b) => a + b, 0);
            const avgReservations = (totalReservations / 7).toFixed(1);

            // Cores personalizadas
            const colors = {
                primary: '#4e73df',     // Cor primária do sistema
                primaryLight: '#6f8ff7',  // Tom mais claro da cor primária
                success: '#1cc88a',      // Verde do sistema
                danger: '#e74a3b',       // Vermelho do sistema
                warning: '#f6c23e',      // Amarelo do sistema
                info: '#36b9cc',         // Azul claro do sistema
                text: '#5a5c69',         // Cor do texto
                muted: '#858796',        // Texto mais suave
                background: '#FFFFFF',   // Fundo branco
                grid: 'rgba(0, 0, 0, 0.05)'
            };

            new Chart(dailyReservationsCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        // Linha de tendência
                        {
                            label: 'Tendência',
                            data: dailyReservations,
                            type: 'line',
                            borderColor: colors.info,  // Usando a cor info do sistema
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [4, 4],
                            pointBackgroundColor: colors.background,
                            pointBorderColor: colors.info,  // Usando a cor info do sistema
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointHoverBackgroundColor: colors.background,
                            pointHoverBorderColor: colors.info,  // Usando a cor info do sistema
                            pointHoverBorderWidth: 2,
                            fill: false,
                            tension: 0.3,
                            order: 1
                        },
                        // Barras principais
                        {
                            label: 'Reservas',
                            data: dailyReservations,
                            backgroundColor: gradientBg,
                            borderColor: colors.primary,
                            borderWidth: 0,
                            borderRadius: {
                                topLeft: 8,
                                topRight: 8,
                                bottomLeft: 0,
                                bottomRight: 0
                            },
                            maxBarThickness: 35,
                            hoverBackgroundColor: 'rgba(25, 95, 223, 1)', // Cor mais forte no hover
                            hoverBorderColor: colors.primary,
                            hoverBorderWidth: 0,
                            order: 2
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    responsive: true,
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: colors.text,
                                font: {
                                    family: 'Days One, sans-serif',
                                    size: 12
                                },
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            backgroundColor: colors.background,
                            titleColor: colors.primary,
                            bodyColor: colors.text,
                            borderColor: 'rgba(0, 0, 0, 0.1)',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            cornerRadius: 8,
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                            callbacks: {
                                title: function(context) {
                                    return `${context[0].label}`;
                                },
                                label: function(context) {
                                    const value = context.raw || 0;
                                    const dayIndex = context.dataIndex;
                                    const dayName = labels[dayIndex];
                                    const prevDayValue = dayIndex > 0 ? dailyReservations[dayIndex - 1] : value;
                                    const diff = dayIndex > 0 ? value - prevDayValue : 0;
                                    const diffPercent = prevDayValue > 0 ? ((diff / prevDayValue) * 100).toFixed(1) : 0;
                                    
                                    const diffText = diff !== 0 ? 
                                        `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} (${Math.abs(diffPercent)}%)` : 
                                        'Sem alteração';
                                    
                                    return [
                                        `Reservas: ${value}`,
                                        `Variação: ${diffText}`,
                                        `Média diária: ${avgReservations}`
                                    ];
                                }
                            }
                        },
                        annotation: {
                            annotations: {
                                line1: {
                                    type: 'line',
                                    yMin: avgReservations,
                                    yMax: avgReservations,
                                    borderColor: colors.danger,
                                    borderWidth: 2,
                                    borderDash: [4, 4],
                                    label: {
                                        content: `Média: ${avgReservations}`,
                                        enabled: true,
                                        position: 'right',
                                        backgroundColor: colors.danger,
                                        color: '#fff',
                                        font: {
                                            family: 'Days One, sans-serif',
                                            size: 10,
                                            weight: 'bold'
                                        },
                                        padding: {
                                            top: 4,
                                            bottom: 4,
                                            left: 8,
                                            right: 8
                                        },
                                        borderRadius: 4
                                    }
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: colors.grid,
                                drawBorder: false,
                                drawTicks: false
                            },
                            border: {
                                display: false
                            },
                            ticks: {
                                stepSize: Math.ceil(Math.max(...dailyReservations) / 5),
                                font: {
                                    family: 'Days One, sans-serif',
                                    size: 11
                                },
                                color: colors.muted,
                                padding: 8,
                                callback: function(value) {
                                    return value + (value > 0 ? ' reservas' : '');
                                }
                            }
                        },
                        x: {
                            grid: {
                                display: false,
                                drawBorder: false,
                                drawOnChartArea: false,
                                drawTicks: false
                            },
                            border: {
                                display: false
                            },
                            ticks: {
                                font: {
                                    family: 'Days One, sans-serif',
                                    size: 11,
                                    weight: 'bold'
                                },
                                color: colors.text,
                                padding: 8
                            }
                        }
                    },
                    animation: {
                        duration: 1500,
                        easing: 'easeOutQuart',
                        delay: (context) => {
                            return context.type === 'data' && context.mode === 'default' ? context.dataIndex * 100 : 0;
                        }
                    },
                    layout: {
                        padding: {
                            top: 10,
                            right: 15,
                            left: 10,
                            bottom: 90
                        }
                    }
                },
                plugins: [{
                    id: 'customBottomRightText',
                    afterDraw(chart) {
                        const ctx = chart.ctx;
                        const chartArea = chart.chartArea;
                        
                        // Configurações do texto
                        ctx.save();
                        
                        // Posicionar abaixo do gráfico (mais para baixo)
                        const x = chartArea.right - 15;
                        const y = chart.chartArea.bottom + 130;  // Aumentado para 130 para posicionar mais abaixo
                        
                        // Textos
                        const texts = [
                            { text: `Total: ${totalReservations} reservas`, color: colors.primary, size: 14, weight: 'bold' },
                            { text: `Média: ${avgReservations} reservas/dia`, color: colors.muted, size: 12, weight: 'normal' },
                            { text: `Período: 7 dias`, color: colors.muted, size: 11, weight: 'normal' }
                        ];
                        
                        // Calcular dimensões
                        const textWidths = texts.map(t => {
                            ctx.font = `${t.weight} ${t.size}px 'Days One', sans-serif`;
                            return ctx.measureText(t.text).width;
                        });
                        const maxTextWidth = Math.max(...textWidths);
                        const boxWidth = maxTextWidth + 40;
                        const boxHeight = texts.length * 25 + 20;
                        const radius = 12;
                        
                        // Desenhar fundo do card - posicionado mais abaixo
                        const cardY = y + 20;  // Adiciona 20px para descer mais o card
                        ctx.beginPath();
                        ctx.moveTo(x - boxWidth + radius, cardY - boxHeight);
                        ctx.arcTo(x, cardY - boxHeight, x, cardY - boxHeight + radius, radius);
                        ctx.arcTo(x, cardY, x - radius, cardY, radius);
                        ctx.arcTo(x - boxWidth, cardY, x - boxWidth, cardY - radius, radius);
                        ctx.arcTo(x - boxWidth, cardY - boxHeight, x - boxWidth + radius, cardY - boxHeight, radius);
                        ctx.closePath();
                        
                        // Preencher com gradiente
                        const gradient = ctx.createLinearGradient(0, y - boxHeight, 0, y);
                        gradient.addColorStop(0, 'rgba(248, 249, 252, 0.95)');
                        gradient.addColorStop(1, 'rgba(240, 242, 247, 0.95)');
                        
                        ctx.fillStyle = gradient;
                        ctx.fill();
                        
                        // Borda sutil
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        
                        // Sombra
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 4;
                        
                        // Desenhar ícone - ajustado para a nova posição
                        const iconY = cardY - boxHeight + 25;
                        ctx.font = '900 16px "Font Awesome 6 Free"';
                        ctx.fillStyle = colors.primary;
                        ctx.fillText('\uf073', x - boxWidth + 15, iconY);
                        
                        // Desenhar textos - ajustado para a nova posição
                        texts.forEach((t, i) => {
                            ctx.font = `${t.weight} ${t.size}px 'Days One', sans-serif`;
                            ctx.fillStyle = t.color;
                            ctx.textAlign = 'left';
                            ctx.fillText(t.text, x - boxWidth + 40, iconY + (i * 22));
                        });
                        
                        // Resetar sombra
                        ctx.shadowColor = 'transparent';
                        ctx.restore();
                    }
                }]
            });

            // Gráfico de Distribuição de Vagas (Regulares vs Locação)
            const spotDistributionCtx = document.getElementById('spotDistributionChart').getContext('2d');
            new Chart(spotDistributionCtx, {
                type: 'bar',
                data: {
                    labels: ['Andar 1', 'Andar 2', 'Andar 3', 'Andar 4', 'Andar 5'],
                    datasets: [
                        {
                            label: 'Vagas Regulares',
                            data: [15, 12, 18, 14, 16],
                            backgroundColor: 'rgba(0, 64, 128, 0.7)', // Azul escuro principal
                            borderColor: 'rgba(0, 64, 128, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Vagas de Locação',
                            data: [5, 8, 7, 6, 4],
                            backgroundColor: 'rgba(0, 200, 83, 0.7)', // Verde do sistema
                            borderColor: 'rgba(0, 200, 83, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    responsive: true,
                    scales: {
                        x: {
                            stacked: true,
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: '#5a5c69',
                                font: {
                                    family: '"Days One", sans-serif',
                                    size: 12
                                }
                            }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: {
                                color: '#5a5c69',
                                callback: function(value) {
                                    return value + ' vagas';
                                }
                            },
                            grid: {
                                color: 'rgba(0,0,0,0.05)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: '#5a5c69',
                                font: {
                                    family: '"Days One", sans-serif',
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            backgroundColor: '#ffffff',
                            titleColor: "#002850",
                            bodyColor: '#5a5c69',
                            borderColor: "#e3e6f0",
                            borderWidth: 1,
                            padding: 12,
                            displayColors: true,
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    const value = context.raw || 0;
                                    return `${label}: ${value} vagas`;
                                }
                            }
                        }
                    }
                }
            });


            console.log("Painel de controle inicializado com sucesso!");
        }); // Fecha o DOMContentLoaded
    })(); // Fecha a IIFE
