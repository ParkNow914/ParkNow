// middleware/uploadMiddleware.js
// Configura o Multer para lidar com uploads de arquivos (ex: fotos de estacionamento).

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { BadRequestError } = require('../utils/AppError'); // Erro customizado para tipo/tamanho
const config = require('../config'); // Importa config para limites e caminho
const logger = require('../utils/logger'); // Importa logger

// Diretório onde os uploads serão salvos
const UPLOAD_DIR = config.uploads.path;

// Garante que o diretório de uploads exista na inicialização
try {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        logger.info(`[Upload] Diretório de uploads criado em: ${UPLOAD_DIR}`);
    }
} catch (error) {
    logger.error(`[Upload] Falha CRÍTICA ao criar/acessar diretório de uploads ${UPLOAD_DIR}:`, error);
    // Considerar encerrar se a funcionalidade de upload for essencial
    // process.exit(1);
}


// --- Configuração de Armazenamento (DiskStorage) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Verifica se a pasta existe antes de salvar (redundância segura)
        if (!fs.existsSync(UPLOAD_DIR)) {
             logger.error(`[Upload] Diretório de destino ${UPLOAD_DIR} não encontrado durante upload.`);
             return cb(new Error('Erro interno: Diretório de upload não encontrado.'), null);
        }
        cb(null, UPLOAD_DIR); // Salva na pasta configurada
    },
    filename: function (req, file, cb) {
        // Cria nome único: campo-timestamp-aleatorio.extensao
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = file.fieldname + '-' + uniqueSuffix + extension;
        logger.debug(`[Upload] Gerando nome de arquivo: ${filename}`);
        cb(null, filename);
    }
});

// --- Configuração de Filtro de Arquivo ---
const fileFilter = (req, file, cb) => {
    // Verifica o mimetype usando a lista da configuração
    if (config.uploads.allowedMimes.includes(file.mimetype)) {
        cb(null, true); // Aceita o arquivo
    } else {
        const allowedTypes = config.uploads.allowedMimes.map(m=>m.split('/')[1]).join(', ');
        logger.warn(`[Upload] Tentativa de upload de tipo inválido: ${file.mimetype}. Permitidos: ${allowedTypes}. IP: ${req.ip}`);
        // Rejeita o arquivo com erro BadRequestError
        cb(new BadRequestError(`Tipo de arquivo inválido! Apenas ${allowedTypes} são permitidos.`), false);
    }
};

// --- Configuração de Limites (Usa config) ---
const limits = {
    fileSize: config.uploads.maxFileSize, // Limite em bytes
    // Outros limites podem ser adicionados aqui (ex: files: 1 para garantir um só)
};

// --- Cria a instância do Multer ---
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: limits
});

// Exporta a instância configurada para ser usada nas rotas
// Exemplo de uso na rota: upload.single('nomeDoCampoNoFormulario')
module.exports = upload;