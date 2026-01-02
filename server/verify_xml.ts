
import { enviarFacturaFacturaSend, extraerResultadoFacturaSend, type FacturaSendDocumento } from "./facturasend";

async function verifyXMLValues() {
  console.log("🚀 Verificando con valores exactos del XML adjunto...");
  
  // Basado en el XML: 
  // dPUniProSer: 221875
  // dTotOpeItem: 221875
  // iAfecIVA: 3 (Exento)
  // dTotGralOpe: 221875
  
  const montoTotal = 221875;
  
  const documento: FacturaSendDocumento = {
    tipoDocumento: 1,
    establecimiento: 1,
    punto: 1,
    numero: Math.floor(Math.random() * 900000) + 100000,
    fecha: new Date().toISOString().split('.')[0],
    tipoEmision: 1,
    tipoTransaccion: 2,
    tipoImpuesto: 1,
    moneda: 'PYG',
    cliente: {
      contribuyente: false,
      razonSocial: 'Consumidor Final',
      tipoOperacion: 2,
      direccion: 'Asuncion',
      numeroCasa: '0',
      departamento: 1,
      departamentoDescripcion: 'CAPITAL',
      distrito: 1,
      distritoDescripcion: 'ASUNCION',
      ciudad: 1,
      ciudadDescripcion: 'ASUNCION',
      pais: 'PRY',
      paisDescripcion: 'Paraguay',
      ruc: '44444401-7'
    },
    usuario: {
      documentoTipo: 1,
      documentoNumero: '4220058',
      nombre: 'BENITEZ DE LA CRUZ JHONI FABIAN',
      cargo: 'Propietario'
    },
    factura: { presencia: 2 },
    condicion: {
      tipo: 1,
      entregas: [{ tipo: 9, monto: montoTotal, moneda: 'PYG' }]
    },
    items: [{
      descripcion: 'Prueba XML SoftwarePar',
      cantidad: 1,
      unidadMedida: 77,
      precioUnitario: montoTotal,
      ivaTipo: 3, // Exento como en el XML
      ivaBase: 0,
      iva: 0,
      ivaProporcion: 0
    }]
  };

  try {
    const response = await enviarFacturaFacturaSend(documento);
    console.log("RESULTADO:" + JSON.stringify(response));
    if (response.success) {
       console.log("✅ EXITOSO CON VALORES XML");
       process.exit(0);
    } else {
       console.log("❌ RECHAZADO");
       process.exit(1);
    }
  } catch (err) {
    process.exit(1);
  }
}

verifyXMLValues();
