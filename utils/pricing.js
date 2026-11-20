// utils/pricing.js
// Cálculo do valor de uma reserva feito SEMPRE no servidor, a partir da tabela
// de preços do estacionamento. Nenhum valor vindo do cliente é usado.
//
// Regra:
//   - Cobra-se por hora iniciada (mínimo de 1 hora).
//   - Se o estacionamento tem diária, cada bloco de 24h custa no máximo a
//     diária, e as horas que sobram também ficam limitadas a uma diária.
//   - Todo o cálculo é feito em centavos inteiros para evitar erro de ponto
//     flutuante.

const MS_POR_MINUTO = 60 * 1000;
const MINUTOS_POR_HORA = 60;
const HORAS_POR_DIA = 24;

function paraCentavos(valor) {
    const n = typeof valor === 'string' ? Number.parseFloat(valor) : Number(valor);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
}

/**
 * Lê os preços de um estacionamento aceitando os dois nomes de coluna que
 * coexistem no schema (preco_* é o oficial; valor_* é legado).
 */
function precosDoEstacionamento(estacionamento) {
    if (!estacionamento) return { horaCentavos: 0, diaCentavos: 0 };
    const hora = paraCentavos(estacionamento.preco_hora) || paraCentavos(estacionamento.valor_hora);
    const dia = paraCentavos(estacionamento.preco_dia) || paraCentavos(estacionamento.valor_diaria);
    return { horaCentavos: hora, diaCentavos: dia };
}

/**
 * Calcula o valor de uma reserva.
 * @param {object} p
 * @param {Date} p.entrada
 * @param {Date} p.saida
 * @param {object} p.estacionamento  linha de `estacionamentos` (preco_hora/preco_dia)
 * @returns {{ valor: number, centavos: number, horasCobradas: number, minutos: number }}
 * @throws {Error} quando o período é inválido ou não há tabela de preço
 */
function calcularValorReserva({ entrada, saida, estacionamento }) {
    if (!(entrada instanceof Date) || Number.isNaN(entrada.getTime())) {
        throw new Error('Data de entrada inválida.');
    }
    if (!(saida instanceof Date) || Number.isNaN(saida.getTime())) {
        throw new Error('Data de saída inválida.');
    }
    const minutos = Math.ceil((saida.getTime() - entrada.getTime()) / MS_POR_MINUTO);
    if (minutos <= 0) {
        throw new Error('A saída precisa ser depois da entrada.');
    }

    const { horaCentavos, diaCentavos } = precosDoEstacionamento(estacionamento);
    if (horaCentavos <= 0 && diaCentavos <= 0) {
        throw new Error('Este estacionamento ainda não tem tabela de preços configurada.');
    }

    const horasCobradas = Math.max(1, Math.ceil(minutos / MINUTOS_POR_HORA));

    let centavos;
    if (diaCentavos > 0) {
        const dias = Math.floor(horasCobradas / HORAS_POR_DIA);
        const horasRestantes = horasCobradas % HORAS_POR_DIA;
        const custoHorasRestantes = horaCentavos > 0
            ? Math.min(horasRestantes * horaCentavos, diaCentavos)
            : (horasRestantes > 0 ? diaCentavos : 0);
        centavos = dias * diaCentavos + custoHorasRestantes;
    } else {
        centavos = horasCobradas * horaCentavos;
    }

    if (!Number.isSafeInteger(centavos) || centavos <= 0) {
        throw new Error('Não foi possível calcular o valor da reserva.');
    }

    return { valor: centavos / 100, centavos, horasCobradas, minutos };
}

module.exports = { calcularValorReserva, precosDoEstacionamento, paraCentavos };
