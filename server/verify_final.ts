import { enviarFacturaFacturaSend, extraerResultadoFacturaSend, type FacturaSendDocumento } from "./facturasend";

async function verifyFinal() {
  console.log("🚀 Verificación Final de FacturaSend...");
  
  const total = 912500;
  const iva = Math.round(total / 11); // 82955
  const ivaBase = total - iva; // 829545

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
      contribuyente: true,
      razonSocial: 'ALFA GROUP STORE',
      tipoOperacion: 1,
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
      tipoContribuyente: 2,
      ruc: '80000000-1'
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
      entregas: [{ tipo: 9, monto: total, moneda: 'PYG' }]
    },
    items: [{
      descripcion: 'Verificacion Final SoftwarePar',
      cantidad: 1,
      unidadMedida: 77,
      precioUnitario: total,
      ivaTipo: 1,
      ivaBase: ivaBase,
      iva: iva,
      ivaProporcion: 100
    }]
  };

  try {
    const response = await enviarFacturaFacturaSend(documento);
    console.log("RESULTADO_JSON:" + JSON.stringify(response));
    if (response.success) {
      console.log("✅ EXITOSO");
      process.exit(0);
    } else {
      console.log("❌ RECHAZADO");
      process.exit(1);
    }
  } catch (err) {
    console.error("Error de red");
    process.exit(1);
  }
}

verifyFinal();