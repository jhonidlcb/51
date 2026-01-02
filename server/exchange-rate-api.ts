// Exchange Rate API Service
// Using exchangerate-api.com (free tier: 1,500 requests/month)

interface ExchangeRateAPIResponse {
  result: string;
  documentation?: string;
  terms_of_use?: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  rates: {
    [key: string]: number;
  };
}

/**
 * Obtiene el tipo de cambio actual USD -> PYG desde la API
 * Fuente principal: Wise.com (API pública, datos en tiempo real)
 */
export async function fetchCurrentExchangeRate(): Promise<number | null> {
  try {
    // Estrategia de respaldo en cascada:
    // 1. Wise.com (tasa de cambio real, actualizada constantemente)
    // 2. BCP (fuente oficial paraguaya)
    // 3. Wisercoin (mercado local paraguayo)
    // 4. Open Exchange Rates (internacional)
    
    console.log('🔄 Intentando obtener tipo de cambio...');
    
    // 1. Intentar Wise (principal - tasa real)
    const wiseRate = await fetchExchangeRateFromWise();
    if (wiseRate) {
      console.log('✅ Usando tipo de cambio de Wise (tasa real)');
      return wiseRate;
    }
    
    // 2. Intentar BCP (oficial)
    console.log('⚠️ Wise no disponible, intentando BCP...');
    const bcpRate = await fetchExchangeRateFromBCP();
    if (bcpRate) {
      console.log('✅ Usando tipo de cambio del BCP (oficial)');
      return bcpRate;
    }
    
    // 3. Intentar Wisercoin (mercado local)
    console.log('⚠️ BCP no disponible, intentando Wisercoin...');
    const wisercoinRate = await fetchExchangeRateFromWisercoin();
    if (wisercoinRate) {
      console.log('✅ Usando tipo de cambio de Wisercoin (mercado local)');
      return wisercoinRate;
    }
    
    // 4. Usar Open Exchange Rates (internacional)
    console.log('⚠️ Wisercoin no disponible, usando Open Exchange Rates...');
    const response = await fetch('https://open.er-api.com/v6/latest/USD');

    if (!response.ok) {
      console.error('❌ Error fetching exchange rate from API:', response.statusText);
      return null;
    }

    const data: ExchangeRateAPIResponse = await response.json();

    if (data.result !== 'success') {
      console.error('❌ API returned error:', data);
      return null;
    }

    const pygRate = data.rates?.PYG;

    if (!pygRate) {
      console.error('❌ PYG rate not found in API response');
      return null;
    }

    console.log(`✅ Exchange rate from Open Exchange Rates: 1 USD = ${pygRate.toFixed(2)} PYG`);
    console.log(`📅 Last update: ${data.time_last_update_utc}`);
    console.log(`📅 Next update: ${data.time_next_update_utc}`);

    return pygRate;

  } catch (error) {
    console.error('❌ Error fetching exchange rate from API:', error);
    return null;
  }
}

/**
 * API alternativa usando fixer.io (requiere API key gratuita)
 * Más precisa pero requiere registro
 */
export async function fetchExchangeRateFromFixer(apiKey: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.fixer.io/latest?access_key=${apiKey}&base=USD&symbols=PYG`);

    if (!response.ok) {
      console.error('❌ Error fetching from Fixer API:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.success) {
      console.error('❌ Fixer API error:', data.error);
      return null;
    }

    const pygRate = data.rates?.PYG;

    if (!pygRate) {
      console.error('❌ PYG rate not found in Fixer response');
      return null;
    }

    console.log(`✅ Exchange rate from Fixer: 1 USD = ${pygRate.toFixed(2)} PYG`);
    return pygRate;

  } catch (error) {
    console.error('❌ Error fetching from Fixer API:', error);
    return null;
  }
}

/**
 * API de Wisercoin - API paraguaya con tipo de cambio local
 * Proporciona datos actualizados del mercado paraguayo
 * Fuente: https://wisercoin.com/api
 */
export async function fetchExchangeRateFromWisercoin(): Promise<number | null> {
  try {
    // API gratuita de Wisercoin para obtener tasas de cambio en Paraguay
    const response = await fetch('https://wisercoin.com/api/v1/rates/latest');

    if (!response.ok) {
      console.error('❌ Error fetching from Wisercoin API:', response.statusText);
      return null;
    }

    const data = await response.json();

    // Wisercoin proporciona tasas de compra y venta
    // Usamos el promedio para ser más preciso
    const usdBuy = data.rates?.USD_PYG?.buy;
    const usdSell = data.rates?.USD_PYG?.sell;

    if (!usdBuy || !usdSell) {
      console.error('❌ USD/PYG rates not found in Wisercoin response');
      return null;
    }

    // Calcular el promedio entre compra y venta
    const avgRate = (parseFloat(usdBuy) + parseFloat(usdSell)) / 2;

    console.log(`✅ Exchange rate from Wisercoin (Paraguay):`);
    console.log(`   Compra: ${usdBuy} PYG`);
    console.log(`   Venta: ${usdSell} PYG`);
    console.log(`   Promedio: ${avgRate.toFixed(2)} PYG`);

    return avgRate;

  } catch (error) {
    console.error('❌ Error fetching from Wisercoin:', error);
    return null;
  }
}

/**
 * API de Wise - Tasa de cambio real del mercado
 * Wise proporciona tasas de cambio reales sin márgenes ocultos
 * Fuente: https://wise.com/gb/currency-converter/usd-to-pyg-rate
 */
export async function fetchExchangeRateFromWise(): Promise<number | null> {
  try {
    console.log('💸 Intentando obtener tipo de cambio desde Wise...');
    
    // API pública de Wise para obtener tasas de cambio
    const response = await fetch('https://api.wise.com/v1/rates?source=USD&target=PYG');
    
    if (!response.ok) {
      console.error('❌ Error al conectar con Wise API:', response.statusText);
      return null;
    }

    const data = await response.json();
    
    // Wise devuelve un array de tasas, tomamos la primera
    if (Array.isArray(data) && data.length > 0) {
      const rate = data[0]?.rate;
      
      if (rate && !isNaN(rate) && rate > 0) {
        console.log(`✅ Tipo de cambio desde Wise: 1 USD = ${rate.toFixed(2)} PYG`);
        console.log(`📊 Tasa real del mercado sin comisiones ocultas`);
        return rate;
      }
    }
    
    console.log('⚠️ No se pudo extraer el tipo de cambio de Wise');
    return null;

  } catch (error) {
    console.error('❌ Error obteniendo tipo de cambio de Wise:', error);
    return null;
  }
}

/**
 * Web scraping del Banco Central del Paraguay (BCP)
 * Obtiene el tipo de cambio oficial desde el sitio web del BCP
 * Nota: No es una API oficial, puede fallar si cambia el sitio
 */
export async function fetchExchangeRateFromBCP(): Promise<number | null> {
  try {
    console.log('🏦 Intentando obtener tipo de cambio desde BCP (web scraping)...');
    
    // URL del BCP con cotizaciones
    const response = await fetch('https://www.bcp.gov.py/webapps/web/cotizacion/monedas-mensual');
    
    if (!response.ok) {
      console.error('❌ Error al conectar con BCP:', response.statusText);
      return null;
    }

    const html = await response.text();
    
    // Buscar el valor del dólar en el HTML
    // El BCP muestra "Dólar Estadounidense" con su valor
    const regex = /Dólar\s+Estadounidense.*?(\d+[,.]?\d*)/i;
    const match = html.match(regex);
    
    if (match && match[1]) {
      // Convertir formato paraguayo (7.300,50) a formato JS (7300.50)
      const rate = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
      
      if (!isNaN(rate) && rate > 0) {
        console.log(`✅ Tipo de cambio desde BCP: 1 USD = ${rate.toFixed(2)} PYG`);
        return rate;
      }
    }
    
    console.log('⚠️ No se pudo extraer el tipo de cambio del sitio del BCP');
    return null;

  } catch (error) {
    console.error('❌ Error en web scraping del BCP:', error);
    return null;
  }
}