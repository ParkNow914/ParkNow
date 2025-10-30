const express = require('express');
const router = express.Router();
const cnpjController = require('../controllers/cnpjController');

/**
 * @swagger
 * /api/cnpj/{cnpj}:
 *   get:
 *     summary: Valida um CNPJ na Receita WS
 *     tags: [CNPJ]
 *     parameters:
 *       - in: path
 *         name: cnpj
 *         required: true
 *         schema:
 *           type: string
 *         description: CNPJ a ser validado (apenas números)
 *     responses:
 *       200:
 *         description: CNPJ válido e ativo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valido:
 *                   type: boolean
 *                   example: true
 *                 dados:
 *                   type: object
 *                   properties:
 *                     cnpj:
 *                       type: string
 *                       example: "12345678000123"
 *                     nome:
 *                       type: string
 *                       example: "Empresa Exemplo LTDA"
 *                     fantasia:
 *                       type: string
 *                       example: "Empresa Exemplo"
 *                     situacao:
 *                       type: string
 *                       example: "ATIVA"
 *                 mensagem:
 *                   type: string
 *                   example: "CNPJ válido e ativo"
 *       400:
 *         description: CNPJ inválido ou inativo
 *       500:
 *         description: Erro ao validar CNPJ
 */

// Rota para validar CNPJ
router.get('/:cnpj', cnpjController.validarCNPJ);

// Exporta o roteador
module.exports = router;
