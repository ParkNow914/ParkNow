/**
 * Middleware para verificar se o usuário tem a função necessária
 * @param {Array} roles - Lista de funções permitidas
 * @returns {Function} Middleware function
 */
const checkUserRole = (roles = []) => {
    return (req, res, next) => {
        try {
            // Se não houver funções definidas, permite o acesso
            if (!roles || roles.length === 0) {
                return next();
            }

            // Verifica se o usuário está autenticado
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Não autorizado: usuário não autenticado'
                });
            }

            // Verifica se o usuário tem pelo menos uma das funções necessárias
            const hasRole = roles.some(role => req.user.role === role);
            
            if (hasRole) {
                return next();
            }

            // Se chegou aqui, o usuário não tem permissão
            return res.status(403).json({
                success: false,
                message: 'Acesso negado: permissão insuficiente'
            });

        } catch (error) {
            console.error('Erro ao verificar função do usuário:', error);
            return res.status(500).json({
                success: false,
                message: 'Erro ao verificar permissões',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    };
};

/**
 * Middleware para verificar se o usuário é um administrador
 */
const isAdmin = (req, res, next) => {
    return checkUserRole(['admin', 'superadmin'])(req, res, next);
};

/**
 * Middleware para verificar se o usuário é um estacionamento
 */
const isEstacionamento = (req, res, next) => {
    return checkUserRole(['estacionamento'])(req, res, next);
};

/**
 * Middleware para verificar se o usuário é um cliente
 */
const isCliente = (req, res, next) => {
    return checkUserRole(['cliente'])(req, res, next);
};

/**
 * Middleware para verificar se o usuário é um superadmin
 */
const isSuperAdmin = (req, res, next) => {
    return checkUserRole(['superadmin'])(req, res, next);
};

module.exports = {
    checkUserRole,
    isAdmin,
    isEstacionamento,
    isCliente,
    isSuperAdmin
};
