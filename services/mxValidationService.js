const dns = require('dns').promises;
const { promisify } = require('util');
const dnsResolve = promisify(dns.resolve);
const dnsResolveMx = promisify(dns.resolveMx);
const logger = require('../utils/logger');

class MXValidationService {
    constructor() {
        this.DNS_TIMEOUT = parseInt(process.env.DNS_QUERY_TIMEOUT || '5000');
        this.MIN_MX_PRIORITY = parseInt(process.env.MIN_MX_PRIORITY || '100');
    }

    async withTimeout(promise, timeout, errorMessage = 'Timeout') {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeout);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async resolveMxRecords(domain) {
        try {
            const records = await this.withTimeout(
                dnsResolveMx(domain),
                this.DNS_TIMEOUT,
                `MX query timeout for ${domain}`
            );
            
            if (!records || records.length === 0) {
                throw new Error('No MX records found');
            }

            // Ordena por prioridade (menor número = maior prioridade)
            return records.sort((a, b) => a.priority - b.priority);
        } catch (error) {
            logger.warn(`MX lookup failed for ${domain}:`, error.message);
            // Fallback para verificação de registros A/AAAA
            try {
                await this.withTimeout(
                    dnsResolve(domain, 'A'),
                    this.DNS_TIMEOUT,
                    'A record lookup timeout'
                );
                return [{ exchange: domain, priority: this.MIN_MX_PRIORITY + 1 }];
            } catch (fallbackError) {
                throw new Error('No valid MX or A records found');
            }
        }
    }

    async validateMxRecords(domain) {
        try {
            const mxRecords = await this.resolveMxRecords(domain);
            
            // Se chegou até aqui, significa que temos registros MX ou um fallback para A/AAAA
            logger.info(`MX validation successful for ${domain}`, { 
                hasMxRecords: mxRecords.length > 0,
                records: mxRecords 
            });
            
            return mxRecords;
            
        } catch (error) {
            // Para domínios conhecidos como gmail.com, hotmail.com, etc., aceita mesmo sem MX
            const wellKnownDomains = [
                'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 
                'outlook.com', 'live.com', 'aol.com', 'icloud.com', 'me.com'
            ];
            
            const isWellKnownDomain = wellKnownDomains.some(d => 
                domain.endsWith(d) || domain === d
            );
            
            if (isWellKnownDomain) {
                logger.info(`Allowing well-known domain without MX records: ${domain}`);
                return [{ exchange: domain, priority: this.MIN_MX_PRIORITY + 1 }];
            }
            
            logger.warn(`MX validation failed for ${domain}:`, error.message);
            throw error;
        }
    }
}

module.exports = new MXValidationService();
