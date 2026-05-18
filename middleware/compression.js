const zlib = require('zlib');
const accepts = require('accepts');
const onHeaders = require('on-headers');
const bytes = require('bytes');
const logger = require('../utils/logger');

const defaultOptions = {
  // Tamanho mínimo para compressão (1KB)
  threshold: '1kb',
  // Nível de compressão (0-9, onde 0 é sem compressão e 9 é máxima compressão)
  level: 6,
  // Tipos de conteúdo que devem ser comprimidos
  filter: (req, res) => {
    // Não compacta respostas que já estão codificadas
    if (res.getHeader('Content-Encoding')) {
      return false;
    }

    // Verifica o tipo de conteúdo
    const type = res.getHeader('Content-Type') || '';
    
    // Tipos que devem ser comprimidos
    const compressibleTypes = [
      'text/plain',
      'text/html',
      'text/css',
      'application/javascript',
      'application/json',
      'application/x-javascript',
      'application/xml',
      'application/atom+xml',
      'application/rss+xml',
      'application/vnd.ms-fontobject',
      'application/x-font-ttf',
      'application/x-web-app-manifest+json',
      'application/xhtml+xml',
      'image/svg+xml',
      'image/x-icon',
      'font/opentype',
      'font/otf',
      'font/ttf',
      'font/woff',
      'font/woff2'
    ];

    return compressibleTypes.some(t => type.includes(t));
  }
};

/**
 * Middleware de compressão de resposta
 * @param {Object} options Opções de configuração
 */
function compression(options = {}) {
  const opts = { ...defaultOptions, ...options };
  const threshold = typeof opts.threshold === 'string' 
    ? bytes.parse(opts.threshold)
    : Number(opts.threshold) || 0;

  return (req, res, next) => {
    // Verifica se a compressão está habilitada para esta resposta
    if (req.method === 'HEAD' || req.method === 'OPTIONS' || req.method === 'CONNECT') {
      next();
      return;
    }

    // Armazena os métodos originais
    const _end = res.end;
    const _write = res.write;
    const _on = res.on;
    const _writeHead = res.writeHead;
    
    // Flags para controle
    let ended = false;
    let streaming = false;
    let _acceptEncoding = '';
    let _compress = false;
    let stream = null;
    let length = 0;
    const buffers = [];
    
    // Verifica se o cliente aceita compressão
    const accept = accepts(req);
    const encoding = accept.encoding(['gzip', 'deflate', 'identity']);
    
    // Se o cliente não suporta compressão ou não há necessidade de comprimir
    if (!encoding || encoding === 'identity' || !opts.filter(req, res)) {
      next();
      return;
    }
    
    // Configura o stream de compressão apropriado
    switch (encoding) {
      case 'gzip':
        stream = zlib.createGzip({
          level: opts.level,
          memLevel: 8
        });
        break;
      case 'deflate':
        stream = zlib.createDeflate({
          level: opts.level,
          memLevel: 8
        });
        break;
      default:
        next();
        return;
    }
    
    // Configura os cabeçalhos de resposta
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Vary', 'Accept-Encoding');
    
    // Remove o cabeçalho Content-Length pois o tamanho mudará com a compressão
    if (res.getHeader('Content-Length')) {
      res.removeHeader('Content-Length');
    }
    
    // Sobrescreve o método write para capturar os dados
    res.write = function(chunk, encoding, callback) {
      if (ended) {
        return false;
      }
      
      if (!streaming) {
        streaming = true;
        // Primeiro chunk, inicia a compressão
        stream.on('data', function(chunk) {
          _write.call(res, chunk);
        });
        
        stream.on('end', function() {
          _end.call(res);
        });
        
        stream.on('error', function(err) {
          logger.error('Erro na compressão:', err);
          _end.call(res);
        });
      }
      
      // Acumula o tamanho dos dados
      if (chunk) {
        length += chunk.length;
      }
      
      // Se o tamanho for menor que o limite, armazena em buffer
      if (length < threshold) {
        buffers.push(chunk);
        return true;
      }
      
      // Se já tiver dados em buffer, envia primeiro
      if (buffers.length > 0) {
        for (const buf of buffers) {
          stream.write(buf);
        }
        buffers.length = 0; // Limpa o buffer
      }
      
      // Escreve o chunk atual
      stream.write(chunk, encoding, callback);
      return true;
    };
    
    // Sobrescreve o método end
    res.end = function(chunk, encoding, callback) {
      if (ended) return false;
      ended = true;
      
      // Se não estiver streaming, verifica se deve comprimir
      if (!streaming) {
        // Se o tamanho for menor que o limite, não comprime
        const contentLength = res.getHeader('Content-Length');
        if ((contentLength && contentLength < threshold) || 
            (chunk && chunk.length < threshold)) {
          // Remove o cabeçalho de codificação
          res.removeHeader('Content-Encoding');
          res.removeHeader('Vary');
          
          // Restaura os métodos originais
          res.write = _write;
          res.end = _end;
          
          return _end.call(res, chunk, encoding, callback);
        }
        
        // Inicia a compressão
        streaming = true;
        
        stream.on('data', function(chunk) {
          _write.call(res, chunk);
        });
        
        stream.on('end', function() {
          _end.call(res);
        });
        
        stream.on('error', function(err) {
          logger.error('Erro na compressão:', err);
          _end.call(res);
        });
        
        // Escreve os dados em buffer
        if (buffers.length > 0) {
          for (const buf of buffers) {
            stream.write(buf);
          }
          buffers.length = 0;
        }
      }
      
      // Escreve o chunk final e finaliza
      if (chunk) {
        stream.write(chunk, encoding);
      }
      
      stream.end();
      
      // Chama o callback quando o stream terminar
      if (callback) {
        stream.on('end', callback);
      }
      
      return true;
    };
    
    // Sobrescreve o método writeHead para adicionar cabeçalhos
    res.writeHead = function() {
      const args = arguments;
      
      return _writeHead.apply(res, args);
    };
    
    // Adiciona um listener para o evento finish
    onHeaders(res, function() {
      // Se não começou a stream, verifica se deve comprimir
      if (!streaming && !ended) {
        const len = res.getHeader('Content-Length');
        
        // Se o tamanho for menor que o limite, não comprime
        if (len && len < threshold) {
          res.removeHeader('Content-Encoding');
          res.removeHeader('Vary');
          
          // Restaura os métodos originais
          res.write = _write;
          res.end = _end;
        }
      }
    });
    
    // Continua para o próximo middleware
    next();
  };
}

// Middleware para compressão de respostas JSON
function compressResponse(options = {}) {
  const compress = compression(options);
  
  return (req, res, next) => {
    // Configura o tipo de conteúdo para JSON se não estiver definido
    const type = res.getHeader('Content-Type');
    if (!type) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    
    // Aplica a compressão
    compress(req, res, next);
  };
}

module.exports = {
  compression,
  compressResponse
};
