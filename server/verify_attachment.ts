
import { enviarFacturaFacturaSend, extraerResultadoFacturaSend, type FacturaSendDocumento } from "./facturasend";

async function verifyWithAttachment() {
  console.log("🚀 Verificando con datos de la nueva documentación...");
  
  // Basado en el ejemplo de la imagen adjunta:
  // "precioUnitario": 10800, "ivaTipo": 1, "ivaBase": 100, "iva": 5 
  // Esto es MUY extraño para Paraguay (IVA 5% de 100 es 5, pero el total sería 105, no 10800).
  // Es probable que el ejemplo de la imagen use valores arbitrarios para mostrar la estructura.
  
  // Intentaremos con el valor REAL del usuario (912500) pero asegurándonos de que
  // ivaBase + iva = precioUnitario * cantidad exactamente.
  
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
      razonSocial: 'ALFA GROUP STORE TEST',
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
      descripcion: 'Item Verificado SIFEN',
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
    console.log("RESULTADO:" + JSON.stringify(response));
    if (response.success) process.exit(0);
    else process.exit(1);
  } catch (err) {
    process.exit(1);
  }
}

verifyWithAttachment();
