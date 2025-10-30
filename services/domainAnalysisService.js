const fs = require('fs').promises;
const path = require('path');
const tldjs = require('tldjs');
const logger = require('../utils/logger');

class DomainAnalysisService {
    constructor() {
        this.disposableDomains = new Set();
        this.freeEmailDomains = new Set();
        this.suspiciousPatterns = [
            /\d{10,}/, // Muitos números
            /[^a-zA-Z0-9.-]/, // Caracteres especiais
            /(\.|-|_)\1{2,}/, // Múltiplos pontos, hífens ou underscores
            /^\d+\.\d+\.\d+\.\d+$/ // Endereços IP
        ];
        
        this.init().catch(err => {
            logger.error('Erro ao inicializar DomainAnalysisService:', err);
        });
    }

    async init() {
        try {
            // Carrega listas de domínios de e-mail grátis
            const freeEmailData = await fs.readFile(
                path.join(__dirname, '../data/free-email-domains.txt'), 
                'utf8'
            );
            this.freeEmailDomains = new Set(
                freeEmailData
                    .split('\n')
                    .map(line => line.trim().toLowerCase())
                    .filter(domain => domain && !domain.startsWith('#'))
            );
            logger.info(`Carregados ${this.freeEmailDomains.size} domínios de e-mail grátis`);
        } catch (error) {
            logger.warn('Não foi possível carregar a lista de domínios grátis, usando lista padrão:', error.message);
            // Lista de fallback básica
            this.freeEmailDomains = new Set([
                'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
                'aol.com', 'icloud.com', 'protonmail.com', 'zoho.com',
                'mail.com', 'yandex.com', 'gmx.com', 'proton.me', 'gmx.net',
                'live.com', 'msn.com', 'me.com', 'mac.com', 'zohomail.com'
            ]);
        }
    }

    isDisposableEmail(domain) {
        try {
            // Lista básica de domínios de e-mail descartáveis
            const disposableDomains = [
                'tempmail.com', 'mailinator.com', 'guerrillamail.com',
                '10minutemail.com', 'yopmail.com', 'throwawaymail.com',
                'temp-mail.org', 'dispostable.com', 'maildrop.cc', 'getnada.com'
            ];
            
            const domainLower = domain.toLowerCase();
            return disposableDomains.some(d => domainLower.endsWith(d));
        } catch (error) {
            logger.warn('Erro ao verificar e-mail descartável:', error);
            return false; // Por padrão, assume que não é descartável em caso de erro
        }
    }

    isFreeEmail(domain) {
        return this.freeEmailDomains.has(domain.toLowerCase());
    }

    isSuspicious(domain) {
        const domainLower = domain.toLowerCase();
        
        // Verifica padrões suspeitos
        if (this.suspiciousPatterns.some(pattern => pattern.test(domainLower))) {
            return true;
        }

        // Verifica se é um domínio válido
        const parsed = tldjs.parse(domainLower);
        if (!parsed.isValid || !parsed.domain) {
            return true;
        }

        // Domínios muito curtos são suspeitos
        if (parsed.domain.length < 5) {
            return true;
        }

        return false;
    }

    getDomainInfo(domain) {
        try {
            if (!domain || typeof domain !== 'string' || domain.trim() === '') {
                throw new Error('Domínio inválido ou não fornecido');
            }
            
            const domainLower = domain.toLowerCase().trim();
            const isDisposable = this.isDisposableEmail(domainLower);
            const isFree = this.isFreeEmail(domainLower);
            const isSuspicious = this.isSuspicious(domainLower);
            
            return {
                domain: domainLower,
                isDisposable,
                isFree,
                isSuspicious,
                riskScore: this.calculateRiskScore(isDisposable, isFree, isSuspicious)
            };
        } catch (error) {
            logger.error('Erro ao analisar domínio:', { domain, error: error.message });
            // Retorna um objeto seguro em caso de erro
            return {
                domain: domain || 'unknown',
                isDisposable: true, // Por segurança, assume que é descartável em caso de erro
                isFree: false,
                isSuspicious: true, // Por segurança, assume que é suspeito em caso de erro
                riskScore: 10 // Pontuação máxima de risco em caso de erro
            };
        }
    }

    calculateRiskScore(isDisposable, isFree, isSuspicious) {
        let score = 0;
        
        if (isDisposable) score += 10;
        if (isSuspicious) score += 8;
        if (isFree) score += 3;
        
        return Math.min(score, 10); // Normaliza para 0-10
    }
}

module.exports = new DomainAnalysisService();
