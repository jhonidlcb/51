import type { FacturaSendDocumento, FacturaSendResponse } from "./facturasend";

const FACTURASEND_CONFIG = {
  apiKey: process.env.FACTURASEND_API_KEY,
  baseUrl: 'https://api.facturasend.com.py/jhonifabianbenitezdelacruz_7451',
};

const DATOS_DENIT = {
  ruc: '4220058',
  dv: '0',
  nombre: 'BENITEZ DE LA CRUZ JHONI FABIAN',
};

export async function enviarFacturaFacturaSend(documento: FacturaSendDocumento): Promise<FacturaSendResponse> {
  try {
    const apiKey = FACTURASEND_CONFIG.apiKey;
    if (!apiKey) {
      return { success: false, error: 'API Key no configurada' };
    }

    const payload = [{
      tipoDocumento: documento.tipoDocumento,
      establecimiento: documento.establecimiento,
      punto: documento.punto,
      numero: documento.numero,
      fecha: documento.fecha,
      tipoEmision: documento.tipoEmision,
      tipoTransaccion: documento.tipoTransaccion,
      tipoImpuesto: documento.tipoImpuesto,
      moneda: documento.moneda,
      observacion: documento.observacion,
      cliente: documento.cliente,
      usuario: documento.usuario,
      factura: documento.factura,
      condicion: documento.condicion,
      items: documento.items.map(item => {
        // Construct item WITH mandatory 'iva' key as per documentation
        const total = Math.trunc(item.precioUnitario * item.cantidad);
        // FacturaSend mandatory calculation for 10% IVA (General):
        // According to SIFEN and FacturaSend's internal validator:
        // iva = ROUND(total / 11)
        // ivaBase = total - iva
        // However, we must ensure item.precioUnitario represents the unit price including tax.
        
        const iva = item.iva !== undefined ? Math.trunc(item.iva) : (item.ivaTipo === 1 ? Math.round(total / 11) : 0);
        const ivaBase = total - iva;
        return {
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidadMedida: item.unidadMedida,
          precioUnitario: item.precioUnitario,
          ivaTipo: item.ivaTipo,
          ivaBase: ivaBase,
          iva: iva,
          ivaProporcion: 100,
          ...(item.codigo ? { codigo: item.codigo } : {})
        };
      })
    }];

    // DANGEROUS: If any property was undefined, JSON.stringify might behave 
    // differently across environments or internal FacturaSend parsers.
    // We send a MINIFIED JSON string without any extra whitespace or keys.
    const jsonBody = JSON.stringify(payload);

    console.log('📦 Payload (strictest literal):', jsonBody);

    const response = await fetch(`${FACTURASEND_CONFIG.baseUrl}/lote/create?xml=true&qr=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer api_key_${apiKey}`
      },
      body: jsonBody
    });

    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function extraerResultadoFacturaSend(response: FacturaSendResponse) {
  if (!response.success || !response.result?.deList?.[0]) {
    return { 
      estado: 'rechazado', 
      mensaje: response.error || response.mensaje || 'Error' 
    };
  }
  const de = response.result.deList[0];
  return {
    cdc: de.cdc,
    qr: de.qr,
    estado: de.estado === '0-Generado' || de.cdc ? 'aceptado' : 'rechazado',
    mensaje: de.respuesta_mensaje || 'Procesado'
  };
}

export async function construirDocumentoFacturaSend(company: any, client: any, stage: any, project: any, exchangeRate: number, numero: number): Promise<FacturaSendDocumento> {
  const montoTotal = Math.round(parseFloat(stage.amount) * exchangeRate);
  const iva = Math.round(montoTotal * 0.10 / 1.10);
  const ivaBase = montoTotal - iva;
  
  return {
    tipoDocumento: 1,
    establecimiento: 1,
    punto: 1,
    numero,
    fecha: new Date().toISOString().split('.')[0],
    tipoEmision: 1,
    tipoTransaccion: 2,
    tipoImpuesto: 1,
    moneda: 'PYG',
    observacion: `TC: ${exchangeRate}`,
    cliente: {
      contribuyente: true,
      razonSocial: client.legalName || 'Cliente',
      tipoOperacion: 1,
      direccion: client.address || 'Asuncion',
      numeroCasa: '0',
      departamento: 1,
      departamentoDescripcion: 'CAPITAL',
      distrito: 1,
      distritoDescripcion: 'ASUNCION',
      ciudad: 1,
      ciudadDescripcion: 'ASUNCION',
      pais: 'PRY',
      paisDescripcion: 'Paraguay',
      tipoContribuyente: 2,
      ruc: client.documentNumber
    },
    usuario: {
      documentoTipo: 1,
      documentoNumero: DATOS_DENIT.ruc,
      nombre: DATOS_DENIT.nombre,
      cargo: 'Propietario'
    },
    factura: { presencia: 2 },
    condicion: {
      tipo: 1,
      entregas: [{ tipo: 9, monto: montoTotal, moneda: 'PYG' }]
    },
    items: [{
      descripcion: stage.stageName,
      cantidad: 1,
      unidadMedida: 77,
      precioUnitario: montoTotal,
      ivaTipo: 1,
      ivaBase: ivaBase,
      iva: iva,
      ivaProporcion: 100
    }]
  };
}

export interface FacturaSendDocumento {
  tipoDocumento: number;
  establecimiento: number;
  punto: number;
  numero: number;
  fecha: string;
  tipoEmision: number;
  tipoTransaccion: number;
  tipoImpuesto: number;
  moneda: string;
  observacion?: string;
  cliente: any;
  usuario: any;
  factura: { presencia: number };
  condicion: { tipo: number; entregas: any[] };
  items: any[];
}

export interface FacturaSendResponse {
  success: boolean;
  result?: { deList: any[]; loteId: number };
  error?: string;
  mensaje?: string;
}
