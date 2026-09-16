import dns from 'dns/promises';

export type DomainStatus = 'SSL Válido' | 'HTTP Inseguro' | 'Erro 404/Inativo';

/**
 * Valida a saúde e segurança de um domínio verificando DNS e requisições HTTP/HTTPS
 */
export async function validateDomain(domain: string): Promise<DomainStatus> {
  try {
    const hostname = new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname;
    
    // 1. Testa DNS
    try {
      await dns.lookup(hostname);
    } catch {
      return 'Erro 404/Inativo';
    }

    // 2. Testa HTTPS primeiro (timeout curto para não travar a API)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const httpsRes = await fetch(`https://${hostname}`, { 
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (httpsRes.ok || httpsRes.status < 400) {
        return 'SSL Válido';
      }
    } catch {
      // Falhou HTTPS, vamos testar HTTP
      clearTimeout(timeoutId);
    }

    // 3. Testa HTTP Inseguro
    const httpController = new AbortController();
    const httpTimeoutId = setTimeout(() => httpController.abort(), 5000);

    try {
      const httpRes = await fetch(`http://${hostname}`, {
        method: 'HEAD',
        signal: httpController.signal
      });
      clearTimeout(httpTimeoutId);
      
      if (httpRes.ok || httpRes.status < 400) {
        return 'HTTP Inseguro';
      }
    } catch {
      clearTimeout(httpTimeoutId);
      return 'Erro 404/Inativo';
    }

    return 'Erro 404/Inativo';
  } catch (error) {
    return 'Erro 404/Inativo';
  }
}
