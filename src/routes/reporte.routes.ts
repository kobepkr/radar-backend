import express from "express";
import { Reporte } from "../models/reporte";
import { authMiddleware, AuthRequest } from "../middlewares/auth.middleware";
import { Usuario } from "../models/Usuario";
import { io } from '../index'; 
import { verificarLimiteReportes } from "../middlewares/limiteReportes.middleware";
import { ReporteDiario } from "../models/ReporteDiario";

const router = express.Router();

console.log("🟢 Archivo reporte.routes.ts cargado");


// Mapa de categorías según el tipo de evento (CORREGIDO - incluye tipos antiguos)
const categoriaMap: { [key: string]: string } = {
  // 🚗 TIPOS ANTIGUOS (los que usa la app)
  accidente: "transito",
  delito: "seguridad",
  trafico: "transito",
  clima: "clima",
  incendio: "emergencias",
  
  // 🚗 TRANSITO (nuevos)
  embotellamiento: "transito",
  choque: "transito",
  semaforoRoto: "transito",
  calleCortada: "transito",
  
  // 🚨 SEGURIDAD (nuevos)
  asalto: "seguridad",
  actitudSospechosa: "seguridad",
  balacera: "seguridad",
  
  // 🚑 EMERGENCIAS (nuevos)
  inundacion: "emergencias",
  
  // 🏘️ COMUNIDAD (nuevos)
  bache: "comunidad",
  corteLuz: "comunidad",
  corteAgua: "comunidad"
};

// Tiempos de expiración en horas (CORREGIDO - incluye tipos antiguos)
const horasExpiracion: { [key: string]: number } = {
  // 🚗 TIPOS ANTIGUOS
  accidente: 4,
  delito: 12,
  trafico: 2,
  clima: 8,
  incendio: 12,
  
  // 🚗 TRANSITO (nuevos)
  embotellamiento: 2,
  choque: 4,
  semaforoRoto: 8,
  calleCortada: 6,
  
  // 🚨 SEGURIDAD (nuevos)
  asalto: 12,
  actitudSospechosa: 2,
  balacera: 24,
  
  // 🚑 EMERGENCIAS (nuevos)
  inundacion: 8,
  
  // 🏘️ COMUNIDAD (nuevos)
  bache: 72,
  corteLuz: 4,
  corteAgua: 6
};

// ============================================
// CREAR UN REPORTE (POST /api/reportes)
// ============================================
router.post("/", authMiddleware, verificarLimiteReportes, async (req: AuthRequest, res) => {
  try {
    const { tipo, descripcion, lat, lng } = req.body;

    // Validar que el tipo existe en el mapa
    if (!categoriaMap[tipo]) {
      return res.status(400).json({ error: "Tipo de evento no válido" });
    }

    // Calcular expiración
    const expiraEn = new Date();
    expiraEn.setHours(expiraEn.getHours() + (horasExpiracion[tipo] || 6));

    const nuevoReporte = new Reporte({
      categoria: categoriaMap[tipo],
      tipo,
      descripcion,
      ubicacion: {
        coordinates: [lng, lat]
      },
      expiraEn,
      creadoPor: req.usuario.id,
    });

    await nuevoReporte.save();

    // ✅ INCREMENTAR CONTADOR DIARIO (solo si NO es premium)
    const usuario = await Usuario.findById(req.usuario.id);
    
    if (!usuario?.premium) {
      const hoy = new Date().toISOString().split('T')[0];
      
      await ReporteDiario.findOneAndUpdate(
        { usuarioId: req.usuario.id, fecha: hoy },
        { $inc: { contador: 1 } },
        { upsert: true, new: true }
      );
      console.log(`📊 Contador incrementado para usuario ${req.usuario.id}, fecha ${hoy}`);
    } else {
      console.log(`⭐ Usuario premium ${req.usuario.id} - sin límite`);
    }

    // 👇 NOTIFICACIONES AUTOMÁTICAS (push notifications)
    try {
      // Buscar usuarios con token a menos de 5km (excluyendo al creador)
      const usuariosCerca = await Usuario.find({
        ubicacion: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [lng, lat]
            },
            $maxDistance: 5000 // 5km en metros
          }
        },
        pushToken: { $exists: true, $ne: null },
        _id: { $ne: req.usuario.id } // Excluir al creador
      });

      // Enviar notificaciones
      for (const usuario of usuariosCerca) {
        const message = {
          to: usuario.pushToken,
          sound: 'default',
          title: '🚨 Nuevo reporte cerca',
          body: `${tipo} reportado en tu zona`,
          data: { 
            reporteId: nuevoReporte._id,
            tipo,
            lat,
            lng
          }
        };

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      }
    } catch (notifError) {
      console.error('Error enviando notificaciones:', notifError);
      // No interrumpimos la creación del reporte
    }

    // 👇 EMITIR EVENTO WEBSOCKET A TODOS LOS CLIENTES
    io.emit('nuevo-reporte', nuevoReporte);
    console.log('📢 Evento WebSocket "nuevo-reporte" emitido');

    res.status(201).json(nuevoReporte);

  } catch (error) {
    console.error("❌ Error al crear reporte:", error);
    res.status(500).json({ error: "Error al crear reporte" });
  }
});

// ============================================
// OBTENER REPORTES CERCANOS (GET /api/reportes/cercanos)
// ============================================
router.get("/cercanos", async (req, res) => {
  try {
    const { lat, lng, radio = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "Latitud y longitud requeridas" });
    }

    const reportes = await Reporte.find({
      ubicacion: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)]
          },
          $maxDistance: parseFloat(radio as string) * 1000
        }
      },
      archivado: false,
      expiraEn: { $gt: new Date() }
    }).limit(50);

    res.json(reportes);

  } catch (error) {
    console.error("❌ Error al obtener reportes:", error);
    res.status(500).json({ error: "Error al obtener reportes" });
  }
});

// ============================================
// FILTRAR REPORTES (GET /api/reportes/filtros)
// ============================================
router.get("/filtros", async (req, res) => {
  try {
    const { 
      categoria, 
      tipo, 
      estado, 
      desde, 
      hasta, 
      creadoPor, 
      limit = 50,
      orden = "desc" 
    } = req.query;

    // Construir filtro dinámico
    const filtro: any = {};

    if (categoria) filtro.categoria = categoria;
    if (tipo) filtro.tipo = tipo;
    if (estado) filtro.estado = estado;
    if (creadoPor) filtro.creadoPor = creadoPor; 

    // Filtro por fechas
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gte = new Date(desde as string);
      if (hasta) filtro.createdAt.$lte = new Date(hasta as string);
    }

    // Ordenamiento
    const ordenamiento = orden === "asc" ? 1 : -1;

    // Ejecutar consulta
    const reportes = await Reporte.find(filtro)
      .sort({ createdAt: ordenamiento })
      .limit(Number(limit));

    // Respuesta con metadatos
    res.json({
      success: true,
      total: reportes.length,
      filtros: {
        categoria: categoria || "todos",
        tipo: tipo || "todos",
        estado: estado || "todos",
        desde: desde || "siempre",
        hasta: hasta || "ahora",
        limit: Number(limit),
        orden: orden === "asc" ? "más antiguos" : "más recientes"
      },
      reportes
    });

  } catch (error) {
    console.error("❌ Error en filtros:", error);
    res.status(500).json({ 
      success: false, 
      error: "Error al filtrar reportes" 
    });
  }
});

// ============================================
// OBTENER TODOS LOS REPORTES (GET /api/reportes)
// ============================================
router.get("/", async (req, res) => {
  try {
    const reportes = await Reporte.find()
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(reportes);
  } catch (error) {
    console.error("❌ Error al obtener todos los reportes:", error);
    res.status(500).json({ error: "Error al obtener reportes" });
  }
});

// ============================================
// OBTENER REPORTE POR ID (GET /api/reportes/:id)
// ============================================
router.get("/:id", async (req, res) => {
  try {
    const reporte = await Reporte.findById(req.params.id);
    if (!reporte) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }
    res.json(reporte);
  } catch (error) {
    console.error("❌ Error al obtener reporte:", error);
    res.status(500).json({ error: "Error al obtener reporte" });
  }
});

// ============================================
// CONFIRMAR REPORTE (PROTEGIDO)
// ============================================
router.post("/:id/confirmar", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reporte = await Reporte.findById(req.params.id);
    
    if (!reporte) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    // Verificar si el usuario ya confirmó
    const yaConfirmo = reporte.confirmadoPor?.includes(req.usuario.id);
    
    if (yaConfirmo) {
      return res.status(400).json({ error: "Ya confirmaste este reporte anteriormente" });
    }

    reporte.confirmaciones += 1;
    reporte.confirmadoPor?.push(req.usuario.id);
    
    if (reporte.confirmaciones >= 3) {
      reporte.estado = "confirmado";
    }

    await reporte.save();

    // 👇 EMITIR EVENTO DE CONFIRMACIÓN
    io.emit('reporte-actualizado', reporte);
    console.log(`📢 Evento "reporte-actualizado" emitido para reporte ${reporte._id}`);

    res.json(reporte);

  } catch (error) {
    console.error("❌ Error al confirmar reporte:", error);
    res.status(500).json({ error: "Error al confirmar reporte" });
  }
});


router.post("/test-notification", async (req, res) => {
  try {
    const { to, title, body, sound = 'default' } = req.body;
    
    const message = {
      to,
      sound,
      title: title || 'Radar Urbano',
      body: body || 'Notificación de prueba',
      priority: 'high',
      data: { type: 'test' },
    };

    console.log('📤 Enviando a Expo:', message);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('📱 Respuesta de Expo:', JSON.stringify(result, null, 2));

    res.json({ 
      success: true, 
      message: 'Notificación enviada', 
      expoResponse: result 
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Error al enviar notificación' });
  }
});


// ============================================
// REPORTAR COMO FALSO (PROTEGIDO)
// ============================================
router.post("/:id/reportar-falso", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reporte = await Reporte.findById(req.params.id);
    
    if (!reporte) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    reporte.reportesFalsos += 1;
    
    if (reporte.reportesFalsos >= 3) {
      reporte.estado = "falso";
      reporte.archivado = true;
    }

    await reporte.save();

    // ============================================
// HACER PREMIUM (SOLO PARA PRUEBAS)
// ============================================
router.post("/make-premium", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = await Usuario.findByIdAndUpdate(
      req.usuario.id,
      { 
        premium: true, 
        premiumDesde: new Date(),
        premiumHasta: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      },
      { new: true }
    );
    
    res.json({ 
      message: "✅ Usuario ahora es premium (modo pruebas)",
      usuario: {
        id: usuario?._id,
        nombre: usuario?.nombre,
        premium: usuario?.premium
      }
    });
  } catch (error) {
    console.error("Error haciendo premium:", error);
    res.status(500).json({ error: "Error al hacer premium" });
  }
});

// ============================================
// REACCIONAR A REPORTE (POST /api/reportes/:id/reaccionar)
// ============================================
router.post("/:id/reaccionar", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body; // 'like', 'urgente', 'peligro'
    
    // Verificar si el usuario es premium
    const usuario = await Usuario.findById(req.usuario.id);
    
    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    
    if (!usuario.premium) {
      return res.status(403).json({ 
        error: "Solo usuarios premium pueden reaccionar a reportes",
        es_premium: false
      });
    }
    
    // Buscar reporte
    const reporte = await Reporte.findById(id);
    
    if (!reporte) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }
    
    // Tipos válidos de reacción
    const tiposValidos = ['like', 'urgente', 'peligro'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: "Tipo de reacción no válido" });
    }
    
    // ✅ INICIALIZAR reacciones si no existe
    if (!reporte.reacciones) {
      reporte.reacciones = { like: 0, urgente: 0, peligro: 0 };
    }
    
    // ✅ INCREMENTAR según el tipo
    if (tipo === 'like') {
      reporte.reacciones.like = (reporte.reacciones.like || 0) + 1;
    } else if (tipo === 'urgente') {
      reporte.reacciones.urgente = (reporte.reacciones.urgente || 0) + 1;
    } else if (tipo === 'peligro') {
      reporte.reacciones.peligro = (reporte.reacciones.peligro || 0) + 1;
    }
    
    await reporte.save();
    
    // Emitir evento WebSocket para actualizar en tiempo real
    io.emit('reporte-actualizado', reporte);
    console.log(`📢 Reacción ${tipo} agregada al reporte ${id}`);
    
    res.json({ 
      success: true, 
      reacciones: reporte.reacciones,
      mensaje: `👍 Reacción ${tipo} agregada`
    });
    
  } catch (error) {
    console.error("❌ Error al reaccionar:", error);
    res.status(500).json({ error: "Error al reaccionar al reporte" });
  }
});



    // 👇 EMITIR EVENTO DE ACTUALIZACIÓN (igual que con confirmar)
    io.emit('reporte-actualizado', reporte);
    console.log(`📢 Evento "reporte-actualizado" emitido para reporte falso ${reporte._id}`);

    res.json(reporte);

  } catch (error) {
    console.error("❌ Error al reportar como falso:", error);
    res.status(500).json({ error: "Error al reportar como falso" });
  }
});
export default router;