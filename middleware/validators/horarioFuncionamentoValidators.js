const { body, param } = require('express-validator');
const { AppError } = require('../../utils/AppError');

const validateHorarioId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID do horário deve ser um número inteiro positivo')
    .toInt()
];

const validateEstacionamentoId = [
  param('estacionamentoId')
    .isInt({ min: 1 })
    .withMessage('ID do estacionamento deve ser um número inteiro positivo')
    .toInt()
];

const validateHorarioBody = [
  body('aberto')
    .isBoolean()
    .withMessage('O campo "aberto" é obrigatório e deve ser um booleano'),
  body('horario_abertura')
    .if(body('aberto').equals(true))
    .notEmpty()
    .withMessage('Horário de abertura é obrigatório quando aberto=true')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('Formato de horário de abertura inválido. Use HH:MM:SS'),
  body('horario_fechamento')
    .if(body('aberto').equals(true))
    .notEmpty()
    .withMessage('Horário de fechamento é obrigatório quando aberto=true')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('Formato de horário de fechamento inválido. Use HH:MM:SS')
    .custom((value, { req }) => {
      if (req.body.aberto && req.body.horario_abertura) {
        const [horaAbertura, minAbertura] = req.body.horario_abertura.split(':');
        const [horaFechamento, minFechamento] = value.split(':');
        
        const dataAbertura = new Date();
        dataAbertura.setHours(parseInt(horaAbertura), parseInt(minAbertura), 0, 0);
        
        const dataFechamento = new Date();
        dataFechamento.setHours(parseInt(horaFechamento), parseInt(minFechamento), 0, 0);
        
        if (dataAbertura >= dataFechamento) {
          throw new Error('O horário de abertura deve ser anterior ao horário de fechamento');
        }
      }
      return true;
    })
];

const validateHorariosLote = [
  body('horarios')
    .isArray({ min: 1 })
    .withMessage('O campo "horarios" é obrigatório e deve ser um array não vazio'),
  body('horarios.*.id')
    .isInt({ min: 1 })
    .withMessage('Cada horário deve ter um ID válido'),
  body('horarios.*.aberto')
    .isBoolean()
    .withMessage('O campo "aberto" é obrigatório e deve ser um booleano'),
  body('horarios.*.horario_abertura')
    .if((value, { req, path }) => {
      const index = parseInt(path.match(/\d+/)[0]);
      return req.body.horarios[index].aberto === true;
    })
    .notEmpty()
    .withMessage('Horário de abertura é obrigatório quando aberto=true')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('Formato de horário de abertura inválido. Use HH:MM:SS'),
  body('horarios.*.horario_fechamento')
    .if((value, { req, path }) => {
      const index = parseInt(path.match(/\d+/)[0]);
      return req.body.horarios[index].aberto === true;
    })
    .notEmpty()
    .withMessage('Horário de fechamento é obrigatório quando aberto=true')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('Formato de horário de fechamento inválido. Use HH:MM:SS')
    .custom((value, { req, path }) => {
      const index = parseInt(path.match(/\d+/)[0]);
      const horario = req.body.horarios[index];
      
      if (horario.aberto && horario.horario_abertura) {
        const [horaAbertura, minAbertura] = horario.horario_abertura.split(':');
        const [horaFechamento, minFechamento] = value.split(':');
        
        const dataAbertura = new Date();
        dataAbertura.setHours(parseInt(horaAbertura), parseInt(minAbertura), 0, 0);
        
        const dataFechamento = new Date();
        dataFechamento.setHours(parseInt(horaFechamento), parseInt(minFechamento), 0, 0);
        
        if (dataAbertura >= dataFechamento) {
          throw new Error(`O horário de abertura deve ser anterior ao horário de fechamento para o horário ${horario.id}`);
        }
      }
      return true;
    })
];

module.exports = {
  validateHorarioId,
  validateEstacionamentoId,
  validateHorarioBody,
  validateHorariosLote
};
