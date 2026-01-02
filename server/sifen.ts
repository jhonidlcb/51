import crypto from 'crypto';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import forge from 'node-forge';
import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';

const parseXML = promisify(parseString) as (xml: string, options?: any) => Promise<any>;

interface CertificadoData {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  certificateChain: forge.pki.Certificate[];
}

let certificadoCache: CertificadoData | null = null;

interface SIFENConfig {
  idCSC: string;
  csc: string;
  certificadoPath?: string;
  certificadoPassword?: string;
  wsdlUrl: string;
  ambiente: 'test' | 'production';
}

interface ItemFactura {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  montoTotal: number;
  ivaAfectacion: 1 | 2 | 3 | 4;
  tasaIVA?: 0 | 5 | 10;
}

interface FacturaElectronicaData {
  ruc: string;
  razonSocial: string;
  timbrado: string;
  numeroFactura: string;
  fechaEmision: Date;
  fechaInicioTimbrado?: Date;
  direccionEmisor?: string;
  telefonoEmisor?: string;
  emailEmisor?: string;
  actividadEconomicaCodigo?: string;
  actividadEconomicaDescripcion?: string;
  departamentoEmisor?: string;
  ciudadEmisor?: string;
  clienteRuc?: string;
  clienteDocumento: string;
  clienteTipoDocumento: 'CI' | 'Pasaporte' | 'Otro';
  clienteNombre: string;
  clienteDireccion?: string;
  clienteCiudad?: string;
  clienteDepartamento?: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  items: ItemFactura[];
  montoTotal: number;
  montoTotalPYG: number;
  tipoMoneda: 'PYG' | 'USD';
  tipoCambio?: number;
  condicionOperacion?: 'contado' | 'credito';
  plazoCredito?: number;
  indicadorPresencia?: 1 | 2 | 3;
}

const SIFEN_CONFIG: SIFENConfig = {
  idCSC: process.env.SIFEN_ID_CSC || '1',
  csc: process.env.SIFEN_CSC || 'ABCD0000000000000000000000000000',
  certificadoPath: process.env.SIFEN_CERTIFICADO_PATH,
  certificadoPassword: process.env.SIFEN_CERTIFICADO_PASSWORD,
  wsdlUrl: process.env.SIFEN_WSDL_URL || 'https://sifen-test.set.gov.py/de/ws/sync/recibe',
  ambiente: (process.env.SIFEN_AMBIENTE as 'test' | 'production') || 'test'
};

function calcularDV(ruc: string): string {
  const baseMax = 11;
  let k = 2;
  let total = 0;
  
  const rucLimpio = ruc.replace(/\D/g, '');
  
  for (let i = rucLimpio.length - 1; i >= 0; i--) {
    if (k > baseMax) k = 2;
    total += parseInt(rucLimpio[i]) * k;
    k++;
  }
  
  const resto = total % 11;
  const dv = resto > 1 ? 11 - resto : 0;
  
  return dv.toString();
}

function generarCDC(
  ruc: string,
  dv: string,
  establecimiento: string,
  puntoExpedicion: string,
  numero: string,
  tipoDocumento: string,
  fechaEmision: Date
): string {
  const tipoEmision = '1';
  const fecha = fechaEmision.toISOString().slice(0, 10).replace(/-/g, '');
  const rucPadded = ruc.padStart(8, '0');
  const dvPadded = dv.padStart(1, '0');
  const estabPadded = establecimiento.padStart(3, '0');
  const puntoExpPadded = puntoExpedicion.padStart(3, '0');
  const numeroPadded = numero.padStart(7, '0');
  const tipoDocPadded = tipoDocumento.padStart(2, '0');
  
  const codigoSeguridad = Math.floor(Math.random() * 99999999999).toString().padStart(11, '0');
  
  const cdc = `${tipoEmision}${fecha}${rucPadded}${dvPadded}${estabPadded}${puntoExpPadded}${numeroPadded}${tipoDocPadded}${codigoSeguridad}`;
  
  return cdc;
}

function calcularDVCDC(cdc: string): string {
  const baseMax = 11;
  let k = 2;
  let total = 0;
  
  for (let i = cdc.length - 1; i >= 0; i--) {
    if (k > baseMax) k = 2;
    total += parseInt(cdc[i]) * k;
    k++;
  }
  
  const resto = total % 11;
  const dv = resto > 1 ? 11 - resto : 0;
  
  return dv.toString();
}

function escaparXML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cargarCertificado(): CertificadoData | null {
  if (certificadoCache) {
    return certificadoCache;
  }

  const certificadoPath = SIFEN_CONFIG.certificadoPath;
  const certificadoPassword = SIFEN_CONFIG.certificadoPassword;

  if (!certificadoPath || !certificadoPassword) {
    console.log('⚠️ No se configuraron credenciales de certificado PFX');
    console.log('⚠️ Modo TEST: Se generará XML sin firma digital real');
    return null;
  }

  try {
    if (!fs.existsSync(certificadoPath)) {
      console.error(`❌ Archivo de certificado no encontrado: ${certificadoPath}`);
      return null;
    }

    console.log('🔐 Cargando certificado PFX:', certificadoPath);
    const pfxData = fs.readFileSync(certificadoPath);
    
    const p12Der = pfxData.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificadoPassword);

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const keyBagArray = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (!keyBagArray || keyBagArray.length === 0) {
      throw new Error('No se encontró clave privada en el certificado PFX');
    }

    const certBagArray = certBags[forge.pki.oids.certBag];
    if (!certBagArray || certBagArray.length === 0) {
      throw new Error('No se encontró certificado en el archivo PFX');
    }

    const privateKey = keyBagArray[0].key as forge.pki.rsa.PrivateKey;
    const certificate = certBagArray[0].cert;
    
    if (!certificate) {
      throw new Error('El certificado está vacío');
    }
    
    const certificateChain = certBagArray
      .map(bag => bag.cert)
      .filter((cert): cert is forge.pki.Certificate => cert !== undefined);

    console.log('✅ Certificado PFX cargado correctamente');
    console.log('📋 Subject:', certificate.subject.getField('CN')?.value || 'N/A');
    console.log('📋 Emisor:', certificate.issuer.getField('CN')?.value || 'N/A');
    console.log('📋 Válido desde:', certificate.validity.notBefore);
    console.log('📋 Válido hasta:', certificate.validity.notAfter);

    certificadoCache = {
      privateKey,
      certificate,
      certificateChain
    };

    return certificadoCache;
  } catch (error: any) {
    console.error('❌ Error al cargar certificado PFX:', error.message);
    console.error('📋 Stack:', error.stack);
    return null;
  }
}

function generarQR(cdc: string, fechaEmision: Date, rucReceptor: string, totalGral: number, totalIVA: number, cantItems: number, digestValue: string, idCSC: string, cHashQR: string): string {
  const baseUrl = SIFEN_CONFIG.ambiente === 'production' 
    ? 'https://ekuatia.set.gov.py/consultas/qr'
    : 'https://ekuatia.set.gov.py/consultas-test/qr';
  
  const fechaHex = Buffer.from(fechaEmision.toISOString().slice(0, 19)).toString('hex');
  const digestHex = Buffer.from(digestValue).toString('hex');
  
  const params = new URLSearchParams({
    nVersion: '150',
    Id: cdc,
    dFeEmiDE: fechaHex,
    dRucRec: rucReceptor || '00000000',
    dTotGralOpe: Math.round(totalGral).toString(),
    dTotIVA: Math.round(totalIVA).toString(),
    cItems: cantItems.toString(),
    DigestValue: digestHex,
    IdCSC: idCSC.padStart(4, '0'),
    cHashQR: cHashQR
  });
  
  return `${baseUrl}?${params.toString()}`;
}

export function generarXMLFacturaElectronica(data: FacturaElectronicaData): string {
  const [establecimiento, puntoExpedicion, numero] = data.numeroFactura.split('-');
  const rucLimpio = data.ruc.replace(/\D/g, '');
  const dv = calcularDV(rucLimpio);
  const cdc = generarCDC(
    rucLimpio,
    dv,
    establecimiento,
    puntoExpedicion,
    numero,
    '01',
    data.fechaEmision
  );
  
  const dvCDC = calcularDVCDC(cdc);
  const codigoSeguridad = cdc.slice(-11);
  
  const fechaEmisionISO = data.fechaEmision.toISOString().slice(0, 19);
  const fechaEmisionFecha = data.fechaEmision.toISOString().slice(0, 10);
  const fechaInicioTimbrado = data.fechaInicioTimbrado 
    ? data.fechaInicioTimbrado.toISOString().slice(0, 10)
    : fechaEmisionFecha;
  
  let subExento = 0;
  let subExonerado = 0;
  let sub5 = 0;
  let sub10 = 0;
  let liquidacionIVA5 = 0;
  let liquidacionIVA10 = 0;
  let baseGravada5 = 0;
  let baseGravada10 = 0;
  
  data.items.forEach(item => {
    const montoItem = data.tipoMoneda === 'PYG' ? item.montoTotal : item.montoTotal * (data.tipoCambio || 1);
    
    if (item.ivaAfectacion === 1 && item.tasaIVA === 10) {
      const base = montoItem / 1.10;
      baseGravada10 += base;
      sub10 += montoItem;
      liquidacionIVA10 += montoItem - base;
    } else if (item.ivaAfectacion === 1 && item.tasaIVA === 5) {
      const base = montoItem / 1.05;
      baseGravada5 += base;
      sub5 += montoItem;
      liquidacionIVA5 += montoItem - base;
    } else if (item.ivaAfectacion === 2) {
      subExonerado += montoItem;
    } else if (item.ivaAfectacion === 3) {
      subExento += montoItem;
    }
  });
  
  const totalIVA = liquidacionIVA5 + liquidacionIVA10;
  const totalOperacion = subExento + subExonerado + sub5 + sub10;
  const totalGeneral = data.tipoMoneda === 'PYG' ? data.montoTotalPYG : data.montoTotalPYG;
  
  const clienteRucLimpio = data.clienteRuc ? data.clienteRuc.replace(/\D/g, '') : '';
  const clienteDV = clienteRucLimpio ? calcularDV(clienteRucLimpio) : '';
  
  const indicadorPresencia = data.indicadorPresencia || 2;
  const descIndicadorPresencia = indicadorPresencia === 1 ? 'Operación presencial' : 
                                  indicadorPresencia === 2 ? 'Operación electrónica' :
                                  'Operación telepresencial';
  
  const condicionOp = data.condicionOperacion || 'contado';
  const iCondOpe = condicionOp === 'contado' ? 1 : 2;
  const dCondOpe = condicionOp === 'contado' ? 'Contado' : 'Crédito';
  
  const itemsXML = data.items.map((item, index) => {
    const precioUnitario = item.precioUnitario;
    const montoTotal = item.montoTotal;
    const cantidadFormateada = item.cantidad.toFixed(4);
    
    let baseGravIVA = 0;
    let liqIVAItem = 0;
    let tasaIVA = item.tasaIVA || 0;
    let desAfecIVA = 'Exento';
    
    if (item.ivaAfectacion === 1) {
      desAfecIVA = 'Gravado IVA';
      if (tasaIVA === 10) {
        baseGravIVA = montoTotal / 1.10;
        liqIVAItem = montoTotal - baseGravIVA;
      } else if (tasaIVA === 5) {
        baseGravIVA = montoTotal / 1.05;
        liqIVAItem = montoTotal - baseGravIVA;
      }
    } else if (item.ivaAfectacion === 2) {
      desAfecIVA = 'Exonerado';
    } else if (item.ivaAfectacion === 3) {
      desAfecIVA = 'Exento';
    } else if (item.ivaAfectacion === 4) {
      desAfecIVA = 'Gravado parcial (Grav-Exento)';
    }
    
    return `      <gCamItem>
        <dCodInt>${escaparXML(item.codigo || (index + 1).toString())}</dCodInt>
        <dDesProSer>${escaparXML(item.descripcion)}</dDesProSer>
        <cUniMed>77</cUniMed>
        <dDesUniMed>UNI</dDesUniMed>
        <dCantProSer>${cantidadFormateada}</dCantProSer>
        <gValorItem>
          <dPUniProSer>${precioUnitario.toFixed(2)}</dPUniProSer>
          <dTotBruOpeItem>${montoTotal.toFixed(2)}</dTotBruOpeItem>
          <gValorRestaItem>
            <dDescItem>0</dDescItem>
            <dPorcDesIt>0</dPorcDesIt>
            <dDescGloItem>0</dDescGloItem>
            <dTotOpeItem>${montoTotal.toFixed(2)}</dTotOpeItem>
          </gValorRestaItem>
        </gValorItem>
        <gCamIVA>
          <iAfecIVA>${item.ivaAfectacion}</iAfecIVA>
          <dDesAfecIVA>${desAfecIVA}</dDesAfecIVA>
          <dPropIVA>100</dPropIVA>
          <dTasaIVA>${tasaIVA}</dTasaIVA>
          <dBasGravIVA>${baseGravIVA.toFixed(0)}</dBasGravIVA>
          <dLiqIVAItem>${liqIVAItem.toFixed(0)}</dLiqIVAItem>
        </gCamIVA>
      </gCamItem>`;
  }).join('\n');
  
  const pagoXML = condicionOp === 'contado' 
    ? `        <gPaConEIni>
          <iTiPago>1</iTiPago>
          <dDesTiPag>Efectivo</dDesTiPag>
          <dMonTiPag>${data.montoTotal.toFixed(2)}</dMonTiPag>
          <cMoneTiPag>${data.tipoMoneda}</cMoneTiPag>
          <dDMoneTiPag>${data.tipoMoneda === 'USD' ? 'Dólar Americano' : 'Guaraní'}</dDMoneTiPag>
          <dTiCamTiPag>${data.tipoCambio ? data.tipoCambio.toFixed(4) : '1.0000'}</dTiCamTiPag>
        </gPaConEIni>`
    : `        <gPagCred>
          <iCondCred>1</iCondCred>
          <dDCondCred>Plazo</dDCondCred>
          <dPlazoCre>${data.plazoCredito || 30}</dPlazoCre>
        </gPagCred>`;
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ekuatia.set.gov.py/sifen/xsd siRecepDE_v150.xsd">
  <dVerFor>150</dVerFor>
  <DE Id="${cdc}">
    <dDVId>${dvCDC}</dDVId>
    <dFecFirma>${fechaEmisionISO}</dFecFirma>
    <dSisFact>1</dSisFact>
    <gOpeDE>
      <iTipEmi>1</iTipEmi>
      <dDesTipEmi>Normal</dDesTipEmi>
      <dCodSeg>${codigoSeguridad}</dCodSeg>
      <dInfoEmi>SoftwarePar</dInfoEmi>
      <dInfoFisc></dInfoFisc>
    </gOpeDE>
    <gTimb>
      <iTiDE>1</iTiDE>
      <dDesTiDE>Factura electrónica</dDesTiDE>
      <dNumTim>${data.timbrado}</dNumTim>
      <dEst>${establecimiento}</dEst>
      <dPunExp>${puntoExpedicion}</dPunExp>
      <dNumDoc>${numero}</dNumDoc>
      <dFeIniT>${fechaInicioTimbrado}</dFeIniT>
    </gTimb>
    <gDatGralOpe>
      <dFeEmiDE>${fechaEmisionISO}</dFeEmiDE>
      <gOpeCom>
        <iTipTra>1</iTipTra>
        <dDesTipTra>Venta de mercadería</dDesTipTra>
        <iTImp>1</iTImp>
        <dDesTImp>IVA</dDesTImp>
        <cMoneOpe>${data.tipoMoneda}</cMoneOpe>
        <dDesMoneOpe>${data.tipoMoneda === 'USD' ? 'Dólar Americano' : 'Guaraní'}</dDesMoneOpe>
        <dCondTiCam>${data.tipoCambio ? data.tipoCambio.toFixed(4) : '1.0000'}</dCondTiCam>
      </gOpeCom>
      <gEmis>
        <dRucEm>${rucLimpio}</dRucEm>
        <dDVEmi>${dv}</dDVEmi>
        <iTipCont>2</iTipCont>
        <cTipReg>8</cTipReg>
        <dNomEmi>${escaparXML(data.razonSocial)}</dNomEmi>
        <dNomFanEmi>SoftwarePar</dNomFanEmi>
        <dDirEmi>${escaparXML(data.direccionEmisor || 'Asunción')}</dDirEmi>
        <dNumCas>0</dNumCas>
        <cDepEmi>1</cDepEmi>
        <dDesDepEmi>CAPITAL</dDesDepEmi>
        <cCiuEmi>1</cCiuEmi>
        <dDesCiuEmi>ASUNCION (DISTRITO)</dDesCiuEmi>
        <dTelEmi>${data.telefonoEmisor || '021000000'}</dTelEmi>
        <dEmailE>${data.emailEmisor || 'info@softwarepar.com'}</dEmailE>
        <gActEco>
          <cActEco>${data.actividadEconomicaCodigo || '620900'}</cActEco>
          <dDesActEco>${escaparXML(data.actividadEconomicaDescripcion || 'Desarrollo de software')}</dDesActEco>
        </gActEco>
      </gEmis>
      <gDatRec>
        <iNatRec>${clienteRucLimpio ? '2' : '1'}</iNatRec>
        <iTiOpe>1</iTiOpe>
        <cPaisRec>PRY</cPaisRec>
        <dDesPaisRe>Paraguay</dDesPaisRe>
        <iTiContRec>${clienteRucLimpio ? '2' : '1'}</iTiContRec>
        ${clienteRucLimpio ? `<dRucRec>${clienteRucLimpio}</dRucRec>` : ''}
        ${clienteRucLimpio ? `<dDVRec>${clienteDV}</dDVRec>` : ''}
        ${!clienteRucLimpio ? `<iTipIDRec>1</iTipIDRec>` : ''}
        ${!clienteRucLimpio ? `<dDTipIDRec>Cédula paraguaya</dDTipIDRec>` : ''}
        ${!clienteRucLimpio ? `<dNumIDRec>${escaparXML(data.clienteDocumento)}</dNumIDRec>` : ''}
        <dNomRec>${escaparXML(data.clienteNombre)}</dNomRec>
        <dDirRec>${escaparXML(data.clienteDireccion || 'N/A')}</dDirRec>
        <dNumCasRec>0</dNumCasRec>
        <cDepRec>1</cDepRec>
        <dDesDepRec>CAPITAL</dDesDepRec>
        <cDisRec>1</cDisRec>
        <dDesDisRec>ASUNCION (DISTRITO)</dDesDisRec>
        <cCiuRec>1</cCiuRec>
        <dDesCiuRec>${escaparXML(data.clienteCiudad || 'ASUNCION (DISTRITO)')}</dDesCiuRec>
        <dTelRec>${data.clienteTelefono || '021000000'}</dTelRec>
      </gDatRec>
    </gDatGralOpe>
    <gDtipDE>
      <gCamFE>
        <iIndPres>${indicadorPresencia}</iIndPres>
        <dDesIndPres>${descIndicadorPresencia}</dDesIndPres>
      </gCamFE>
      <gCamCond>
        <iCondOpe>${iCondOpe}</iCondOpe>
        <dDCondOpe>${dCondOpe}</dDCondOpe>
${pagoXML}
      </gCamCond>
${itemsXML}
    </gDtipDE>
    <gTotSub>
      <dSubExe>${Math.round(subExento)}</dSubExe>
      <dSubExo>${Math.round(subExonerado)}</dSubExo>
      <dSub5>${Math.round(sub5)}</dSub5>
      <dSub10>${Math.round(sub10)}</dSub10>
      <dTotOpe>${Math.round(totalOperacion)}</dTotOpe>
      <dTotDesc>0</dTotDesc>
      <dTotDescGlotem>0</dTotDescGlotem>
      <dTotAntItem>0</dTotAntItem>
      <dTotAnt>0</dTotAnt>
      <dPorcDescTotal>0</dPorcDescTotal>
      <dDescTotal>0</dDescTotal>
      <dAnticipo>0</dAnticipo>
      <dRedon>0</dRedon>
      <dTotGralOpe>${Math.round(totalGeneral)}</dTotGralOpe>
      <dIVA5>${Math.round(liquidacionIVA5)}</dIVA5>
      <dIVA10>${Math.round(liquidacionIVA10)}</dIVA10>
      <dLiqTotIVA5>${Math.round(liquidacionIVA5)}</dLiqTotIVA5>
      <dLiqTotIVA10>${Math.round(liquidacionIVA10)}</dLiqTotIVA10>
      <dTotIVA>${Math.round(totalIVA)}</dTotIVA>
      <dBaseGrav5>${Math.round(baseGravada5)}</dBaseGrav5>
      <dBaseGrav10>${Math.round(baseGravada10)}</dBaseGrav10>
      <dTBasGraIVA>${Math.round(baseGravada5 + baseGravada10)}</dTBasGraIVA>
      <dTotalGs>${Math.round(totalGeneral)}</dTotalGs>
    </gTotSub>
  </DE>
</rDE>`;

  return xml;
}

export function firmarXML(xml: string, csc: string, idCSC: string): { xmlFirmado: string; digestValue: string; cHashQR: string } {
  const deMatch = xml.match(/<DE Id="([^"]+)"[\s\S]*?<\/DE>/);
  if (!deMatch) {
    throw new Error('No se pudo extraer el elemento DE del XML');
  }
  
  const deElement = deMatch[0];
  const cdc = deMatch[1];
  
  const digestValue = crypto.createHash('sha256').update(deElement, 'utf8').digest('base64');
  
  const qrData = `${cdc}|${idCSC}|${csc}`;
  const cHashQR = crypto.createHash('sha256').update(qrData, 'utf8').digest('hex');
  
  const cdcMatch = xml.match(/Id="([^"]+)"/);
  const fechaMatch = xml.match(/<dFeEmiDE>([^<]+)<\/dFeEmiDE>/);
  const rucRecMatch = xml.match(/<dRucRec>([^<]+)<\/dRucRec>/) || xml.match(/<dNumIDRec>([^<]+)<\/dNumIDRec>/);
  const totalMatch = xml.match(/<dTotGralOpe>([^<]+)<\/dTotGralOpe>/);
  const ivaMatch = xml.match(/<dTotIVA>([^<]+)<\/dTotIVA>/);
  const itemsMatch = xml.match(/<gCamItem>/g);
  
  if (!cdcMatch || !fechaMatch || !totalMatch || !ivaMatch) {
    throw new Error('Faltan elementos requeridos en el XML para generar el QR');
  }
  
  const fechaEmision = new Date(fechaMatch[1]);
  const rucReceptor = rucRecMatch ? rucRecMatch[1] : '00000000';
  const totalGral = parseFloat(totalMatch[1]);
  const totalIVA = parseFloat(ivaMatch[1]);
  const cantItems = itemsMatch ? itemsMatch.length : 0;
  
  const urlQR = generarQR(
    cdcMatch[1],
    fechaEmision,
    rucReceptor,
    totalGral,
    totalIVA,
    cantItems,
    digestValue,
    idCSC,
    cHashQR
  );
  
  const certificado = cargarCertificado();
  
  let signatureValue = 'SIN_CERTIFICADO_DIGITAL';
  let certificadoBase64 = '';
  
  if (certificado) {
    try {
      console.log('🔐 Firmando XML con certificado digital...');
      
      // Paso 1: Construir el bloque SignedInfo que será firmado
      const signedInfoXML = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
      <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <Reference URI="#${cdc}">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <DigestValue>${digestValue}</DigestValue>
      </Reference>
    </SignedInfo>`;
      
      // Paso 2: Crear hash SHA-256 del SignedInfo
      const md = forge.md.sha256.create();
      md.update(signedInfoXML, 'utf8');
      
      // Paso 3: FIRMAR con RSA-SHA-256 usando la CLAVE PRIVADA del certificado PFX
      // Esta es la firma digital real que valida la autenticidad del documento
      const signature = certificado.privateKey.sign(md);
      signatureValue = forge.util.encode64(signature);
      
      // Paso 4: Extraer el certificado X.509 en formato DER y convertir a Base64
      // Este certificado permite a SIFEN verificar la firma
      const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificado.certificate)).getBytes();
      certificadoBase64 = forge.util.encode64(certDer);
      
      console.log('✅ XML firmado digitalmente con RSA-SHA256');
      console.log('📋 Longitud de firma:', signatureValue.length, 'caracteres');
      console.log('📋 Certificado X.509 incluido');
      console.log('📋 Algoritmo de canonicalización:', 'http://www.w3.org/2001/10/xml-exc-c14n#');
      console.log('📋 Método de firma:', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
      console.log('📋 Validación: Firma básica XML-DSig (sin XAdES-BES completo)');
    } catch (error: any) {
      console.error('❌ Error al firmar XML:', error.message);
      console.log('⚠️ Continuando sin firma digital');
      signatureValue = 'SIN_CERTIFICADO_DIGITAL';
      certificadoBase64 = '';
    }
  } else {
    console.log('⚠️ Generando XML sin firma digital (modo test)');
    console.log('ℹ️  Para producción, configure SIFEN_CERTIFICADO_PATH y SIFEN_CERTIFICADO_PASSWORD');
  }
  
  const keyInfoXML = certificadoBase64 
    ? `    <KeyInfo>
      <X509Data>
        <X509Certificate>${certificadoBase64}</X509Certificate>
      </X509Data>
    </KeyInfo>`
    : '';
  
  const signatureXML = `  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
      <Reference URI="#${cdc}">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <DigestValue>${digestValue}</DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue>${signatureValue}</SignatureValue>
${keyInfoXML}
  </Signature>
  <gCamFuFD>
    <dCarQR>${escaparXML(urlQR)}</dCarQR>
  </gCamFuFD>
</rDE>`;

  const xmlFirmado = xml.replace('</rDE>', signatureXML);
  
  return { xmlFirmado, digestValue, cHashQR };
}

export async function enviarFacturaSIFEN(xmlFirmado: string): Promise<{
  success: boolean;
  protocoloAutorizacion?: string;
  estado?: 'aceptado' | 'rechazado' | 'pendiente';
  mensajeError?: string;
  respuestaCompleta?: any;
}> {
  try {
    console.log('📋 Preparando envío a SIFEN...');
    console.log('📋 Ambiente:', SIFEN_CONFIG.ambiente);
    console.log('📋 Endpoint:', SIFEN_CONFIG.wsdlUrl);
    
    const xmlBase64 = Buffer.from(xmlFirmado, 'utf-8').toString('base64');
    
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <rEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd">
      <dId>01</dId>
      <xDE>${xmlBase64}</xDE>
    </rEnviDe>
  </soap:Body>
</soap:Envelope>`;

    console.log('📤 Enviando DE a SIFEN...');
    console.log('📋 Tamaño del XML:', xmlFirmado.length, 'bytes');
    console.log('📋 Endpoint:', SIFEN_CONFIG.wsdlUrl);
    console.log('📋 IdCSC:', SIFEN_CONFIG.idCSC);
    
    const response = await fetch(SIFEN_CONFIG.wsdlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://ekuatia.set.gov.py/sifen/xsd/rEnviDe"',
        'Accept': 'text/xml',
        'User-Agent': 'SoftwarePar-SIFEN-Client/1.0'
      },
      body: soapEnvelope
    });

    const responseText = await response.text();
    console.log('📥 Respuesta SIFEN - Status:', response.status);
    console.log('📥 Content-Type:', response.headers.get('content-type'));
    
    // Detectar si es una página HTML en lugar de SOAP
    if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
      console.error('❌ SIFEN retornó HTML en lugar de SOAP');
      console.error('❌ Posibles causas:');
      console.error('   1. Credenciales CSC incorrectas o inactivas');
      console.error('   2. IP no autorizada (requiere whitelist en SIFEN)');
      console.error('   3. Endpoint incorrecto o servicio caído');
      console.error('   4. Sesión expirada o autenticación fallida');
      
      throw new Error('SIFEN rechazó la conexión - retornó página de logout en lugar de servicio SOAP');
    }

    if (!response.ok) {
      console.error('❌ SIFEN retornó error HTTP:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!responseText.includes('<?xml') && !responseText.includes('<soap')) {
      console.error('❌ Respuesta no es XML válido');
      console.error('📋 Primeros 500 caracteres:', responseText.substring(0, 500));
      throw new Error(`SIFEN retornó respuesta no XML. Status: ${response.status}`);
    }

    const result: any = await parseXML(responseText, { 
      explicitArray: false,
      ignoreAttrs: false,
      trim: true
    });
    
    console.log('📋 XML parseado correctamente');

    const envelope = result['soap:envelope'] || result['soapenv:envelope'] || result.envelope || result['env:envelope'];
    if (!envelope) {
      console.error('❌ No se encontró el envelope SOAP');
      throw new Error('Estructura de respuesta SIFEN inválida: falta envelope');
    }

    const body = envelope['soap:body'] || envelope['soapenv:body'] || envelope.body || envelope['env:body'];
    if (!body) {
      console.error('❌ No se encontró el body SOAP');
      throw new Error('Estructura de respuesta SIFEN inválida: falta body');
    }

    const respuesta = body.renvideresp || body.renvideresp || body.rEnviDeResp;
    if (!respuesta) {
      console.log('📋 Body completo:', JSON.stringify(body, null, 2));
      console.error('❌ No se encontró rEnviDeResp en la respuesta');
      
      const fault = body['soap:fault'] || body.fault;
      if (fault) {
        const faultString = fault.faultstring || fault.message || 'Error SOAP desconocido';
        throw new Error(`SOAP Fault: ${faultString}`);
      }
      
      throw new Error('Estructura de respuesta SIFEN no reconocida');
    }

    console.log('📋 Respuesta SIFEN parseada:', JSON.stringify(respuesta, null, 2).substring(0, 1000));

    const nroLote = respuesta.dnslote || respuesta.dNsLote || respuesta.xcontrec?.['dnslote'];
    const codigoResultado = respuesta.dcodres || respuesta.dCodRes || respuesta.xcontrec?.['dcodres'] || 'desconocido';
    const mensaje = respuesta.dmsgres || respuesta.dMsgRes || respuesta.xcontrec?.['dmsgres'];
    
    const codigosAprobados = ['0260', '0261', '0262', '0300', '0301'];
    const codigosPendientes = ['0300', '0301', '0302'];
    const aceptado = codigosAprobados.includes(codigoResultado.toString());
    const pendiente = codigosPendientes.includes(codigoResultado.toString());

    const estadoFinal = aceptado ? 'aceptado' : (pendiente ? 'pendiente' : 'rechazado');

    console.log(`${aceptado ? '✅' : pendiente ? '⏳' : '❌'} SIFEN: ${estadoFinal.toUpperCase()}`);
    console.log(`📊 Código: ${codigoResultado} - ${mensaje || 'Sin mensaje'}`);
    if (nroLote) console.log(`📦 Número de Lote: ${nroLote}`);

    return {
      success: aceptado,
      protocoloAutorizacion: nroLote || undefined,
      estado: estadoFinal,
      mensajeError: !aceptado ? (mensaje || `Código de resultado: ${codigoResultado}`) : undefined,
      respuestaCompleta: respuesta
    };

  } catch (error: any) {
    console.error('❌ Error al enviar factura a SIFEN:', error.message);
    console.error('📋 Stack:', error.stack);
    
    return {
      success: false,
      estado: 'rechazado',
      mensajeError: error.message || 'Error desconocido al comunicarse con SIFEN'
    };
  }
}

export async function procesarFacturaElectronica(data: FacturaElectronicaData): Promise<{
  success: boolean;
  cdc?: string;
  protocoloAutorizacion?: string;
  estado?: 'aceptado' | 'rechazado' | 'pendiente';
  mensajeError?: string;
  xmlGenerado: string;
  urlQR?: string;
}> {
  console.log('🔄 ========================================');
  console.log('🔄 Iniciando proceso de factura electrónica SIFEN');
  console.log('🔄 ========================================');
  console.log('📊 Datos:', {
    ruc: data.ruc,
    numeroFactura: data.numeroFactura,
    cliente: data.clienteNombre,
    monto: data.montoTotal,
    moneda: data.tipoMoneda
  });
  
  try {
    console.log('📝 Generando XML según especificación SIFEN v150...');
    const xml = generarXMLFacturaElectronica(data);
    console.log('✅ XML generado exitosamente');
    console.log('📋 Longitud del XML:', xml.length, 'caracteres');
    
    const cdcMatch = xml.match(/Id="([^"]+)"/);
    const cdc = cdcMatch ? cdcMatch[1] : undefined;
    console.log('🔑 CDC generado:', cdc);
    
    console.log('🔐 Firmando XML...');
    const { xmlFirmado, digestValue, cHashQR } = firmarXML(xml, SIFEN_CONFIG.csc, SIFEN_CONFIG.idCSC);
    console.log('✅ XML firmado exitosamente');
    console.log('📋 DigestValue:', digestValue.substring(0, 50) + '...');
    
    const qrMatch = xmlFirmado.match(/<dCarQR>([^<]+)<\/dCarQR>/);
    const urlQR = qrMatch ? qrMatch[1].replace(/&amp;/g, '&') : undefined;
    console.log('📱 URL QR generada:', urlQR?.substring(0, 100) + '...');
    
    console.log('📤 Enviando a SIFEN...');
    const resultadoEnvio = await enviarFacturaSIFEN(xmlFirmado);
    
    console.log('🔄 ========================================');
    console.log(`📊 RESULTADO FINAL: ${resultadoEnvio.success ? '✅ EXITOSO' : '❌ FALLIDO'}`);
    console.log('🔄 ========================================');
    
    return {
      ...resultadoEnvio,
      cdc,
      xmlGenerado: xmlFirmado,
      urlQR
    };
    
  } catch (error: any) {
    console.error('❌ Error en procesarFacturaElectronica:', error.message);
    console.error('📋 Stack:', error.stack);
    
    return {
      success: false,
      estado: 'rechazado',
      mensajeError: error.message || 'Error desconocido al procesar factura electrónica',
      xmlGenerado: '',
      cdc: undefined
    };
  }
}

export function validarDatosFactura(data: FacturaElectronicaData): { valido: boolean; errores: string[] } {
  const errores: string[] = [];
  
  if (!data.ruc || data.ruc.length < 3) {
    errores.push('RUC del emisor es requerido');
  }
  
  if (!data.razonSocial || data.razonSocial.trim().length === 0) {
    errores.push('Razón social del emisor es requerida');
  }
  
  if (!data.timbrado || data.timbrado.length !== 8) {
    errores.push('Timbrado debe tener 8 dígitos');
  }
  
  if (!data.numeroFactura || !data.numeroFactura.match(/^\d{3}-\d{3}-\d{7}$/)) {
    errores.push('Número de factura debe tener formato 001-001-0000001');
  }
  
  if (!data.clienteNombre || data.clienteNombre.trim().length === 0) {
    errores.push('Nombre del cliente es requerido');
  }
  
  if (!data.clienteDocumento || data.clienteDocumento.trim().length === 0) {
    errores.push('Documento del cliente es requerido');
  }
  
  if (!data.items || data.items.length === 0) {
    errores.push('Debe incluir al menos un item');
  }
  
  data.items.forEach((item, index) => {
    if (!item.descripcion || item.descripcion.trim().length === 0) {
      errores.push(`Item ${index + 1}: descripción es requerida`);
    }
    if (item.cantidad <= 0) {
      errores.push(`Item ${index + 1}: cantidad debe ser mayor a 0`);
    }
    if (item.precioUnitario <= 0) {
      errores.push(`Item ${index + 1}: precio unitario debe ser mayor a 0`);
    }
    if (![1, 2, 3, 4].includes(item.ivaAfectacion)) {
      errores.push(`Item ${index + 1}: afectación IVA inválida (1=Gravado, 2=Exonerado, 3=Exento, 4=Parcial)`);
    }
  });
  
  if (data.montoTotal <= 0) {
    errores.push('Monto total debe ser mayor a 0');
  }
  
  return {
    valido: errores.length === 0,
    errores
  };
}
