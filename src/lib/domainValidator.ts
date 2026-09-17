export type DomainStatus = 'SSL Válido' | 'HTTP Inseguro' | 'Erro 404/Inativo';

/**
 * Valida a saúde e segurança de um domínio verificando requisições HTTP/HTTPS (Edge Compatible)
 */
export async function validateDomain(domain: string): Promise<DomainStatus> {
  try {
    const hostname = new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname;

    // 2. Testa HTTPS primeiro (timeout curto para agilidade)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

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
    const httpTimeoutId = setTimeout(() => httpController.abort(), 2000);

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
  } catch {
    return 'Erro 404/Inativo';
  }
}
